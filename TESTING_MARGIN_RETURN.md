# Testing Guide: Margin Return Implementation

## Overview

This guide tests the critical margin return feature that ensures users get their collateral back when closing positions.

**What was fixed:**
- Before: Margin stuck in DLP forever on position close ❌
- After: Margin returned proportionally when reducing/closing ✅

## Prerequisites

```bash
# 1. Ensure localnet is running
solana-test-validator

# 2. Build router program
./build-programs.sh

# 3. Deploy router program
solana program deploy target/deploy/percolator_router.so \
  --program-id programs/router/keypair.json \
  --url localhost

# 4. Build CLI
cd cli-client && npm run build && cd ..

# 5. Set up test accounts (if not already done)
# Create trader account
solana-keygen new -o ~/.config/solana/trader7.json --force

# Fund trader
solana airdrop 100 $(solana-keygen pubkey ~/.config/solana/trader7.json) --url localhost

# Initialize trader portfolio
cd cli-client
node dist/index.js deposit --amount 50 \
  --keypair ~/.config/solana/trader7.json \
  --network localnet
```

## Test Scenarios

### Test 1: Full Position Close (Breakeven)

**Purpose**: Verify margin is returned when closing position with no price change.

```bash
# Get slab and oracle addresses
SLAB="4dUTGxvXqyd9cG27jdCWgcyH78LD6xDuxrgbgctHYCKx"
ORACLE="F5rRz5kArSUFNke1DKujEVxnWb8SsqiS6FtfahQJBU5z"

# Step 1: Check initial portfolio
node dist/index.js portfolio --keypair ~/.config/solana/trader7.json --network localnet

# Expected: Equity ≈ 50 SOL

# Step 2: Open position (5 contracts at 5x leverage)
node dist/index.js buy --slab $SLAB --quantity 1 \
  --leverage 5 --oracle $ORACLE --network localnet \
  --keypair ~/.config/solana/trader7.json

# Expected:
# - Margin committed: 1.000000 units
# - Actual position: 5.000000 units (5 contracts)
# - Position size: ~$995 (5 × $199)

# Step 3: Check portfolio after open
node dist/index.js portfolio --keypair ~/.config/solana/trader7.json --network localnet

# Expected:
# - Equity: ~49 SOL (50 - 1 margin)
# - Position: 5 contracts
# - Leverage: 5x (displayed in table)
# - Notional: ~$995

# Step 4: Close position (price unchanged)
node dist/index.js sell --slab $SLAB --quantity 1 \
  --leverage 5 --oracle $ORACLE --network localnet \
  --keypair ~/.config/solana/trader7.json

# Expected:
# - Margin returned: 1 SOL
# - PnL: ~0 (breakeven)

# Step 5: Check final portfolio
node dist/index.js portfolio --keypair ~/.config/solana/trader7.json --network localnet

# Expected:
# - Equity: ~50 SOL (margin returned!) ✅
# - No positions
```

**✅ Success Criteria:**
- User equity returns to starting value (~50 SOL)
- No positions shown after close

---

### Test 2: Full Position Close (Profitable)

**Purpose**: Verify both margin return AND profit settlement.

```bash
# Step 1: Open position at current price
node dist/index.js buy --slab $SLAB --quantity 1 \
  --leverage 5 --oracle $ORACLE --network localnet \
  --keypair ~/.config/solana/trader7.json

# Record entry price from output (e.g., $199.00)

# Step 2: Wait for price to rise (or update oracle manually)
# For testing, you can:
# - Wait for keeper to update oracle from CoinGecko
# - Or manually trigger oracle update if you have keeper running

# Step 3: Check unrealized PnL
node dist/index.js portfolio --keypair ~/.config/solana/trader7.json --network localnet

# Expected: Unrealized PnL shows profit if price increased

# Step 4: Close position
node dist/index.js sell --slab $SLAB --quantity 1 \
  --leverage 5 --oracle $ORACLE --network localnet \
  --keypair ~/.config/solana/trader7.json

# Expected output shows:
# - Margin returned: 1 SOL
# - PnL: positive value

# Step 5: Verify final equity
node dist/index.js portfolio --keypair ~/.config/solana/trader7.json --network localnet

# Expected:
# - Equity = 50 + profit (e.g., 50.25 SOL if 0.25 profit)
```

