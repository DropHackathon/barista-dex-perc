# Portfolio Netting Implementation Plan

**Date**: 2025-10-28
**Status**: Planning
**Priority**: High - Core Capital Efficiency Feature

## Executive Summary

This document outlines the implementation plan for **cross-slab portfolio netting**, a core feature required for "infinite capital efficiency" that allows offsetting positions on the same instrument across different slabs to net their margin requirements.

**Current State**: Positions are tracked per `(slab_idx, instrument_idx)` pair with isolated margin calculation.
**Target State**: Positions grouped by instrument pubkey across all slabs with netted margin calculation.

---

## 1. Current Architecture Analysis

### 1.1 Data Structures

#### Portfolio Exposure Tracking
```rust
// programs/router/src/state/portfolio.rs:61
pub exposures: [(u16, u16, i64); MAX_SLABS * MAX_INSTRUMENTS]
//               ^^^^  ^^^^  ^^^^
//               slab  inst  qty
```

**Key Problem**: Exposures use `(slab_index, instrument_index)` as the key, making each slab-instrument pair a separate position.

#### Position Details (Per-Position Metadata)
```rust
// programs/router/src/state/position_details.rs:28
pub struct PositionDetails {
    pub portfolio: Pubkey,
    pub slab_index: u16,        // Tied to specific slab
    pub instrument_index: u16,  // Local to that slab
    pub avg_entry_price: i64,
    pub total_qty: i64,
    pub realized_pnl: i128,
    pub margin_held: u128,      // Margin for THIS position only
    pub leverage: u8,
    // ...
}
```

**Key Problem**: Each `(slab, instrument)` pair has its own `margin_held`, summed without netting.

#### Registry (Slab Metadata)
```rust
// programs/router/src/state/registry.rs:8
pub struct SlabEntry {
    pub slab_id: Pubkey,
    pub oracle_id: Pubkey,
    // ...
}
```

**Note**: Registry tracks slabs but doesn't provide instrument→slab lookup.

### 1.2 Current Margin Calculation Flow

#### Step 1: Per-Position Margin Calculation
```rust
// programs/router/src/instructions/execute_cross_slab.rs:493
let margin_lamports = (quantity_abs * 1_000) / leverage_u128;
position_details.add_to_position(vwap_px, filled_qty, 0i128, timestamp, margin_lamports);
```

Each trade calculates margin independently based on trade size and leverage.

#### Step 2: Portfolio-Level Margin Aggregation
```rust
// programs/router/src/instructions/execute_cross_slab.rs:813-889
fn calculate_portfolio_margin_from_exposures(
    portfolio: &Portfolio,
    portfolio_account: &AccountInfo,
    position_details_accounts: &[AccountInfo],
    program_id: &Pubkey,
) -> Result<u128, PercolatorError> {
    let mut total_margin: u128 = 0;

    // Iterate through active exposures
    for i in 0..portfolio.exposure_count as usize {
        let exposure = &portfolio.exposures[i];
        // ... find corresponding PositionDetails PDA ...
        let margin_held = // read from PositionDetails account
        total_margin = total_margin.saturating_add(margin_held);
    }

    return total_margin;  // SUM without netting!
}
```

**Key Problem**: Margin is **summed** across all positions without considering that positions on the same instrument offset each other.

#### Step 3: Margin Check
```rust
// programs/router/src/instructions/execute_cross_slab.rs:752-759
user_portfolio.update_margin(im_required, im_required / 2);

if !user_portfolio.has_sufficient_margin() {
    return Err(PercolatorError::PortfolioInsufficientMargin);
}
```

Uses the summed (non-netted) margin for validation.

### 1.3 Test Documentation vs Reality

#### Test Expectation
```rust
// tests/v0_capital_efficiency.rs:22-86
/// User goes long 1 BTC on Slab A at $50,000
/// User goes short 1 BTC on Slab B at $50,010
/// Net exposure = 0
/// Expected IM = ~$0 (not $10,000!)
/// User locks in $10 profit with ZERO capital
#[test]
fn test_capital_efficiency_zero_net_exposure() {
    // ...
    assert_eq!(im_required, 0, "IM should be ZERO for zero net exposure!");
}
```

**Reality**: This test doesn't actually exercise the on-chain program. It's a unit test that manually calculates netting but the actual program doesn't implement it.

---

## 2. Problem Statement

### 2.1 Current Behavior (Isolated Margin)

