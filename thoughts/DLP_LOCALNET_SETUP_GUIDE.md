# DLP (Decentralized Liquidity Provider) Setup Guide - Localnet

**Complete step-by-step guide to becoming a DLP on localnet and enabling traders to trade on your venue.**

> **Note**: v0 uses **native SOL only** for trader collateral. No USDC or SPL tokens needed! USDC support coming in v1+.

> **⚠️ v0.5 UPDATE - Real PnL Settlement with Counterparty Model**:
> DLPs now provide **real counterparty capital** for trades! As a DLP, you:
> - Create a **Portfolio account** (same structure as traders)
> - Deposit **SOL collateral** to back all trades on your slab
> - Act as **counterparty**: earn PnL from trader losses, lose on trader profits
> - Your slab routes trades that settle **directly against your Portfolio**
>
> **Capital Required**: Minimum 100 SOL recommended, 500-1000 SOL for comfortable testing.
> **Risk**: Zero-sum game - you take opposite side of all trader positions on your slab.
> **Reward**: Earn from trader losses + collect taker fees.
>
> **v1 Preview**: This same Portfolio will transition to tracking LP inventory positions with order book matching. Your v0.5 setup carries forward!

---

## Overview

### What v0.5 "Counterparty Settlement" Means

Your slab now requires real capital backing:
- Trader submits: "Buy 1 BTC-PERP @ $51k"
- System fills instantly at oracle-validated price
- **Settlement**: SOL transfers between your Portfolio and trader's Portfolio
- Your PnL = inverse of trader PnL (zero-sum)

### As a DLP in v0.5, you will:
1. ✅ Create a **Portfolio account** (holds your SOL capital)
2. ✅ Deposit **SOL collateral** (backs trades, earns/loses PnL)
3. ✅ Create a **slab** (venue that routes to your Portfolio)
4. ✅ Set **taker fees** (you earn these + PnL from trader losses)
5. ✅ **Monitor risk** (track exposure, withdraw profits, add capital if needed)

**Time Required**: ~10-15 minutes for complete setup with capital management.

**Setup Order (v0.5 with Capital)**:
1. Create Portfolio & deposit SOL capital (one step - auto-created on first deposit)
2. Create instrument identifier (market type ID)
3. Create slab (links to your Portfolio via lp_owner)
4. Initialize oracle (price feed)
5. Monitor your Portfolio PnL and exposure

---

## Prerequisites

Before starting, ensure:

### 1. Programs Deployed
```bash
# Verify programs are deployed
solana program show <ROUTER_PROGRAM_ID> --url localhost
solana program show <SLAB_PROGRAM_ID> --url localhost
```

### 2. Localnet Running
```bash
# Start localnet (in separate terminal)
solana-test-validator --reset

# Keep this running throughout the setup
```

### 3. DLP Wallet Funded
```bash
# Create or use existing wallet
solana-keygen new --outfile ~/.config/solana/dlp-wallet.json

# Fund with SOL (for capital + transaction fees)
# Recommended amounts (localnet - unlimited):
# - Testing: 100-500 SOL
# - Comfortable: 500-1000 SOL
# - Stress testing: 10,000+ SOL
solana airdrop 1000 <YOUR_DLP_PUBKEY> --url localhost

# Verify balance
solana balance <YOUR_DLP_PUBKEY> --url localhost
```

**Recommended Capital Amounts**:
- **Minimum**: 100 SOL - Basic testing with single trader
- **Comfortable**: 500 SOL - Multiple concurrent trades
- **Recommended**: 1000 SOL - Stress testing, high-volume scenarios
- **Maximum**: 10,000+ SOL - Extreme stress testing

**Note**: In v0.5, you need SOL for:
- **Capital deposit**: Backs trades on your slab (100-1000 SOL recommended)
- **Transaction fees**: Portfolio creation, deposits, slab operations (~2 SOL)
- **Risk buffer**: Extra capital for adverse price movements

---

## Step-by-Step Setup

### Step 1: Create Your DLP Portfolio & Deposit SOL Capital

As a DLP, you need a Portfolio account with SOL capital to back trades. Your portfolio is **auto-created** on first deposit.

> **⚠️ CLI Tool:** DLPs should use the **`cli-dlp`** CLI for portfolio and slab management. The TypeScript CLI provides better UX than the Rust Keeper CLI.

**Using DLP CLI (TypeScript) - Recommended Method:**
```bash
# Install cli-dlp globally
npm install -g @barista-dex/cli-dlp

# Or use npx (no installation)
npx @barista-dex/cli-dlp --help

# Deposit capital (auto-creates portfolio)
barista-dlp deposit \
  --amount 100000000000 \
  --keypair ~/.config/solana/dlp-wallet.json \
  --network localnet

# View portfolio
barista-dlp portfolio \
  --keypair ~/.config/solana/dlp-wallet.json \
  --network localnet
```