**✅ Success Criteria:**
- Equity = starting + profit
- Margin AND profit both received

---

### Test 3: Full Position Close (Loss)

**Purpose**: Verify margin return minus loss.

```bash
# Step 1: Open position
node dist/index.js buy --slab $SLAB --quantity 1 \
  --leverage 5 --oracle $ORACLE --network localnet \
  --keypair ~/.config/solana/trader7.json

# Step 2: Wait for price to drop

# Step 3: Check unrealized PnL (should be negative)
node dist/index.js portfolio --keypair ~/.config/solana/trader7.json --network localnet

# Step 4: Close position
node dist/index.js sell --slab $SLAB --quantity 1 \
  --leverage 5 --oracle $ORACLE --network localnet \
  --keypair ~/.config/solana/trader7.json

# Step 5: Verify equity
node dist/index.js portfolio --keypair ~/.config/solana/trader7.json --network localnet

# Expected:
# - Equity = 50 - loss (e.g., 49.75 if 0.25 loss)
# - User gets: margin (1 SOL) - loss (0.25 SOL) = 0.75 SOL returned
```

**✅ Success Criteria:**
- Equity reflects loss correctly
- Margin returned minus loss

---

### Test 4: Partial Position Close

**Purpose**: Verify proportional margin return on partial close.

```bash
# Step 1: Open 10 contracts (2 SOL margin at 5x)
node dist/index.js buy --slab $SLAB --quantity 2 \
  --leverage 5 --oracle $ORACLE --network localnet \
  --keypair ~/.config/solana/trader7.json

# Expected:
# - Margin: 2 SOL
# - Position: 10 contracts

# Step 2: Check portfolio
node dist/index.js portfolio --keypair ~/.config/solana/trader7.json --network localnet

# Expected:
# - Equity: ~48 SOL (50 - 2)
# - Position: 10 contracts
# - Leverage: 5x

# Step 3: Close 50% (5 contracts = 1 SOL margin)
node dist/index.js sell --slab $SLAB --quantity 1 \
  --leverage 5 --oracle $ORACLE --network localnet \
  --keypair ~/.config/solana/trader7.json

# Expected:
# - Margin returned: 1 SOL (50% of 2 SOL)

# Step 4: Check portfolio after partial close
node dist/index.js portfolio --keypair ~/.config/solana/trader7.json --network localnet

# Expected:
# - Equity: ~49 SOL (48 + 1 returned)
# - Position: 5 contracts (50% remaining)
# - Leverage: 5x (unchanged)

# Step 5: Close remaining 50%
node dist/index.js sell --slab $SLAB --quantity 1 \
  --leverage 5 --oracle $ORACLE --network localnet \
  --keypair ~/.config/solana/trader7.json

# Expected:
# - Margin returned: 1 SOL (remaining 50%)

# Step 6: Final check
node dist/index.js portfolio --keypair ~/.config/solana/trader7.json --network localnet

# Expected:
# - Equity: ~50 SOL (all margin returned)
# - No positions
```

**✅ Success Criteria:**
- First close returns 50% of margin
- Second close returns remaining 50%
- Total margin fully returned

---

### Test 5: Position Increase Then Close

**Purpose**: Verify margin accumulation and full return.

```bash
# Step 1: Open 5 contracts (1 SOL margin)
node dist/index.js buy --slab $SLAB --quantity 1 \
  --leverage 5 --oracle $ORACLE --network localnet \
  --keypair ~/.config/solana/trader7.json

# Step 2: Check portfolio
node dist/index.js portfolio --keypair ~/.config/solana/trader7.json --network localnet

# Expected:
# - Equity: ~49 SOL
# - Position: 5 contracts

# Step 3: Add 5 more contracts (1 more SOL margin)
node dist/index.js buy --slab $SLAB --quantity 1 \
  --leverage 5 --oracle $ORACLE --network localnet \
  --keypair ~/.config/solana/trader7.json

# Step 4: Check accumulated position
node dist/index.js portfolio --keypair ~/.config/solana/trader7.json --network localnet

# Expected:
# - Equity: ~48 SOL (50 - 2 total margin)
# - Position: 10 contracts (5 + 5)
# - Leverage: 5x

# Step 5: Close entire position
node dist/index.js sell --slab $SLAB --quantity 2 \
  --leverage 5 --oracle $ORACLE --network localnet \
  --keypair ~/.config/solana/trader7.json

# Expected:
# - Margin returned: 2 SOL (accumulated total)

# Step 6: Final verification
node dist/index.js portfolio --keypair ~/.config/solana/trader7.json --network localnet

# Expected:
# - Equity: ~50 SOL (all margin returned)
# - No positions
```

