# Margin Return Implementation Plan

## Problem Statement

**CRITICAL BUG**: User collateral is not returned when positions close.

### Current Broken Flow

1. **Position Open**: User margin → DLP portfolio ✅
2. **Position Close**: Only PnL transferred via `settle_pnl()` ❌
3. **Result**: Original margin stuck in DLP forever ❌

### Example Bug Scenario

```
User opens: 5 contracts at 5x leverage
- Transfers 1 SOL margin to DLP ✅

Price unchanged, user closes position:
- realized_pnl = 0
- settle_pnl() returns early (line 696)
- No SOL transfer happens
- User's 1 SOL stuck in DLP ❌
```

## Solution Overview

Track per-position margin in `PositionDetails` and return it on close.

### Changes Made (✅ Completed)

**PositionDetails struct** - Added margin tracking:
- `margin_held: u128` - total margin in DLP for this position
- `leverage: u8` - leverage used (1-10x)
- Uses 17 of 24 reserved bytes

**Methods updated**:
- `new()` - accepts `initial_margin` and `leverage`
- `add_to_position()` - accepts `additional_margin`, accumulates
- `reduce_position()` - returns `(pnl, remaining_qty, margin_to_release)`

## Implementation Tasks

### Phase 1: Router Program Updates

#### 1.1 Update execute_cross_slab.rs - Position Open/Increase

**File**: `programs/router/src/instructions/execute_cross_slab.rs`

**Location**: Lines 456-505 (when `same_direction || current_exposure == 0`)

**Changes needed**:

```rust
// Line 460: Pass margin and leverage when creating new PositionDetails
PositionDetails::new(
    *user_portfolio_account.key(),
    slab_idx,
    instrument_idx,
    vwap_px,
    filled_qty,
    timestamp,
    bump,
    margin_lamports,  // ADD THIS
    leverage,          // ADD THIS
)

// Line 483: Pass margin when adding to existing position
position_details.add_to_position(
    vwap_px,
    filled_qty,
    0i128,
    timestamp,
    margin_lamports,  // ADD THIS
);
```

**Note**: `margin_lamports` is already calculated at line 494!

#### 1.2 Update execute_cross_slab.rs - Position Close/Reduce

**File**: `programs/router/src/instructions/execute_cross_slab.rs`

**Location**: Lines 506-525 (when reducing position)

**Changes needed**:

```rust
// Line 513: Update to get margin_to_release
let (pnl, new_qty, margin_to_release) = position_details.reduce_position(
    vwap_px,
    filled_qty,
    0i128,
    timestamp
);

// After line 525, before settle_pnl:
// Return margin from DLP → User
if margin_to_release > 0 {
    return_margin_to_user(
        user_portfolio_account,
        user_portfolio,
        dlp_portfolio_account,
        dlp_portfolio,
        margin_to_release,
    )?;
}

// Then settle PnL as usual (line 542-550)
```

#### 1.3 Create return_margin_to_user() Function

**File**: `programs/router/src/instructions/execute_cross_slab.rs`

**Location**: After `settle_pnl()` function (after line 746)

**Implementation**:

```rust
/// Return margin collateral from DLP to user when closing/reducing position
fn return_margin_to_user(
    user_portfolio_account: &AccountInfo,
    user_portfolio: &mut Portfolio,
    dlp_portfolio_account: &AccountInfo,
    dlp_portfolio: &mut Portfolio,
    margin_lamports: u128,
) -> Result<(), PercolatorError> {
    if margin_lamports == 0 {
        return Ok(());
    }

    let margin = margin_lamports as u64;

    // Check DLP has sufficient lamports
    if dlp_portfolio_account.lamports() < margin {
        msg!("Error: DLP portfolio insufficient SOL to return margin");
        return Err(PercolatorError::InsufficientFunds);
    }

    // Transfer SOL from DLP to User (reverse of transfer_collateral_margin)
    *dlp_portfolio_account.try_borrow_mut_lamports()
        .map_err(|_| PercolatorError::InsufficientFunds)? -= margin;
    *user_portfolio_account.try_borrow_mut_lamports()
        .map_err(|_| PercolatorError::InsufficientFunds)? += margin;

    // Update equity tracking
    let margin_i128 = margin as i128;
    dlp_portfolio.equity = dlp_portfolio.equity.saturating_sub(margin_i128);
    user_portfolio.equity = user_portfolio.equity.saturating_add(margin_i128);

    // Update principal tracking (DLP returned, user received)
    dlp_portfolio.principal = dlp_portfolio.principal.saturating_sub(margin_i128);
    user_portfolio.principal = user_portfolio.principal.saturating_sub(margin_i128);

    msg!("Margin collateral returned to user");
    Ok(())
}
```

