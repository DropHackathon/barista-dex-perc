# PnL Tracking Implementation Plan

**Date**: 2025-01-27
**Version**: v0.5
**Status**: Design Proposal

## Problem Statement

Currently, the Barista DEX router does **NOT track PnL at all** - neither realized nor unrealized:

### Current Issues:

1. **No Entry Price Tracking**: The `Portfolio.exposures` array only stores `(slab_idx, instrument_idx, position_qty)` - no entry price
2. **Broken Realized PnL Calculation**: When closing positions, the code uses the **closing trade's price** as the entry price
   - See: `programs/router/src/instructions/execute_cross_slab.rs:414`
   - Code: `split.limit_px // Use limit price as approximate entry price` ❌ WRONG!
   - Result: `realized_pnl = qty × (close_price - close_price) ≈ 0`
   - Line 570 updates: `portfolio.pnl += 0` (adding zero!)
3. **Realized PnL Always Zero**: Even though code updates `portfolio.pnl` (line 570), the calculated value is always ≈ 0
4. **No Unrealized PnL**: Open positions have no way to calculate mark-to-market PnL
5. **Portfolio.pnl Field Completely Broken**: Always shows 0 for all users

### What Users See:

```
Unrealized PnL: 0.000000  ← Should show actual unrealized PnL
Realized PnL: 0.000000    ← Should show accumulated realized PnL from closed trades
Position: 2.0 BTC-PERP @ current $202.25
Notional Value: $404.69
Entry Price: ??? (not tracked)
Actual PnL: ??? (can't calculate - entry price unknown)
```

### Example of Broken Behavior:

**Scenario:**
1. User opens long 2.0 BTC @ $200 (trade 1)
2. Price moves to $210
3. User closes 2.0 BTC @ $210 (trade 2)

**Current Calculation (WRONG):**
```rust
realized_pnl = calculate_realized_pnl(
    current_exposure: 2.0,
    filled_qty: -2.0,
    side: 1,  // sell
    vwap_px: 210,      // trade 2 execution price ✓
    split.limit_px: 210  // trade 2 limit price ❌ Should be 200!
);
// Result: 2.0 × ($210 - $210) = $0 ❌ COMPLETELY WRONG
```

**Correct Calculation (SHOULD BE):**
```rust
// Should use entry price from when position was opened
realized_pnl = 2.0 × ($210 - $200) = $20 ✓
```

**Impact:** Users making profitable trades show $0 PnL!

## Root Cause Analysis

### Why Entry Prices Aren't Tracked:

The `Portfolio` struct is already at **12,176 bytes**. Adding an `i64` entry price to each exposure would increase it to ~16KB, exceeding Solana's practical 10KB limit:

```rust
// Current: 12 bytes per entry
pub exposures: [(u16, u16, i64); MAX_SLABS * MAX_INSTRUMENTS], // 512 slots

// With entry_price: 20 bytes per entry → +4KB = 16KB total ❌ Too large
pub exposures: [(u16, u16, i64, i64); MAX_SLABS * MAX_INSTRUMENTS],
```

## Design Goals

1. **Zero Impact on Core Structures**: Don't modify `Portfolio` struct size
2. **Accurate PnL Tracking**: Both realized and unrealized
3. **Efficient Storage**: Only allocate for active positions (sparse storage)
4. **Backward Compatible**: Existing portfolios continue working
5. **Gas Efficient**: Minimal compute overhead

## Proposed Solution: Position Details PDA

### Architecture

Create a separate **PositionDetails** PDA for each active position:

```
PDA Seeds: ["position", portfolio_pda, slab_index, instrument_index]
Size: ~128 bytes per position
Created: On position open
Closed: On position close (refund rent)
```

### Data Structure

```rust
#[repr(C)]
pub struct PositionDetails {
    /// Magic bytes for validation
    pub magic: u64,

    /// Portfolio this position belongs to
    pub portfolio: Pubkey,

    /// Slab index
    pub slab_index: u16,

    /// Instrument index
    pub instrument_index: u16,

    /// Padding
    pub _padding1: [u8; 4],

    /// Weighted average entry price (1e6 scale)
    /// Updated on position increases
    pub avg_entry_price: i64,

    /// Total quantity (should match Portfolio.exposures)
    pub total_qty: i64,

    /// Realized PnL for this position (accumulated)
    pub realized_pnl: i128,

    /// Total fees paid on this position
    pub total_fees: i128,

    /// Number of trades
    pub trade_count: u32,

    /// Last update timestamp
    pub last_update_ts: i64,

    /// Reserved for future use
    pub _reserved: [u8; 32],
}
```