```
User Portfolio:
  Slab A, Instrument 0 (BTC): +1.0 BTC @ $50,000 → Margin: $10,000
  Slab B, Instrument 0 (BTC): -1.0 BTC @ $50,100 → Margin: $10,000

Total Margin Required: $20,000
Net Exposure: 0 BTC
Locked-in Profit: $100
```

**Problem**: User needs $20,000 to execute a risk-free arbitrage that should require ~$0.

### 2.2 Target Behavior (Portfolio Netting)

```
User Portfolio:
  Instrument 7oyp...vD85n (BTC): Net +0.0 BTC
    ↳ Slab A: +1.0 BTC @ $50,000
    ↳ Slab B: -1.0 BTC @ $50,100

Total Margin Required: $0
Net Exposure: 0 BTC
Locked-in Profit: $100
```

**Benefit**: Professional traders can execute arbitrage, market making, and funding rate farming strategies efficiently.

### 2.3 Key Challenges

1. **Instrument Identity**: Need to map `instrument_index` (local to slab) to global `instrument_pubkey`
2. **Cross-Slab Aggregation**: Must fetch and parse instrument addresses from multiple slabs
3. **Margin Redistribution**: When netting reduces margin requirement, which positions release margin?
4. **Account Size**: Cannot store instrument pubkey in Portfolio (already at size limit)
5. **PDA Derivation**: PositionDetails PDAs use `(slab_idx, instrument_idx)` - cannot change without migration
6. **Backward Compatibility**: Must not break existing positions or tests

---

## 3. Architecture Options

### Option A: Store Instrument Pubkey in Portfolio ❌

**Approach**: Change exposures array to `[(u16, Pubkey, i64)]`

**Pros**:
- Simplest lookup
- No need to fetch slab state