**Note**: This is the reverse of `transfer_collateral_margin()` at lines 748-785.

#### 1.4 Update liquidate_user.rs

**File**: `programs/router/src/instructions/liquidate_user.rs`

**Location**: Line 261 (where execute_cross_slab is called)

**Change**: Already passes leverage=10, no changes needed for liquidations.

### Phase 2: CLI Updates

#### 2.1 Update Portfolio Display

**File**: `cli-client/src/commands/router/portfolio.ts`

**Location**: Lines 175-200 (PositionDetails reading)

**Changes needed**:

```typescript
// Update offsets for new fields:
// - margin_held (u128): 16 bytes at offset 80
// - leverage (u8): 1 byte at offset 96

const marginHeldOffset = 80;
const leverageOffset = 96;

// Read i128 as two i64s for margin_held
const marginLow = data.readBigInt64LE(marginHeldOffset);
const marginHigh = data.readBigInt64LE(marginHeldOffset + 8);
const marginHeld = new BN(marginLow.toString()); // Use low 64 bits

const leverage = data.readUInt8(leverageOffset);
```

**Location**: Lines 253-267 (notional and leverage calculation)

**Changes needed**:

```typescript
// Replace placeholder leverage calculation with actual data
if (!markPrice.isZero() && !exp.positionQty.isZero()) {
    // Notional = position_qty × mark_price / 1e6
    const notionalValue = exp.positionQty.abs().mul(markPrice).div(new BN(1_000_000));
    notional = formatAmount(notionalValue);

    // Now we have actual margin and leverage from PositionDetails!
    if (marginHeld.gt(new BN(0))) {
        // Convert margin from lamports to units (divide by 1000)
        const marginUnits = marginHeld.div(new BN(1000));

        // Effective leverage = notional / margin
        const effectiveLev = notionalValue.mul(new BN(1000)).div(marginUnits).toNumber() / 1000;
        effectiveLeverage = effectiveLev.toFixed(1) + 'x';
    }
}
```

**Location**: Line 119 (table headers)

**Change**: Already updated to include 'Notional' and 'Leverage' columns ✅

### Phase 3: Testing

#### 3.1 Test Scenarios

**Test 1: Full Position Close (Breakeven)**
```
1. Open 5 contracts at 5x leverage
   - Expected: 1 SOL → DLP
2. Price unchanged
3. Close entire position
   - Expected: 1 SOL returned from DLP → User
   - Expected: User equity back to ~50 SOL
```

**Test 2: Full Position Close (Profit)**
```
1. Open 5 contracts at 5x leverage at $200
   - Expected: 1 SOL → DLP
2. Price rises to $210
3. Close entire position
   - Expected: 1 SOL margin returned DLP → User
   - Expected: ~0.25 SOL profit transferred DLP → User
   - Expected: User receives ~1.25 SOL total
```

**Test 3: Full Position Close (Loss)**
```
1. Open 5 contracts at 5x leverage at $200
   - Expected: 1 SOL → DLP
2. Price drops to $190
3. Close entire position
   - Expected: 1 SOL margin returned DLP → User
   - Expected: ~0.25 SOL loss transferred User → DLP
   - Expected: User receives ~0.75 SOL total
```

**Test 4: Partial Position Close**
```
1. Open 10 contracts at 5x leverage
   - Expected: 2 SOL → DLP
2. Close 5 contracts (50%)
   - Expected: 1 SOL margin returned DLP → User
   - Expected: 1 SOL margin remains in DLP for remaining position
3. Close remaining 5 contracts
   - Expected: 1 SOL margin returned DLP → User
```

**Test 5: Position Increase Then Close**
```
1. Open 5 contracts at 5x
   - Expected: 1 SOL → DLP
2. Add 5 more contracts at 5x
   - Expected: 1 additional SOL → DLP (total 2 SOL in DLP)
3. Close all 10 contracts
   - Expected: 2 SOL returned DLP → User
```