**Size**: 32 + 2 + 2 + 4 + 8 + 8 + 16 + 16 + 4 + 8 + 32 = **132 bytes** ✓

### Workflow

#### Opening a Position (Buy/Sell new position):

1. Execute trade as normal
2. Check if PositionDetails PDA exists
3. If not exists:
   - Create PositionDetails PDA
   - Set `avg_entry_price = fill_price`
   - Set `total_qty = fill_qty`

#### Adding to Position (same direction):

1. Execute trade as normal
2. Fetch PositionDetails PDA
3. Update weighted average entry price:
   ```
   new_avg = (old_avg * old_qty + fill_price * fill_qty) / (old_qty + fill_qty)
   ```
4. Update `total_qty`

#### Reducing Position (opposite direction):

1. Execute trade as normal
2. Fetch PositionDetails PDA
3. Calculate realized PnL:
   ```rust
   realized_pnl = qty_closed * (exit_price - avg_entry_price)
   ```
4. Update `realized_pnl` accumulator
5. Update `total_qty`
6. If position fully closed: Close PDA and refund rent

#### Calculating Unrealized PnL (Off-chain/CLI):

```typescript
// For each position with PositionDetails:
const unrealized_pnl =
  position.total_qty * (current_mark_price - position.avg_entry_price);

// Total portfolio unrealized PnL:
const total_unrealized_pnl = positions.reduce(
  (sum, pos) => sum + calculateUnrealizedPnl(pos), 0
);
```

## Implementation Plan

### Phase 1: Add PositionDetails Account (Router Program)

**Files to Create:**
- `programs/router/src/state/position_details.rs`

**Files to Modify:**
- `programs/router/src/instructions/execute_cross_slab.rs`
- `programs/router/src/state/mod.rs`

**Changes:**

1. **Create `PositionDetails` struct** with PDA derivation
2. **Modify `execute_cross_slab`**:
   - After updating `Portfolio.exposures`, check if PositionDetails exists
   - Create/update PositionDetails with correct entry price
   - Calculate **correct** realized PnL using `avg_entry_price`
3. **Update PnL settlement** to use calculated realized PnL

**Estimated Size**: ~300 lines of new code

### Phase 2: SDK Support (TypeScript)

**Files to Modify:**
- `sdk/src/clients/RouterClient.ts`
- `sdk/src/types/router.ts`

**Changes:**

1. **Add PositionDetails type**
2. **Add methods**:
   ```typescript
   async getPositionDetails(
     portfolio: PublicKey,
     slabIndex: number,
     instrumentIndex: number
   ): Promise<PositionDetails | null>

   async getAllPositionDetails(
     portfolio: PublicKey
   ): Promise<PositionDetails[]>

   derivePositionDetailsPDA(
     portfolio: PublicKey,
     slabIndex: number,
     instrumentIndex: number
   ): [PublicKey, number]
   ```

**Estimated Size**: ~200 lines

### Phase 3: CLI Display (Portfolio Command)

**Files to Modify:**
- `cli-client/src/commands/router/portfolio.ts`

**Changes:**

1. **Fetch PositionDetails** for each position
2. **Calculate unrealized PnL**:
   ```typescript
   unrealized_pnl = qty × (mark_price - avg_entry_price)
   ```
3. **Update table** to show:
   - Position Qty
   - Avg Entry Price
   - Current Price
   - Unrealized PnL
   - Realized PnL (from PositionDetails)
   - Total PnL

