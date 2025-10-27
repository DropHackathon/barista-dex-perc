# PositionDetails Integration Notes

## Changes Required in execute_cross_slab.rs

### 1. Function Signature Changes

Add optional PositionDetails account parameter:
```rust
pub fn process_execute_cross_slab(
    // ... existing params ...
    position_details_account: Option<&AccountInfo>,  // NEW: Optional for backward compat
    program_id: &Pubkey,  // NEW: Needed for PDA derivation
    // ... existing params ...
)
```

### 2. Position Update Flow (Lines 405-428)

**Current Flow:**
```rust
let current_exposure = user_portfolio.get_exposure(slab_idx, instrument_idx);
let realized_pnl = calculate_realized_pnl(
    current_exposure,
    filled_qty,
    split.side,
    vwap_px,
    split.limit_px,  // ❌ WRONG - using current trade's price as entry
);
user_portfolio.update_exposure(slab_idx, instrument_idx, new_exposure);
```

**New Flow:**
```rust
let current_exposure = user_portfolio.get_exposure(slab_idx, instrument_idx);

// Fetch or create PositionDetails
let mut position_details = if let Some(pd_account) = position_details_account {
    // Deserialize existing
    load_position_details(pd_account)?
} else {
    // Create new if this is first trade for this position
    None
};

// Calculate realized PnL using ACTUAL entry price from PositionDetails
let realized_pnl = if let Some(ref details) = position_details {
    // Use stored entry price ✓
    details.calculate_pnl_for_trade(filled_qty, vwap_px, split.side)
} else {
    // First trade - no realized PnL
    0
};

// Update PositionDetails
if current_exposure == 0 {
    // Opening new position
    position_details = Some(PositionDetails::new(
        user_portfolio_pda,
        slab_idx,
        instrument_idx,
        vwap_px,  // entry price
        new_exposure,
        timestamp,
        bump,
    ));
} else if (current_exposure > 0 && new_exposure > current_exposure) ||
          (current_exposure < 0 && new_exposure < current_exposure) {
    // Adding to position
    details.add_to_position(vwap_px, filled_qty, fee, timestamp);
} else {
    // Reducing position
    let (pnl, remaining) = details.reduce_position(vwap_px, filled_qty, fee, timestamp);
    realized_pnl = pnl;
}

user_portfolio.update_exposure(slab_idx, instrument_idx, new_exposure);

// Save updated PositionDetails
if new_exposure == 0 {
    // Close PDA - refund rent
    close_position_details_account(position_details_account)?;
} else {
    // Save updated details
    save_position_details(position_details_account, &position_details)?;
}
```

### 3. Account Handling Functions

Need to add:
- `load_position_details(account: &AccountInfo) -> Result<PositionDetails, Error>`
- `save_position_details(account: &AccountInfo, details: &PositionDetails) -> Result<(), Error>`
- `create_position_details_pda(...)` - Use System Program to create account
- `close_position_details_pda(...)` - Close and refund rent

### 4. Backward Compatibility

- Make PositionDetails account OPTIONAL in v0
- If not provided, fall back to old (broken) PnL calculation
- This allows gradual migration

### 5. Testing Strategy

1. Test with PositionDetails account provided
2. Test without (backward compat)
3. Test position lifecycle: open → add → reduce → close
4. Test PnL calculations match expected values

## Implementation Status

- [ ] Add helper functions for account operations
- [ ] Modify position update loop to use PositionDetails
- [ ] Add PDA creation logic
- [ ] Add PDA close logic
- [ ] Update entrypoint to accept new account
- [ ] Test on localnet

## Notes

- This is a large change that touches critical trading logic
- Need to be extremely careful with PnL calculations
- Consider splitting into multiple smaller commits
- Each commit should compile and pass tests