#### 3.2 Validation Commands

```bash
# Check user portfolio before/after
node dist/index.js portfolio --keypair ~/.config/solana/trader7.json --network localnet

# Check DLP portfolio before/after
node dist/index.js portfolio --keypair ~/.config/solana/dlp1.json --network localnet

# Verify lamport changes match expected margin movements
solana account <user-portfolio-pda> --url localhost
solana account <dlp-portfolio-pda> --url localhost
```

### Phase 4: Documentation

#### 4.1 Update SDK README

**File**: `sdk/README.md`

**Location**: Section 3 (Leverage Trading)

**Add subsection**: "Collateral Lifecycle"

```markdown
#### Collateral Lifecycle

**Position Open/Increase:**
1. Calculate margin: `(quantity × 1e9) / leverage` lamports
2. Transfer margin: User Portfolio → DLP Portfolio
3. Store in PositionDetails.margin_held
4. Track leverage in PositionDetails.leverage

**Position Close/Reduce:**
1. Calculate PnL: `qty_closed × (exit_price - entry_price)`
2. Return margin: DLP Portfolio → User Portfolio
   - Full close: return all margin_held
   - Partial close: return proportional margin
3. Settle PnL: Transfer profit/loss between portfolios

**Example - Breakeven Trade:**
```typescript
// Open: 5 contracts at 5x = 1 SOL margin
// - User: 50 SOL → 49 SOL
// - DLP:  50 SOL → 51 SOL

// Close: Price unchanged, PnL = 0
// - Margin returned: 1 SOL (DLP → User)
// - PnL settled: 0 SOL
// - User: 49 SOL → 50 SOL ✅
// - DLP:  51 SOL → 50 SOL ✅
```

**Example - Profitable Trade:**
```typescript
// Open: 5 contracts at $200, 5x = 1 SOL margin
// Close: At $210, PnL = +0.25 SOL
// - Margin returned: 1 SOL (DLP → User)
// - PnL settled: 0.25 SOL (DLP → User)
// - User receives: 1.25 SOL total ✅
```
```

## Risk Analysis

### What Could Go Wrong

1. **Proportional margin calculation error** (partial close)
   - Could return too much or too little margin
   - Mitigated by: Clear formula with 1e6 scaling

2. **Margin tracking desync** (add_to_position bug)
   - margin_held doesn't match actual lamports transferred
   - Mitigated by: Testing with multiple add/reduce cycles

3. **DLP insufficient funds** when returning margin
   - DLP could have withdrawn equity, can't return margin
   - Mitigated by: Check in `return_margin_to_user()` before transfer

4. **Principal tracking** (accounting issue)
   - User principal decreases on open, but should it increase on close?
   - Current: principal -= margin on return
   - TODO: Verify principal accounting is correct

### Breaking Changes

**PositionDetails PDA accounts created before this update**:
- Will have `margin_held = 0` and `leverage = 0`
- Old positions won't return margin on close
- **Mitigation**: Deploy to fresh localnet, or migrate existing positions

**Recommendation**: This is a critical bug fix. Deploy ASAP to testnet/devnet before mainnet.

## Implementation Order

1. ✅ Update PositionDetails struct (DONE)
2. ⬜ Update execute_cross_slab.rs - position open (pass margin/leverage)
3. ⬜ Update execute_cross_slab.rs - position close (get margin_to_release)
4. ⬜ Create return_margin_to_user() function
5. ⬜ Build and deploy router program
6. ⬜ Update CLI portfolio display to read margin/leverage
7. ⬜ Test all 5 scenarios
8. ⬜ Update SDK documentation
9. ⬜ Publish updated packages

## Timeline Estimate

- Router program updates: 30 minutes
- Testing: 1 hour
- CLI updates: 30 minutes
- Documentation: 30 minutes
- **Total: 2.5 hours**

## Success Criteria

- [ ] User equity returns to starting value on breakeven trades
- [ ] Margin + PnL both transfer correctly on close
- [ ] Partial closes return proportional margin
- [ ] CLI displays actual leverage from PositionDetails
- [ ] All 5 test scenarios pass
- [ ] Documentation updated

---

**Status**: Phase 1.1 - Ready to implement router program changes
**Priority**: CRITICAL - Blocking bug preventing users from recovering collateral
**Next Step**: Update execute_cross_slab.rs position open to pass margin/leverage