**Expected Output:**
```
📍 Trading Positions

┌─────────┬────────────┬─────────────┬─────────────┬───────────────┬──────────────┬───────────────┐
│ Slab    │ Position   │ Avg Entry   │ Mark Price  │ Unrealized    │ Realized     │ Total PnL     │
│         │ Qty        │ Price       │             │ PnL           │ PnL          │               │
├─────────┼────────────┼─────────────┼─────────────┼───────────────┼──────────────┼───────────────┤
│ 4dUTGx… │ 2.000950   │ $200.000000 │ $202.250000 │ +$4.502137    │ $0.000000    │ +$4.502137    │
└─────────┴────────────┴─────────────┴─────────────┴───────────────┴──────────────┴───────────────┘

Portfolio Summary:
  Total Unrealized PnL: +$4.502137
  Total Realized PnL: $0.000000
  Total PnL: +$4.502137
```

**Estimated Size**: ~100 lines

### Phase 4: Migration & Backward Compatibility

**Strategy**: No migration needed!

- Existing portfolios without PositionDetails continue working
- PositionDetails PDAs created on-demand for new positions
- Existing positions get PositionDetails on next trade
- CLI gracefully handles missing PositionDetails (shows "—")

### Phase 5: Testing

**Test Cases:**

1. **Open new position** → PositionDetails created with entry price
2. **Add to position** → Weighted average entry price updated
3. **Reduce position** → Realized PnL calculated correctly
4. **Close position** → PositionDetails PDA closed, rent refunded
5. **Multiple positions** → Each gets separate PositionDetails
6. **CLI display** → Shows correct unrealized PnL
7. **Missing PositionDetails** → CLI handles gracefully (backward compat)

## Cost Analysis

### Storage Costs:

- **PositionDetails PDA**: 132 bytes
- **Rent**: ~0.001 SOL per position (refunded on close)
- **Max cost**: 0.001 SOL × max_positions (negligible)

### Compute Costs:

- **Create PDA**: ~5,000 CU (one-time)
- **Update PDA**: ~1,000 CU per trade
- **Weighted avg calculation**: ~100 CU
- **Total impact**: <5% increase in trade execution cost ✓

## Advantages of This Approach

1. ✅ **Zero impact on Portfolio struct** - No size increase
2. ✅ **Sparse storage** - Only allocate for active positions
3. ✅ **Rent refunded** - When positions close
4. ✅ **Accurate PnL** - Both realized and unrealized
5. ✅ **Backward compatible** - Existing portfolios work
6. ✅ **Gas efficient** - Minimal compute overhead
7. ✅ **Clean architecture** - Separation of concerns

## Alternative Approaches Considered

### ❌ Option A: Expand Portfolio.exposures to include entry_price

```rust
pub exposures: [(u16, u16, i64, i64); MAX_SLABS * MAX_INSTRUMENTS],
```

**Why Rejected**: Increases Portfolio to ~16KB, exceeds practical limits

### ❌ Option B: Store entry prices in Registry

**Why Rejected**:
- Registry is global, positions are per-user
- Would need nested maps (user → position → entry_price)
- Increases Registry size significantly

### ❌ Option C: Calculate PnL purely off-chain

**Why Rejected**:
- Can't track entry prices without on-chain storage
- Unreliable (depends on indexer/cache)
- No on-chain verification

## Timeline Estimate

| Phase | Description | Effort | Dependencies |
|-------|-------------|--------|--------------|
| 1 | Router program changes | 2-3 days | None |
| 2 | SDK support | 1 day | Phase 1 |
| 3 | CLI display | 1 day | Phase 2 |
| 4 | Testing | 1-2 days | Phases 1-3 |
| **Total** | | **5-7 days** | |

## Next Steps

1. **Review & approve** this design
2. **Implement Phase 1** (Router program)
3. **Test on localnet** with position opens/closes
4. **Implement Phases 2-3** (SDK + CLI)
5. **Integration testing**
6. **Deploy to devnet** for further testing

## Open Questions

1. **Should we track per-trade history?** (Current design: aggregate only)
2. **Should PositionDetails be optional or required?** (Current: optional for backward compat)
3. **Should we calculate unrealized PnL on-chain?** (Current: off-chain in CLI)
4. **What happens if PositionDetails PDA creation fails?** (Should trade fail or continue?)

## References

- Current Portfolio struct: `programs/router/src/state/portfolio.rs`
- Broken realized PnL: `programs/router/src/instructions/execute_cross_slab.rs:408-415`
- Registry offset fix: Previous debugging session (Session 5)

---

**Created**: 2025-01-27
**Authors**: Claude Code + seanhwang
**Status**: Awaiting approval