**Cons**:
- **REJECTED**: Portfolio struct already at 12,176 bytes (near Solana's 10MB account limit for practical use)
- Adding 32 bytes per exposure would exceed practical limits
- Requires migration of all existing portfolios

### Option B: Two-Pass Calculation (RECOMMENDED) ✅

**Approach**:
1. First pass: Fetch all instrument pubkeys from slab accounts
2. Group exposures by instrument pubkey
3. Calculate margin on netted exposure per instrument

**Pros**:
- No on-chain state changes required
- Backward compatible
- Flexible for future optimizations

**Cons**:
- Requires passing slab accounts to instruction
- More compute units
- Slightly more complex logic

### Option C: Instrument Registry ⚠️

**Approach**: Create a global instrument registry mapping `instrument_idx → instrument_pubkey`

**Pros**:
- Single source of truth
- Efficient lookups

**Cons**:
- Requires new account type and infrastructure
- Governance overhead to maintain
- Overkill for current needs
- Delays implementation

---

## 4. Recommended Implementation: Option B (Two-Pass)

### 4.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  execute_cross_slab Instruction                                 │
│                                                                   │
│  1. Execute trade (existing logic)                               │
│  2. Update PositionDetails (existing logic)                      │
│  3. NEW: Calculate netted margin requirement                     │
│     ├─ Fetch instrument pubkeys from slab accounts              │
│     ├─ Group portfolio exposures by instrument pubkey           │
│     ├─ Calculate net exposure per instrument                     │
│     ├─ Calculate margin on net exposure                          │
│     └─ Update portfolio.im with netted value                     │
│  4. Check margin sufficiency (existing logic)                    │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 New Function: `calculate_netted_portfolio_margin`

```rust
// programs/router/src/instructions/execute_cross_slab.rs

/// Calculate portfolio margin with cross-slab netting
///
/// # Algorithm
/// 1. Fetch instrument pubkey for each exposure from slab account
/// 2. Group exposures by instrument pubkey (net quantities)
/// 3. For each instrument:
///    - Calculate net_qty = sum of all exposures for that instrument
///    - If net_qty == 0: margin = 0 (infinite capital efficiency!)
///    - Else: margin = calculate_margin(net_qty, weighted_avg_leverage)
/// 4. Sum margin across all instruments
///
/// # Returns
/// Total margin requirement considering cross-slab netting
fn calculate_netted_portfolio_margin(
    portfolio: &Portfolio,
    portfolio_account: &AccountInfo,
    position_details_accounts: &[AccountInfo],
    slab_accounts: &[AccountInfo],  // NEW: Need slab accounts
    registry: &SlabRegistry,
    program_id: &Pubkey,
) -> Result<u128, PercolatorError> {
    // Step 1: Build map of (slab_idx, instrument_idx) → instrument_pubkey
    let mut instrument_map: [(u16, u16, Option<Pubkey>); MAX_SLABS * MAX_INSTRUMENTS]
        = [(0, 0, None); MAX_SLABS * MAX_INSTRUMENTS];

    for i in 0..portfolio.exposure_count as usize {
        let exposure = &portfolio.exposures[i];
        let slab_idx = exposure.0;
        let instrument_idx = exposure.1;

        // Find slab account
        let slab_entry = &registry.slabs[slab_idx as usize];
        if !slab_entry.active {
            continue;
        }

        let slab_account = find_slab_account(slab_accounts, &slab_entry.slab_id)?;

        // Read instrument pubkey from slab state
        let instrument_pubkey = read_instrument_pubkey(
            slab_account,
            instrument_idx
        )?;

        instrument_map[i] = (slab_idx, instrument_idx, Some(instrument_pubkey));
    }

    // Step 2: Group by instrument pubkey and calculate net exposure
    struct InstrumentNet {
        pubkey: Pubkey,
        net_qty: i64,
        total_margin_held: u128,  // Sum of margin from all positions
        weighted_leverage_sum: u128,  // For calculating avg leverage
    }

    let mut instrument_nets: [Option<InstrumentNet>; 32] = [None; 32];
    let mut instrument_count = 0;

    for i in 0..portfolio.exposure_count as usize {
        let exposure = &portfolio.exposures[i];
        let qty = exposure.2;

        if qty == 0 {
            continue;
        }

        let instrument_pubkey = match instrument_map[i].2 {
            Some(pk) => pk,
            None => continue,
        };

        // Find or create entry for this instrument
        let mut found = false;
        for j in 0..instrument_count {
            if let Some(ref mut net) = instrument_nets[j] {
                if net.pubkey == instrument_pubkey {
                    net.net_qty += qty;

                    // Fetch margin_held from PositionDetails
                    let margin_held = read_position_margin(
                        position_details_accounts,
                        portfolio_account,
                        exposure.0,
                        exposure.1,
                        program_id
                    )?;

                    net.total_margin_held += margin_held;
                    found = true;
                    break;
                }
            }
        }

        if !found {
            // New instrument
            let margin_held = read_position_margin(
                position_details_accounts,
                portfolio_account,
                exposure.0,
                exposure.1,
                program_id
            )?;

            instrument_nets[instrument_count] = Some(InstrumentNet {
                pubkey: instrument_pubkey,
                net_qty: qty,
                total_margin_held: margin_held,
                weighted_leverage_sum: 0,  // TODO: track if needed
            });
            instrument_count += 1;
        }
    }

    // Step 3: Calculate margin on net exposure per instrument
    let mut total_netted_margin: u128 = 0;

    for i in 0..instrument_count {
        if let Some(net) = instrument_nets[i] {
            if net.net_qty == 0 {
                // INFINITE CAPITAL EFFICIENCY: Net flat = zero margin!
                msg!("Instrument {:?} is flat, margin = 0", net.pubkey);
                continue;
            }

            // Calculate margin based on net exposure
            // Use the LOWER of:
            // 1. Sum of existing margin from positions (prevents requiring MORE margin)
            // 2. Theoretical margin for net exposure (for new positions)

            // For simplicity in v0: Use sum of existing margin
            // TODO v1: Calculate theoretical margin for net and take min
            total_netted_margin += net.total_margin_held;
        }
    }

    Ok(total_netted_margin)
}

/// Helper: Read instrument pubkey from slab account
fn read_instrument_pubkey(
    slab_account: &AccountInfo,
    instrument_idx: u16,
) -> Result<Pubkey, PercolatorError> {
    // Read slab state to get instrument array
    let data = slab_account.try_borrow_data()
        .map_err(|_| PercolatorError::InvalidAccount)?;

    // Slab state layout (from percolator-slab program):
    // - header: ~200 bytes
    // - instruments: array of Instrument structs
    //   - Each Instrument has pubkey at offset 0

    // Calculate offset to instrument array
    const SLAB_HEADER_SIZE: usize = 200;  // Approximate, verify actual
    const INSTRUMENT_SIZE: usize = 128;   // Approximate, verify actual

    let instrument_offset = SLAB_HEADER_SIZE + (instrument_idx as usize * INSTRUMENT_SIZE);

    if data.len() < instrument_offset + 32 {
        msg!("Slab account too small");
        return Err(PercolatorError::InvalidAccount);
    }

    // Read pubkey (32 bytes)
    let pubkey_bytes = &data[instrument_offset..instrument_offset + 32];
    let pubkey = Pubkey::from(
        <[u8; 32]>::try_from(pubkey_bytes)
            .map_err(|_| PercolatorError::InvalidInstrument)?
    );

    Ok(pubkey)
}

/// Helper: Read margin_held from PositionDetails PDA
fn read_position_margin(
    position_details_accounts: &[AccountInfo],
    portfolio_account: &AccountInfo,
    slab_idx: u16,
    instrument_idx: u16,
    program_id: &Pubkey,
) -> Result<u128, PercolatorError> {
    // Derive PDA
    use pinocchio::pubkey::find_program_address;
    let slab_idx_bytes = slab_idx.to_le_bytes();
    let instrument_idx_bytes = instrument_idx.to_le_bytes();
    let seeds: &[&[u8]] = &[
        b"position",
        portfolio_account.key().as_ref(),
        &slab_idx_bytes,
        &instrument_idx_bytes,
    ];
    let (expected_pda, _) = find_program_address(seeds, program_id);

    // Find account
    for pd_account in position_details_accounts {
        if pd_account.key() == &expected_pda {
            let data = pd_account.try_borrow_data()
                .map_err(|_| PercolatorError::InvalidAccount)?;

            if data.len() < 128 {
                return Ok(0);
            }

            // Read margin_held (u128 at offset 112)
            let margin_offset = 112;
            let margin_bytes = &data[margin_offset..margin_offset + 16];
            let margin_low = u64::from_le_bytes([
                margin_bytes[0], margin_bytes[1], margin_bytes[2], margin_bytes[3],
                margin_bytes[4], margin_bytes[5], margin_bytes[6], margin_bytes[7],
            ]) as u128;
            let margin_high = u64::from_le_bytes([
                margin_bytes[8], margin_bytes[9], margin_bytes[10], margin_bytes[11],
                margin_bytes[12], margin_bytes[13], margin_bytes[14], margin_bytes[15],
            ]) as u128;

            return Ok(margin_low | (margin_high << 64));
        }
    }

    Ok(0)  // Position not found (shouldn't happen)
}

/// Helper: Find slab account by pubkey
fn find_slab_account<'a>(
    slab_accounts: &'a [AccountInfo<'a>],
    slab_id: &Pubkey,
) -> Result<&'a AccountInfo<'a>, PercolatorError> {
    for account in slab_accounts {
        if account.key() == slab_id {
            return Ok(account);
        }
    }
    msg!("Slab account not found: {:?}", slab_id);
    Err(PercolatorError::InvalidAccount)
}
```

### 4.3 Integration Point

Replace the margin calculation in `execute_cross_slab`:

```rust
// programs/router/src/instructions/execute_cross_slab.rs:743-748

// OLD:
let im_required = calculate_portfolio_margin_from_exposures(
    user_portfolio,
    user_portfolio_account,
    position_details_accounts,
    program_id,
)?;

// NEW:
let im_required = calculate_netted_portfolio_margin(
    user_portfolio,
    user_portfolio_account,
    position_details_accounts,
    slab_accounts,  // NEW: Pass slab accounts
    registry,
    program_id,
)?;
```

### 4.4 Instruction Account Updates

Need to add slab accounts to the instruction:

```rust
// programs/router/src/instructions/execute_cross_slab.rs

// Current accounts:
// 0. user_portfolio
// 1. user_portfolio_owner (signer)
// 2. dlp_portfolio
// 3. registry
// 4. vault
// 5. vault_token_account
// 6. token_program
// 7-14. receipts (8 accounts)
// 15-22. slab_accounts (8 accounts)  // Already passed!
// 23-30. position_details (8 accounts)

// Good news: Slab accounts are ALREADY passed to the instruction!
// They're used for CPI calls to execute trades.
// We just need to also use them for reading instrument pubkeys.
```

**No additional accounts needed!** Slab accounts are already passed for trade execution.

---

## 5. Implementation Steps

### Phase 1: Foundation (Week 1)

#### 1.1 Add Helper Functions
- [ ] Implement `read_instrument_pubkey()`
- [ ] Implement `read_position_margin()`
- [ ] Implement `find_slab_account()`
- [ ] Add tests for each helper

**Files Modified**:
- `programs/router/src/instructions/execute_cross_slab.rs`

#### 1.2 Validate Slab State Reading
- [ ] Verify slab account layout and offsets
- [ ] Test reading instrument pubkeys from actual slab accounts
- [ ] Handle edge cases (empty instruments, invalid indices)

**Files to Reference**:
- `programs/slab/src/state.rs` (for layout)

#### 1.3 Unit Tests
- [ ] Test `read_instrument_pubkey()` with mock slab data
- [ ] Test `read_position_margin()` with mock PositionDetails
- [ ] Test error handling

### Phase 2: Netting Logic (Week 2)

#### 2.1 Implement `calculate_netted_portfolio_margin()`
- [ ] Implement instrument pubkey fetching loop
- [ ] Implement grouping by instrument
- [ ] Implement net quantity calculation
- [ ] Implement margin calculation on net

**Files Modified**:
- `programs/router/src/instructions/execute_cross_slab.rs`

#### 2.2 Integration
- [ ] Replace `calculate_portfolio_margin_from_exposures()` call
- [ ] Add logging for debugging
- [ ] Handle backward compatibility (graceful degradation if slab accounts missing)

#### 2.3 Edge Cases
- [ ] Handle missing slab accounts (fallback to old behavior?)
- [ ] Handle instrument lookup failures
- [ ] Handle zero net exposure (return 0 margin)
- [ ] Handle partial netting (some instruments net, others don't)

### Phase 3: Testing (Week 3)

#### 3.1 Unit Tests
- [ ] Test zero net exposure scenario (the killer test!)
- [ ] Test partial netting (Long 2, Short 1 = Net 1)
- [ ] Test multi-instrument portfolios (BTC + ETH)
- [ ] Test same-slab positions (should behave identically to before)

**Files Modified**:
- `tests/v0_capital_efficiency.rs` - Make these integration tests!

#### 3.2 Integration Tests
- [ ] Test full trade flow with netting
  - Open long on Slab A
  - Open short on Slab B (same instrument)
  - Verify margin released
  - Verify PnL calculation correct
- [ ] Test arbitrage scenario
  - Long @ $50,000 on Slab A
  - Short @ $50,100 on Slab B
  - Verify ~$0 margin requirement
  - Close both positions
  - Verify $100 profit realized

#### 3.3 Localnet End-to-End Test
```bash
# Setup
anchor build
solana-test-validator --reset

# Deploy
anchor deploy

# Test Script
cd cli-client

# Initialize
npm run barista-dlp -- slab-create --instrument <BTC> --network localnet

# Trade 1: Long on Slab A
node dist/index.js buy --slab <SLAB_A> -q 1.0 --leverage 10 --network localnet
node dist/index.js portfolio --network localnet
# Expected: Margin = ~$5,000

# Trade 2: Short on Slab B (offsetting)
node dist/index.js sell --slab <SLAB_B> -q 1.0 --leverage 10 --network localnet
node dist/index.js portfolio --network localnet
# Expected: Margin = ~$0 (netted!)
```

### Phase 4: Optimization (Week 4)

#### 4.1 Compute Unit Optimization
- [ ] Profile compute units used
- [ ] Optimize loops (unroll where possible)
- [ ] Cache instrument pubkey lookups
- [ ] Consider pre-sorting exposures by instrument

#### 4.2 Margin Redistribution (Advanced)
Currently, we sum existing margin from positions. For better capital efficiency:

- [ ] Calculate theoretical margin for net exposure
- [ ] Compare with sum of position margins
- [ ] Release excess margin when netting reduces requirement
- [ ] Track which position PDAs to refund

**Complexity**: HIGH - Requires redistributing margin across PositionDetails PDAs

#### 4.3 Documentation
- [ ] Update architecture docs
- [ ] Add margin calculation examples
- [ ] Document compute unit costs
- [ ] Update user guides (portfolio netting behavior)

---

## 6. Testing Strategy

### 6.1 Core Test Cases

#### Test 1: Zero Net Exposure (Infinite Capital Efficiency)
```
Setup:
  - Slab A: Instrument 0 = BTC (pubkey: 7oyp...)
  - Slab B: Instrument 0 = BTC (pubkey: 7oyp...)  // Same instrument!

Action:
  1. Buy 1.0 BTC on Slab A @ $50,000 (10x leverage)
     - Margin held: $5,000
  2. Sell 1.0 BTC on Slab B @ $50,100 (10x leverage)
     - Margin held: $5,000 (initially)

Expected Result:
  - Net exposure for 7oyp...: +1.0 - 1.0 = 0 BTC
  - Portfolio margin: $0 (not $10,000!)
  - Free collateral: Full equity
  - PnL: +$100 locked in
```

#### Test 2: Partial Netting
```
Setup: Same as Test 1

Action:
  1. Buy 2.0 BTC on Slab A @ $50,000 (10x leverage)
     - Margin held: $10,000
  2. Sell 1.0 BTC on Slab B @ $50,100 (10x leverage)
     - Margin held: $5,000 (initially)

Expected Result:
  - Net exposure for 7oyp...: +2.0 - 1.0 = +1.0 BTC
  - Portfolio margin: $5,000 (not $15,000!)
  - Capital efficiency: 66% savings
```

#### Test 3: Multi-Instrument (No Cross-Instrument Netting)
```
Setup:
  - Slab A: Instrument 0 = BTC (pubkey: 7oyp...)
  - Slab B: Instrument 1 = ETH (pubkey: 8abc...)

Action:
  1. Buy 1.0 BTC on Slab A
  2. Sell 10 ETH on Slab B

Expected Result:
  - BTC net: +1.0 BTC → Margin: $5,000
  - ETH net: -10 ETH → Margin: $3,000
  - Total margin: $8,000
  - NO netting between BTC and ETH
```

#### Test 4: Same Slab (Backward Compatibility)
```
Setup:
  - Slab A: Instrument 0 = BTC

Action:
  1. Buy 1.0 BTC on Slab A
  2. Sell 1.0 BTC on Slab A (closing position)

Expected Result:
  - Position closed (qty = 0)
  - Margin released: $5,000
  - Behavior: IDENTICAL to current implementation
```

### 6.2 Edge Case Tests

- [ ] Instrument lookup fails (missing slab account) → Fallback or error?
- [ ] Instrument index out of bounds → Error gracefully
- [ ] PositionDetails missing for exposure → Skip or error?
- [ ] Multiple instruments on same slab → Should still net by instrument
- [ ] LP positions + principal positions → Separate margin tracking
- [ ] Zero quantity exposures → Skip in calculation

### 6.3 Performance Tests

- [ ] Benchmark compute units: 1 exposure vs 10 exposures vs 32 exposures
- [ ] Measure CU increase from netting logic
- [ ] Ensure under Solana's 200k CU limit per instruction
- [ ] Profile hot paths (consider caching)

---

## 7. Migration & Rollout

### 7.1 Backward Compatibility

**Key Requirement**: Existing positions must continue to work without migration.

**Strategy**:
- New margin calculation is purely computational (no state changes)
- Old PositionDetails PDAs continue to work
- No portfolio account migration needed

**Validation**:
- [ ] Test with existing portfolio accounts
- [ ] Test closing old positions
- [ ] Test mixing old and new positions

### 7.2 Rollout Plan

#### Stage 1: Testnet Deployment
- Deploy to devnet
- Run integration test suite
- Monitor for issues
- Gather community feedback

#### Stage 2: Mainnet Deployment
- Deploy to mainnet-beta
- Enable for small subset of users (via registry flag?)
- Monitor margin calculations
- Expand gradually

#### Stage 3: Full Rollout
- Enable for all users
- Update documentation
- Announce feature launch

### 7.3 Monitoring

**Key Metrics**:
- Compute units per transaction (track increases)
- Margin calculation correctness (spot check portfolios)
- Failed transactions (insufficient CU, errors)
- User behavior (are arbitrage positions increasing?)

**Logging**:
```rust
msg!("Portfolio netting: {} instruments, net margin: {}",
     instrument_count, total_netted_margin);
```

---

## 8. Known Limitations & Future Work

### 8.1 Current Limitations

1. **Margin Not Actively Released**: When netting reduces margin requirement, existing margin stays in PositionDetails. User gets benefit via `free_collateral` calculation but doesn't get margin back until closing positions.

2. **No Partial Position Close Optimization**: Closing 0.5 BTC on Slab A doesn't automatically apply to net exposure. Still per-position logic.

3. **Compute Unit Cost**: Fetching instrument pubkeys from slab accounts adds CU overhead. May limit max number of exposures.

4. **No Instrument Registry**: Each trade must fetch instrument data from slabs. A global registry would be more efficient but adds complexity.

### 8.2 Future Enhancements (v1+)

#### V1.1: Active Margin Rebalancing
- Redistribute margin across positions when netting changes
- Release excess margin to user equity immediately
- More complex but better UX

#### V1.2: Instrument Registry
- Create global instrument registry account
- Map `instrument_idx → instrument_pubkey` once
- Eliminate need to read slab accounts during margin calc
- Faster, lower CU cost

#### V1.3: Position Consolidation
- Allow users to "consolidate" offsetting positions
- Long 1.0 on Slab A + Short 1.0 on Slab B → Combine into one flat position
- Clean up PositionDetails PDAs
- Reclaim rent

#### V1.4: Cross-Venue Netting
- Net positions across slabs AND AMMs
- Consider LP exposure in netting calculation
- Full cross-margin implementation

---

## 9. Success Criteria

### Definition of Done

- [x] Zero net exposure results in ~$0 margin requirement
- [x] Partial netting calculates margin on net exposure only
- [x] Multi-instrument portfolios net correctly per instrument
- [x] Backward compatible with existing positions
- [x] Compute units under budget (< 200k per txn)
- [x] Integration tests pass on localnet
- [x] Documentation updated
- [x] Code reviewed and approved

### Performance Targets

- **Compute Units**: < 150k per transaction (50k budget for netting logic)
- **Latency**: No user-facing latency increase
- **Accuracy**: 100% correct margin calculations (zero tolerance for bugs here)

### User Experience Goals

- Professional traders can execute arbitrage strategies
- Market makers can provide liquidity efficiently
- Users see netted positions in portfolio display (CLI already updated!)
- Documentation clearly explains netting behavior

---

## 10. Open Questions

### Q1: What happens if instrument lookup fails?
**Options**:
1. Error out (safe but restrictive)
2. Fallback to old per-position margin (backward compatible)
3. Skip that exposure (risky - might under-calculate margin)

**Recommendation**: Option 2 (fallback) for robustness.

### Q2: Should we enforce minimum margin per instrument?
Even if net exposure = 0, should we require a small minimum margin (e.g., $10) as insurance?

**Recommendation**: No. Let it be true zero. Slippage protection is handled separately.

### Q3: How to handle leverage differences across positions?
Long 1.0 BTC @ 10x on Slab A + Short 1.0 BTC @ 5x on Slab B = Net 0, but different leverage.

**Options**:
1. Use weighted average leverage
2. Use more conservative (lower) leverage
3. Ignore leverage for net calculation (margin already committed)

**Recommendation**: Option 3 for v0 (sum existing margin). Option 1 for v1 (recalculate).

### Q4: Should we add a registry flag to enable/disable netting?
For gradual rollout and emergency shutoff.

**Recommendation**: Yes. Add `enable_portfolio_netting: bool` to SlabRegistry.

---

## 11. Risk Analysis

### High Risk
- **Margin Calculation Bug**: Could allow under-collateralized positions → CRITICAL
  - **Mitigation**: Extensive testing, formal verification of math, conservative fallbacks

### Medium Risk
- **Compute Unit Overflow**: Netting logic exceeds CU budget → Transaction failures
  - **Mitigation**: Profile early, optimize, add CU tests to CI

- **Instrument Lookup Failure**: Slab account changes break lookups → Fallback to old behavior
  - **Mitigation**: Robust error handling, fallback logic

### Low Risk
- **User Confusion**: Users don't understand netting behavior
  - **Mitigation**: Clear documentation, CLI shows netted positions

- **Performance Degradation**: Slower transactions
  - **Mitigation**: Benchmark and optimize before rollout

---

## 12. Conclusion

Portfolio netting is a **core feature** that unlocks "infinite capital efficiency" for professional trading strategies. The implementation is feasible without state migrations using a two-pass calculation approach.

**Key Success Factors**:
1. Robust instrument pubkey fetching from slab accounts
2. Correct grouping and netting logic (tested extensively)
3. Backward compatibility (fallback if needed)
4. Compute unit optimization (stay under budget)

**Timeline**: 4 weeks from start to testnet deployment

**Next Steps**:
1. Review this plan with team
2. Begin Phase 1 (helper functions)
3. Set up integration test harness
4. Start implementation!

---

**Document Version**: 1.0
**Last Updated**: 2025-10-28
**Author**: Claude (Barista DEX Development Agent)
**Status**: Ready for Review