**Using Keeper CLI (Rust) - Alternative Method:**
```bash
# Navigate to keeper directory
cd cli

# Create portfolio and deposit 100 SOL
cargo run -- portfolio init \
  --keypair ~/.config/solana/dlp-wallet.json \
  --network localnet

cargo run -- deposit \
  --amount 100000000000 \
  --keypair ~/.config/solana/dlp-wallet.json \
  --network localnet

# Verify your portfolio
cargo run -- portfolio \
  --keypair ~/.config/solana/dlp-wallet.json \
  --network localnet
```

**Using SDK (Alternative):**
```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { RouterClient } from '@barista-dex/sdk';
import BN from 'bn.js';

const connection = new Connection('http://localhost:8899');
const dlpWallet = Keypair.fromSecretKey(/* your DLP keypair */);
const routerProgramId = new PublicKey('...');

const client = new RouterClient(connection, routerProgramId, dlpWallet);

// Deposit 100 SOL (auto-creates portfolio)
const amount = new BN(100_000_000_000); // 100 SOL in lamports
const depositIx = await client.buildDepositInstruction(amount, dlpWallet.publicKey);

// Add portfolio creation if needed
const ensurePortfolioIxs = await client.ensurePortfolioInstructions(dlpWallet.publicKey);

const tx = new Transaction()
  .add(...ensurePortfolioIxs)
  .add(depositIx);

await connection.sendTransaction(tx, [dlpWallet]);
```

**What just happened?**
1. **Portfolio Created**: PDA account owned by Router program
2. **SOL Deposited**: 100 SOL transferred to your Portfolio account
3. **Capital Active**: Ready to back trades on your slab
4. **Same Structure**: Identical to trader portfolios - enables v1 migration

**Capital Guidelines (Localnet)**:
- **Minimum**: 100 SOL - Basic testing with single trader
- **Comfortable**: 500 SOL - Multiple concurrent trades, realistic scenarios
- **Recommended**: 1000 SOL - Stress testing, high-volume trading
- **Maximum**: 10,000+ SOL - Extreme stress testing

**⚠️ Risk Warning**: This capital backs all trades on your slab. If traders profit, your Portfolio loses SOL!

---

### Step 2: Create an Instrument (Market Identifier)

An instrument represents a trading pair (e.g., BTC-PERP, SOL-PERP).

```bash
# Generate a new keypair for the instrument
solana-keygen new --no-bip39-passphrase --outfile ./btc-perp-instrument.json

# Get the pubkey (this is your instrument ID)
solana-keygen pubkey ./btc-perp-instrument.json
# Save this: <INSTRUMENT_ID>
```

**Note**: The instrument is just an identifier - it doesn't store any state. Multiple slabs can trade the same instrument.

---

### Step 3: Create Your Slab

Create your slab for the instrument using the DLP CLI:

**Using DLP CLI (TypeScript) - Recommended:**
```bash
# Interactive mode (guided prompts)
barista-dlp slab:create \
  --keypair ~/.config/solana/dlp-wallet.json \
  --network localnet

# Or specify all parameters
barista-dlp slab:create \
  --instrument <INSTRUMENT_ID> \
  --mark-price 50000.00 \
  --taker-fee 10 \
  --contract-size 1.0 \
  --keypair ~/.config/solana/dlp-wallet.json \
  --network localnet \
  --yes

# View your slab
barista-dlp slab:view \
  --address <SLAB_ADDRESS> \
  --detailed \
  --keypair ~/.config/solana/dlp-wallet.json \
  --network localnet
```

**Using Scripts (TypeScript) - Alternative:**
```bash
cd scripts

# Copy the example env file
cp .env.example .env

# Edit .env with your values:
# NETWORK=localnet
# RPC_URL=http://localhost:8899
# ROUTER_PROGRAM_ID=<YOUR_ROUTER_PROGRAM_ID>
# SLAB_PROGRAM_ID=<YOUR_SLAB_PROGRAM_ID>
# LP_KEYPAIR_PATH=/Users/yourname/.config/solana/dlp-wallet.json
# INSTRUMENT_ID=<YOUR_INSTRUMENT_ID>
# MARK_PRICE=50000000000
# TAKER_FEE_BPS=5
# CONTRACT_SIZE=1000000

# Install dependencies (if not done already)
npm install

# Run the create-slab script
npx ts-node create-slab.ts

# Expected output:
# ✓ Configuration loaded
# ✓ Keypair loaded
# ✓ Balance sufficient: 1000.000000000 SOL
# ✓ Building initialization instruction
# ✓ Slab created successfully!
#
# Slab Details:
#   Address: <SLAB_ADDRESS>
#   LP Owner: <YOUR_PUBKEY>
#   Instrument: <INSTRUMENT_ID>
#   Mark Price: 50000000000 ($50,000.00)
#   Taker Fee: 5 bps (0.05%)
#   Contract Size: 1000000 (1.0)
#
# Slab info saved to: slab-<timestamp>.json
```

**Save the slab address!** You'll need it for oracle setup.

---

### Step 4: Initialize an Oracle for Your Instrument

Your slab needs an oracle to provide mark prices.

#### Using the Keeper CLI:

```bash
# Navigate to keeper directory
cd keeper

# Initialize oracle for BTC
cargo run --bin keeper -- oracle init \
  --symbol BTC \
  --price 50000.0 \
  --network localnet \
  --keypair ~/.config/solana/dlp-wallet.json

# Output will show:
# ✓ Oracle initialized: <ORACLE_ADDRESS>
# Save this address!
```

#### Start Oracle Price Updates:

```bash
# In a separate terminal, start the oracle crank
cargo run --bin keeper -- oracle crank \
  --oracle <ORACLE_ADDRESS> \
  --source coingecko \
  --symbol bitcoin \
  --interval 10 \
  --network localnet \
  --keypair ~/.config/solana/dlp-wallet.json

# This will update prices every 10 seconds
# Keep this running!
```

#### Verify Oracle:

```bash
cargo run --bin keeper -- oracle show \
  --oracle <ORACLE_ADDRESS> \
  --network localnet

# Expected output:
# Oracle: <ORACLE_ADDRESS>
# Symbol: BTC
# Price: 50000.000000 (1e6 scale: 50000000000)
# Last Updated: <timestamp>
```

---

### Step 5: Verify Your Slab (Optional)

Check that your slab is properly initialized:

```bash
# Using Solana CLI
solana account <SLAB_ADDRESS> --url localhost

# Should show ~4KB account owned by slab program
```

Using SDK:
```typescript
// scripts/verify-slab.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { SlabClient } from '@barista-dex/sdk';

const connection = new Connection('http://localhost:8899', 'confirmed');
const slabProgramId = new PublicKey('<SLAB_PROGRAM_ID>');
const slabAddress = new PublicKey('<SLAB_ADDRESS>');

const slabClient = new SlabClient(connection, slabProgramId, null);

async function verifySlab() {
  const accountInfo = await connection.getAccountInfo(slabAddress);

  if (!accountInfo) {
    console.error('❌ Slab account not found');
    return;
  }

  console.log('✓ Slab account exists');
  console.log('  Owner:', accountInfo.owner.toBase58());
  console.log('  Size:', accountInfo.data.length, 'bytes');
  console.log('  Lamports:', accountInfo.lamports);

  // Parse slab data (basic check)
  const magic = accountInfo.data.slice(0, 8);
  console.log('  Magic:', Buffer.from(magic).toString('utf-8'));

  if (Buffer.from(magic).toString('utf-8').startsWith('PERP10')) {
    console.log('✓ Slab header valid');
  } else {
    console.error('❌ Invalid slab magic bytes');
  }
}

verifySlab().catch(console.error);
```

---

## Step 6: Enable Trading

**Setup complete!** Your slab is live and traders can execute atomic fills.

**What happens when traders trade:**
1. Trader submits order with limit price (e.g., "Buy 1 BTC-PERP at max $51k")
2. Router CPI calls your slab's `commit_fill`
3. Fill executes instantly at trader's limit price
4. Trader's portfolio updated with position
5. **Your slab does nothing else** - no inventory tracking in v0!
6. Fees accrue to protocol insurance fund (not you directly)

### Share These Details with Traders:

```
Network: Localnet (http://localhost:8899)
Router Program: <ROUTER_PROGRAM_ID>
Slab Program: <SLAB_PROGRAM_ID>
Slab Address: <SLAB_ADDRESS>
Instrument: <INSTRUMENT_ID> (BTC-PERP)
Taker Fee: 0.05%
Current Mark Price: $50,000
```

### Test Trade (Using CLI):

From a trader's perspective:

```bash
# Deposit SOL collateral (v0 is SOL-only!)
barista deposit --amount 5000000000 --network localnet
# This deposits 5 SOL

# Verify portfolio
barista portfolio --network localnet

# Execute buy order on your slab (manual slab selection)
barista buy \
  --slab <SLAB_ADDRESS> \
  --quantity 1000000 \
  --price 50000000000 \
  --network localnet

# Or use smart routing (finds best price automatically)
barista buy \
  --instrument <INSTRUMENT_ID> \
  --quantity 1000000 \
  --network localnet
```

**Note**: All amounts are in base units (lamports for SOL, 1e6 scale for prices/quantities).

---

## Monitoring & Management

### Monitor Fill Activity

```typescript
// scripts/monitor-fills.ts
import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection('http://localhost:8899', 'confirmed');
const slabAddress = new PublicKey('<SLAB_ADDRESS>');

async function monitorFills() {
  console.log('Monitoring fills for slab:', slabAddress.toBase58());

  // Subscribe to account changes
  connection.onAccountChange(slabAddress, (accountInfo) => {
    // Parse seqno from account data
    const seqno = accountInfo.data.readUInt32LE(12);
    console.log('Fill detected! New seqno:', seqno);

    // You can fetch the fill receipt here
  });
}

monitorFills().catch(console.error);
```

### Check Your Portfolio P&L

```bash
# Using CLI
barista portfolio --network localnet

# Expected output:
# Portfolio: <PORTFOLIO_ADDRESS>
# Equity: 50000000000
# Positions:
#   - Instrument <INSTRUMENT_ID>: +10 contracts @ 50000.00
```

### Update Oracle Price (Manual)

```bash
cargo run --bin keeper -- oracle update \
  --oracle <ORACLE_ADDRESS> \
  --price 51000.0 \
  --network localnet \
  --keypair ~/.config/solana/dlp-wallet.json
```

---

## Troubleshooting

### Issue: Slab creation fails with "insufficient funds"

**Solution**: Ensure your wallet has enough SOL:
```bash
solana balance <YOUR_PUBKEY> --url localhost
solana airdrop 5 <YOUR_PUBKEY> --url localhost
```

### Issue: Trader orders fail

**Possible causes**:
1. **Stale oracle**: Restart the oracle crank
2. **Wrong slab address**: Verify the slab address shared with traders
3. **Trader has no portfolio/collateral**: Traders need portfolios (you don't!)

**Debug**:
```bash
# Check oracle
cargo run --bin keeper -- oracle show --oracle <ORACLE_ADDRESS> --network localnet

# Check slab account
solana account <SLAB_ADDRESS> --url localhost

# Check trader's portfolio (not yours - you don't need one!)
barista portfolio --address <TRADER_PUBKEY> --network localnet
```

### Issue: Oracle not updating

**Solution**: Make sure the oracle crank is running:
```bash
# Check if keeper is running
ps aux | grep keeper

# Restart if needed
cargo run --bin keeper -- oracle crank \
  --oracle <ORACLE_ADDRESS> \
  --source coingecko \
  --symbol bitcoin \
  --interval 10 \
  --network localnet \
  --keypair ~/.config/solana/dlp-wallet.json
```

---

## Summary Checklist

### v0 DLP Setup (Simple!)
- [ ] Localnet running
- [ ] DLP wallet funded with SOL (2 SOL for transaction fees)
- [ ] Instrument keypair created
- [ ] **Slab created** (venue identifier with fee parameters)
- [ ] Oracle initialized and cranking (provides mark prices)
- [ ] ~~Portfolio initialized~~ (NOT NEEDED in v0!)
- [ ] ~~Collateral deposited~~ (NOT NEEDED in v0!)

### Trader Enablement
- [ ] Share slab address with traders
- [ ] Share instrument ID
- [ ] Share router/slab program IDs
- [ ] Verify **traders** have portfolios with SOL collateral
- [ ] Verify traders can execute atomic fills

### Ongoing Operations (v0 - Minimal)
- [ ] Monitor oracle updates (every 10s)
- [ ] Monitor fill receipts (see trade activity)
- [ ] ~~Check portfolio P&L~~ (You don't have positions in v0!)
- [ ] ~~Manage inventory~~ (No inventory in v0!)
- [ ] ~~Monitor margin~~ (No margin needed in v0!)

---

## Next Steps (v0)

1. **Run multiple slabs**: Create slabs for different instruments (ETH-PERP, SOL-PERP)
2. **Adjust parameters**: Experiment with different taker fees and contract sizes
3. **Monitor activity**: Watch fill receipts to see trading volume
4. **Deploy to devnet**: Test with Pyth oracles
5. ~~**Implement hedging**~~ (Not needed in v0 - no inventory to hedge!)

## Future (v1+)

When v1 launches with real orderbooks and LP inventory:
- You WILL need a portfolio and collateral
- You WILL accumulate inventory positions
- You WILL need to manage risk and hedge
- Fees will be paid directly to LPs (not insurance fund)

---

**Created**: 2025-10-26
**Network**: Localnet
**Status**: Complete step-by-step guide
**Related Docs**: LP_OPERATIONS_GUIDE.md, ORACLE_LOCALNET_DEVNET_GUIDE.md