**✅ Success Criteria:**
- Margin accumulates correctly (1 + 1 = 2 SOL)
- All accumulated margin returned on close
- Position fully closed

---

## Verification Checklist

After running all tests, verify:

- [ ] Test 1 (Breakeven): Equity returns to starting value
- [ ] Test 2 (Profit): Margin + profit both received
- [ ] Test 3 (Loss): Margin returned minus loss
- [ ] Test 4 (Partial): Proportional margin returns work
- [ ] Test 5 (Accumulation): Margin accumulates and returns fully
- [ ] Portfolio display shows actual leverage (not "—")
- [ ] Notional value displayed correctly
- [ ] No "stuck" margin in DLP portfolio

## Debugging Commands

```bash
# Check user portfolio lamports directly
solana account $(node -e "
const {PublicKey} = require('@solana/web3.js');
const user = require('fs').readFileSync('$HOME/.config/solana/trader7.json');
const kp = require('@solana/web3.js').Keypair.fromSecretKey(new Uint8Array(JSON.parse(user)));
console.log(PublicKey.findProgramAddressSync(
  [Buffer.from('portfolio'), kp.publicKey.toBuffer()],
  new PublicKey('Hp6yAnuBFS7mU2P9c3euNrJv4h2oKvNmyWMUHKccB3wx')
)[0].toBase58());
") --url localhost

# Check DLP portfolio lamports
# (Replace with your DLP keypair path)
solana account $(node -e "
const {PublicKey} = require('@solana/web3.js');
const user = require('fs').readFileSync('$HOME/.config/solana/dlp1.json');
const kp = require('@solana/web3.js').Keypair.fromSecretKey(new Uint8Array(JSON.parse(user)));
console.log(PublicKey.findProgramAddressSync(
  [Buffer.from('portfolio'), kp.publicKey.toBuffer()],
  new PublicKey('Hp6yAnuBFS7mU2P9c3euNrJv4h2oKvNmyWMUHKccB3wx')
)[0].toBase58());
") --url localhost

# View transaction logs
solana logs --url localhost

# Check specific transaction
solana confirm -v <SIGNATURE> --url localhost
```

## Expected Log Messages

When trades execute, you should see these messages in `solana logs`:

**Position Open:**
```
Program log: Adding to position
Program log: Collateral margin transferred to DLP
```

**Position Close:**
```
Program log: Reducing position
Program log: Returning margin to user
Program log: Margin collateral returned to user
Program log: User profit transferred from DLP portfolio
// OR
Program log: User loss transferred to DLP portfolio
```

## Known Issues / Expected Behavior

1. **Old positions** (created before this update):
   - Will have `margin_held = 0` and `leverage = 0`
   - Won't return margin on close (stuck in DLP)
   - **Workaround**: Only test with fresh positions on newly deployed program

2. **Leverage display**:
   - Shows actual leverage from PositionDetails (1x-10x)
   - Old positions show "—" (no data)

3. **Rounding**:
   - Small rounding differences (<0.001 SOL) are acceptable
   - Due to partial close proportional calculations

## Success Definition

**All tests pass if:**
1. Breakeven trades return full margin to user
2. Profitable trades return margin + profit
3. Loss trades return margin minus loss
4. Partial closes return proportional margin
5. Position increases accumulate margin correctly
6. Portfolio display shows actual leverage values
7. No phantom "stuck" margin in DLP

---

**Testing Date**: ___________
**Tester**: ___________
**Result**: ☐ PASS ☐ FAIL
**Notes**:
