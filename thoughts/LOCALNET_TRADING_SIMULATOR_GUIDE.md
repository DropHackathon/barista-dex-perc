# Localnet Trading Simulator - Complete Setup Guide

**Build a complete perpetuals trading environment on your local machine in ~30 minutes**

This guide walks through creating a fully functional trading simulator on Solana localnet, complete with:
- ✅ Deployed perpetuals programs (router, slab, oracle)
- ✅ DLP (liquidity provider) with capitalized portfolio
- ✅ Multiple trader accounts
- ✅ Real-time PnL settlement
- ✅ CLI-based trading interface

**Perfect for:**
- Testing trading strategies
- Understanding perpetuals mechanics
- Development and debugging
- Integration testing
- Demo and education

---

## Overview

### What You'll Build

```
┌─────────────────────────────────────────────────────────────┐
│                    Localnet Trading Simulator                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Programs Deployed:                                          │
│  ├─ Router Program (trade execution, PnL settlement)         │
│  ├─ Slab Program (order book execution venue)                │
│  └─ Oracle Program (price feeds)                             │
│                                                               │
│  DLP (Liquidity Provider):                                   │
│  ├─ Portfolio: 1000 SOL capital                              │
│  ├─ Slab: BTC-PERP (mark price: $50,000)                     │
│  └─ Fee: 10 bps (0.1%)                                       │
│                                                               │
│  Traders:                                                     │
│  ├─ Trader 1: 100 SOL → Buy/Sell BTC-PERP                    │
│  ├─ Trader 2: 100 SOL → Buy/Sell BTC-PERP                    │
│  └─ Real-time PnL settlement with DLP                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Architecture

**Settlement Model (v0.5)**:
- DLP acts as **counterparty** for all trades
- Trades fill instantly at oracle-validated prices
- **Zero-sum PnL**: Trader profit = DLP loss, Trader loss = DLP profit
- Real SOL transfers between portfolios

**Time Required**: 20-30 minutes for complete setup

---

## Prerequisites

### 1. System Requirements

```bash
# Required software
- Rust 1.70+
- Solana CLI 1.16+
- Node.js 18+

# Verify installations
rustc --version
solana --version
node --version
```

### 2. Repository Setup

```bash
# Clone the repository (only needed for deploying programs)
git clone https://github.com/barista-dex/barista-dex.git
cd barista-dex

# Build programs
cargo build --release

# Note: CLI tools will be installed from npm (see Step 4 and Step 5)
```

### 3. Environment Variables Reference

After deploying programs (Step 2), you'll need to configure these environment variables:

| Variable | Required? | Description | When to Set |
|----------|-----------|-------------|-------------|
| `BARISTA_LOCALNET_ROUTER_PROGRAM_ID` | **Yes** | Router program ID from deployment | After Step 2 |
| `BARISTA_LOCALNET_SLAB_PROGRAM_ID` | **Yes** | Slab program ID from deployment | After Step 2 |
| `BARISTA_ORACLE_PROGRAM` | **Yes** | Oracle program ID (for percolator-keeper) | After Step 2 |
| `BARISTA_LOCALNET_RPC` | No | RPC endpoint (default: `http://localhost:8899`) | Optional |
| `BARISTA_DLP_KEYPAIR` | No | DLP wallet path (convenience for cli-dlp) | After Step 4.1 |
| `BARISTA_DLP_NETWORK` | No | Network name (convenience for cli-dlp) | After Step 4.1 |

**These will be set in Step 2 after deploying programs.**

---

## Step 1: Start Localnet

Start a fresh Solana test validator:

```bash
# Start localnet (in separate terminal - keep this running)
solana-test-validator --reset

# In another terminal, configure Solana CLI to use localhost
solana config set --url localhost

# Verify connection
solana cluster-version
```

**Keep the validator running throughout this guide.**

---

## Step 2: Deploy Programs

Deploy the three core programs to localnet:

### Build Programs

First, build all the Solana programs:

```bash
# Build all programs (from repo root)
./build-programs.sh

# This builds router, slab, oracle, and amm programs
# Output files will be in target/deploy/
```

### Deploy Router Program

```bash
# Deploy router
solana program deploy target/deploy/percolator_router.so

# Save the program ID
# Output: Program Id: <ROUTER_PROGRAM_ID>
```

### Deploy Slab Program

```bash
# Deploy slab
solana program deploy target/deploy/percolator_slab.so

# Save the program ID
# Output: Program Id: <SLAB_PROGRAM_ID>
```

### Deploy Oracle Program

```bash
# Deploy oracle
solana program deploy target/deploy/percolator_oracle.so

# Save the program ID
# Output: Program Id: <ORACLE_PROGRAM_ID>
```

**Important**: Save all three program IDs - you'll need them for the next steps.

### Configure Environment Variables

After deploying the programs, configure environment variables so the CLI tools can find them:

```bash
# Add these to your ~/.bashrc, ~/.zshrc, or export them in your terminal session

# Required: Program IDs from deployment
export BARISTA_LOCALNET_ROUTER_PROGRAM_ID=<ROUTER_PROGRAM_ID>
export BARISTA_LOCALNET_SLAB_PROGRAM_ID=<SLAB_PROGRAM_ID>

# Optional: RPC endpoint (defaults to http://localhost:8899 if not set)
export BARISTA_LOCALNET_RPC=http://localhost:8899

# For percolator-keeper binary (oracle operations)
export BARISTA_ORACLE_PROGRAM=<ORACLE_PROGRAM_ID>

# Verify configuration
echo "Router: $BARISTA_LOCALNET_ROUTER_PROGRAM_ID"
echo "Slab: $BARISTA_LOCALNET_SLAB_PROGRAM_ID"
echo "Oracle: $BARISTA_ORACLE_PROGRAM"
```

**Note**: The npm packages (@barista-dex/sdk, @barista-dex/cli-dlp, @barista-dex/cli-client) will automatically use these environment variables for localnet. Mainnet and devnet program IDs are hardcoded in the SDK.

---

## Step 3: Initialize Router Registry

The router needs a registry account for PnL vesting and liquidation parameters. This is a **one-time protocol setup step** performed during deployment.

See [REGISTRY_INITIALIZATION.md](./REGISTRY_INITIALIZATION.md) for detailed instructions.

**Quick setup for localnet:**

```bash
# Build keeper binary if not already built
cargo build --release --bin percolator-keeper

# Initialize registry
./target/release/percolator-keeper registry init \
  --keypair ~/.config/solana/id.json \
  --rpc-url http://localhost:8899

# Expected output:
# ✓ Registry initialized successfully!
#   Registry PDA: AjxXizziXXRneEskQ54GPYjKd8ChDGfma9ovG5mYKiey
#   Governance: 3sEw2iqZEuBX9s9DeN8BcUpqaeRoi9BbziQT5QjRwAnN
#   Signature: <TX_SIG>
```

**Note**: The `registry init` subcommand needs to be added to percolator-keeper. See REGISTRY_INITIALIZATION.md for implementation details.

---

## Step 4: Setup DLP (Liquidity Provider)

As the DLP, you'll provide liquidity and act as counterparty for all trades.

**⚠️ CRITICAL**: You MUST set `BARISTA_DLP_KEYPAIR` environment variable before using barista-dlp commands. Due to Commander.js limitations, the `--keypair` flag doesn't work properly without this environment variable set.

### 4.1: Create DLP Wallet

```bash
# Create a dedicated DLP wallet
solana-keygen new --outfile ~/.config/solana/dlp-wallet.json

# Get the address
solana-keygen pubkey ~/.config/solana/dlp-wallet.json
# Save this: <DLP_PUBKEY>

# ⚠️ CRITICAL: Set the environment variable NOW
# Replace <YOUR_USER> with your actual username
export BARISTA_DLP_KEYPAIR=/Users/<YOUR_USER>/.config/solana/dlp-wallet.json

# Fund the wallet (1002 SOL: 1000 for capital + 2 for fees)
solana airdrop 1002 <DLP_PUBKEY> --url localhost

# Verify balance
solana balance <DLP_PUBKEY> --url localhost
# Should show: 1002 SOL
```

### 4.2: Install DLP CLI

```bash
# Install the DLP CLI globally from npm
npm install -g @barista-dex/cli-dlp

# Verify installation
barista-dlp --help

# Or use npx (no installation required)
npx @barista-dex/cli-dlp --help

# IMPORTANT: Set the DLP keypair environment variable
# The CLI requires this due to Commander.js option parsing
export BARISTA_DLP_KEYPAIR=/Users/<YOUR_USER>/.config/solana/dlp-wallet.json

# Optional: Set network (defaults to localnet)
export BARISTA_DLP_NETWORK=localnet

# Note: These environment variables are REQUIRED for barista-dlp CLI.
# Without BARISTA_DLP_KEYPAIR set, the --keypair flag won't work properly.
# The program IDs must be set in Step 2 (BARISTA_LOCALNET_ROUTER_PROGRAM_ID, etc.)
```

### 4.3: Deposit Capital

```bash
# IMPORTANT: Ensure BARISTA_DLP_KEYPAIR is set first!
# export BARISTA_DLP_KEYPAIR=/Users/<YOUR_USER>/.config/solana/dlp-wallet.json

# Deposit 1000 SOL to DLP portfolio (auto-creates portfolio)
barista-dlp deposit --amount 1000000000000 --network localnet

# Note: --keypair is optional if BARISTA_DLP_KEYPAIR is set
# If not set, the command will fail with "--keypair is required"

# Expected output:
# ✓ Portfolio initialized
# ✓ Deposited 1000.0 SOL to portfolio!

# Verify portfolio
barista-dlp portfolio

# Expected output:
# ═══════════════════════════════════════
#          DLP Portfolio Summary
# ═══════════════════════════════════════
# Principal (Deposited)    1000.0 SOL
# Realized PnL             +0.0 SOL
# ───────────────────────────────────────
# Total Equity             1000.0 SOL
```

### 4.4: Create Instrument (Market Identifier)

```bash
# Generate a keypair for SOL-PERP instrument
solana-keygen new --no-bip39-passphrase --outfile ./sol-perp-instrument.json

# Get the instrument ID
solana-keygen pubkey ./sol-perp-instrument.json
# Save this: <INSTRUMENT_ID>
```

### 4.5: Create Slab

```bash
# IMPORTANT: Ensure BARISTA_DLP_KEYPAIR is set first!
# export BARISTA_DLP_KEYPAIR=/Users/<YOUR_USER>/.config/solana/dlp-wallet.json

# Create slab (commands updated - use dash instead of colon)
barista-dlp slab-create

# Or specify all parameters:
barista-dlp slab-create \
  --instrument <INSTRUMENT_ID> \
  --mark-price 50000.00 \
  --taker-fee 10 \
  --contract-size 1.0 \
  --network localnet \
  --yes

# Expected output:
# ✓ Slab created successfully!
#   Slab Address: <SLAB_ADDRESS>
#   Signature: <TX_SIGNATURE>
#
# ⚠ Save this slab address! You'll need it for trading

# Verify slab
barista-dlp slab-view --address <SLAB_ADDRESS> --detailed

# Expected output:
# ═══════════════════════════════════════
#            Slab Information
# ═══════════════════════════════════════
# Slab Address         <SLAB_ADDRESS>
# LP Owner (DLP)       <DLP_PUBKEY>
# Mark Price           $50,000.00
# Taker Fee            10.00 bps
# Contract Size        1.000000
```

### 4.6: Initialize Oracle

Use the keeper binary for oracle operations:

```bash
# Build keeper if not already built
cargo build --release --bin percolator-keeper

# Set oracle program ID for convenience
export BARISTA_ORACLE_PROGRAM=<ORACLE_PROGRAM_ID>

# Initialize oracle for the instrument
./target/release/percolator-keeper oracle init \
  --instrument <INSTRUMENT_ID> \
  --price 50000 \
  --keypair ~/.config/solana/dlp-wallet.json \
  --rpc-url http://localhost:8899

# Expected output:
# ✓ Oracle initialized successfully!
#   Oracle Address: 8xR4tP...nZk3vL
#   Instrument: <INSTRUMENT_ID>
#   Initial Price: $50,000.00
#   Authority: <DLP_PUBKEY>
#
# ⚠ Save the oracle address!

# Save the oracle address: <ORACLE_ADDRESS>

# Verify oracle
./target/release/percolator-keeper oracle show \
  --oracle <ORACLE_ADDRESS> \
  --rpc-url http://localhost:8899
```

**Your DLP setup is complete!** You now have:
- ✅ Portfolio with 1000 SOL capital
- ✅ Slab for BTC-PERP trading
- ✅ Oracle for price feeds

---

## Step 5: Setup Traders

Create multiple trader accounts to simulate a trading environment.

### 5.1: Install Trader CLI

```bash
# Install the trader CLI globally from npm
npm install -g @barista-dex/cli

# Verify installation
barista --help

# Or use npx (no installation required)
npx @barista-dex/cli --help
```

### 5.2: Create Trader Wallets

```bash
# Trader 1
solana-keygen new --outfile ~/.config/solana/trader1.json
solana airdrop 100 $(solana-keygen pubkey ~/.config/solana/trader1.json) --url localhost

# Trader 2
solana-keygen new --outfile ~/.config/solana/trader2.json
solana airdrop 100 $(solana-keygen pubkey ~/.config/solana/trader2.json) --url localhost

# Verify balances
solana balance $(solana-keygen pubkey ~/.config/solana/trader1.json) --url localhost
solana balance $(solana-keygen pubkey ~/.config/solana/trader2.json) --url localhost
```

### 5.3: Initialize Trader Portfolios

```bash
# Trader 1 - Deposit 50 SOL
barista deposit \
  --amount 50000000000 \
  --keypair ~/.config/solana/trader1.json \
  --network localnet

# Trader 2 - Deposit 50 SOL
barista deposit \
  --amount 50000000000 \
  --keypair ~/.config/solana/trader2.json \
  --network localnet

# Verify portfolios
barista portfolio --keypair ~/.config/solana/trader1.json --network localnet
barista portfolio --keypair ~/.config/solana/trader2.json --network localnet
```

---

## Step 6: Execute Trades

Now you can simulate trading!

**📝 Note for Localnet**: You must specify `--oracle <ORACLE_ADDRESS>` for all buy/sell commands on localnet. On mainnet/devnet, the oracle is looked up from the slab registry automatically (Pyth integration), but for localnet you need to pass it explicitly since we're using custom test oracles.

### 6.0: Check Oracle Price (Optional)

Before trading, you can verify the current oracle price:

```bash
# Check oracle price by instrument
barista price \
  --instrument <INSTRUMENT_ID> \
  --network localnet

# Or check oracle price directly
barista price \
  --oracle <ORACLE_ADDRESS> \
  --network localnet

# Expected output:
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ORACLE PRICE (Testing/Localnet)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Price:       $50,000.00
# Updated:     5s ago
#
# Oracle:     <ORACLE_ADDRESS>
# Instrument: <INSTRUMENT_ID>
# Authority:  <DLP_PUBKEY>
#
# Note: Custom oracle for localnet testing only.
```

### 6.1: Understanding Order Types

Barista DEX supports two order execution types:

**Market Orders (recommended for v0):**
- Omit the `--price` parameter
- Executes at current oracle price
- Tighter slippage protection (±0.5%)
- Best for immediate fills at fair price

**Limit Orders:**
- Specify `--price <value>`
- Executes at your specified price
- Wider sanity check (±20% of oracle)
- ⚠️ **v0 limitation**: Fills immediately (atomic), not a resting order
- True resting limit orders coming in v1+

**For most testing, use market orders** - they're simpler and match production behavior better.

### 6.2: Trader 1 - Buy BTC-PERP (Market Order)

```bash
# Buy 1 BTC contract at market price
barista buy \
  --slab <SLAB_ADDRESS> \
  --oracle <ORACLE_ADDRESS> \
  --quantity 1 \
  --keypair ~/.config/solana/trader1.json \
  --network localnet

# Note: No --price parameter = market order
# Quantity uses human-readable decimals (6 decimal places)
# --quantity 1 = 1.000000 contracts

# Expected output:
# Market Order: Executes at oracle price (±0.5% slippage tolerance)
# ✓ Order executed!
#   Side: Buy
#   Quantity: 1.0
#   Fill Price: $50,000.00 (oracle price)
#   PnL: 0.0 SOL (opening position)
```

**Optional: Using Limit Orders**

```bash
# Buy 1 BTC contract with limit price $50,000
barista buy \
  --slab <SLAB_ADDRESS> \
  --quantity 1 \
  --price 50000 \
  --keypair ~/.config/solana/trader1.json \
  --network localnet

# Note: --price specified = limit order (atomic fill in v0)
# Price is sanity-checked within ±20% of oracle, then fills immediately
```

### 6.3: Trader 2 - Sell BTC-PERP (Market Order)

```bash
# Sell 0.5 BTC contracts at market price (short position)
barista sell \
  --slab <SLAB_ADDRESS> \
  --quantity 0.5 \
  --keypair ~/.config/solana/trader2.json \
  --network localnet

# Expected output:
# Market Order: Executes at oracle price (±0.5% slippage tolerance)
# ✓ Order executed!
#   Side: Sell
#   Quantity: 0.5
#   Fill Price: $50,000.00 (oracle price)
#   PnL: 0.0 SOL (opening position)
```

### 6.4: Close Positions with PnL

First, update the oracle to simulate price movement:

```bash
# Update oracle price to $51,000 (simulate BTC price increase)
percolator-keeper oracle update \
  --oracle <ORACLE_ADDRESS> \
  --price 51000 \
  --keypair ~/.config/solana/dlp-wallet.json \
  --rpc-url http://localhost:8899
```

Now traders can close their positions at the new market price:

```bash
# Trader 1 - Close long position (profit)
# Sell the 1.0 BTC bought earlier at new market price
barista sell \
  --slab <SLAB_ADDRESS> \
  --quantity 1 \
  --keypair ~/.config/solana/trader1.json \
  --network localnet

# Expected output:
# Market Order: Executes at oracle price (±0.5% slippage tolerance)
# ✓ Order executed!
#   Side: Sell
#   Quantity: 1.0
#   Fill Price: $51,000.00
#   Realized PnL: +0.02 SOL (profit!)
#   SOL transferred from DLP → Trader

# Trader 2 - Close short position (loss)
# Buy back the 0.5 BTC sold earlier at new market price
barista buy \
  --slab <SLAB_ADDRESS> \
  --quantity 0.5 \
  --keypair ~/.config/solana/trader2.json \
  --network localnet

# Expected output:
# Market Order: Executes at oracle price (±0.5% slippage tolerance)
# ✓ Order executed!
#   Side: Buy
#   Quantity: 0.5
#   Fill Price: $51,000.00
#   Realized PnL: -0.01 SOL (loss)
#   SOL transferred from Trader → DLP
```

---

## Step 7: Monitor Portfolios

Check how PnL has settled across accounts:

### DLP Portfolio

```bash
barista-dlp portfolio --detailed

# Expected output:
# ═══════════════════════════════════════
#          DLP Portfolio Summary
# ═══════════════════════════════════════
# Principal (Deposited)    1000.0 SOL
# Realized PnL             -0.01 SOL  ← DLP lost (traders won)
# ───────────────────────────────────────
# Total Equity             999.99 SOL
#
# ⚠ Warning: Negative PnL - Traders are currently winning
```

### Trader Portfolios

```bash
# Trader 1 (profitable)
barista portfolio --keypair ~/.config/solana/trader1.json --network localnet

# Expected output:
# Portfolio Summary:
#   Principal: 50.0 SOL
#   Realized PnL: +0.02 SOL  ← Won from DLP
#   Total Equity: 50.02 SOL

# Trader 2 (unprofitable)
barista portfolio --keypair ~/.config/solana/trader2.json --network localnet

# Expected output:
# Portfolio Summary:
#   Principal: 50.0 SOL
#   Realized PnL: -0.01 SOL  ← Lost to DLP
#   Total Equity: 49.99 SOL
```

**Zero-Sum Validation**:
- DLP PnL: -0.01 SOL
- Trader 1 PnL: +0.02 SOL
- Trader 2 PnL: -0.01 SOL
- **Total**: +0.02 - 0.01 - 0.01 = 0 ✅ (minus fees)

---

## Complete Trading Scenarios

### Scenario 1: Long Position Profit

```bash
# Setup: BTC @ $50,000 (oracle price)
# Trader 1 buys 1.0 BTC-PERP at market
barista buy --slab <SLAB> -q 1 --keypair trader1.json --network localnet
# Fills at $50,000 (oracle price with ±0.5% slippage tolerance)

# BTC rises to $52,000 - update oracle
percolator-keeper oracle update --oracle <ORACLE> --price 52000 --keypair dlp.json --rpc-url http://localhost:8899

# Trader 1 sells 1.0 BTC-PERP at new market price (close position)
barista sell --slab <SLAB> -q 1 --keypair trader1.json --network localnet
# Fills at $52,000 (new oracle price)

# Note: Market orders (no --price) execute at oracle price with tight slippage protection
# Quantity uses human-readable decimals: -q 1 = 1.000000 contracts

# Result:
# - Trader 1 profit: ~0.04 SOL
# - DLP loss: ~0.04 SOL
# - SOL transferred: DLP → Trader 1
```

### Scenario 2: Short Position Profit

```bash
# Setup: BTC @ $50,000 (oracle price)
# Trader 2 sells 0.5 BTC-PERP (short position)
barista sell --slab <SLAB> -q 0.5 --keypair trader2.json --network localnet
# Fills at $50,000 (oracle price with ±0.5% slippage tolerance)

# BTC drops to $48,000 - update oracle
percolator-keeper oracle update --oracle <ORACLE> --price 48000 --keypair dlp.json --rpc-url http://localhost:8899

# Trader 2 buys 0.5 BTC-PERP at new market price (close position)
barista buy --slab <SLAB> -q 0.5 --keypair trader2.json --network localnet
# Fills at $48,000 (new oracle price)

# Note: Market orders execute at oracle price with ±0.5% slippage tolerance
# Quantity uses human-readable decimals: -q 0.5 = 0.500000 contracts

# Result:
# - Trader 2 profit: ~0.02 SOL
# - DLP loss: ~0.02 SOL
# - SOL transferred: DLP → Trader 2
```

### Scenario 3: Multiple Traders, Mixed Outcomes

```bash
# Setup: BTC @ $50k
# Trader 1: Buy 1.0 BTC at market
barista buy --slab <SLAB> -q 1 --keypair trader1.json --network localnet

# Trader 2: Sell 0.5 BTC at market (short)
barista sell --slab <SLAB> -q 0.5 --keypair trader2.json --network localnet

# Price moves to $51k - update oracle
percolator-keeper oracle update --oracle <ORACLE> --price 51000 --keypair dlp.json --rpc-url http://localhost:8899

# Trader 1 closes at market (profit)
barista sell --slab <SLAB> -q 1 --keypair trader1.json --network localnet

# Trader 2 closes at market (loss)
barista buy --slab <SLAB> -q 0.5 --keypair trader2.json --network localnet

# Note: All trades use market orders (no --price specified)
# Market orders execute at oracle price with ±0.5% slippage tolerance
# Quantity uses human-readable decimals: -q 1 = 1.000000 contracts

# Results:
# - Trader 1: +0.02 SOL (long profit)
# - Trader 2: -0.01 SOL (short loss)
# - DLP: -0.01 SOL (net loss to traders)
```

---

## Advanced Usage

### Add More Instruments

Create multiple trading pairs:

```bash
# Create SOL-PERP instrument
solana-keygen new --no-bip39-passphrase --outfile ./sol-perp-instrument.json

# Create slab for SOL-PERP
barista-dlp slab-create \
  --instrument $(solana-keygen pubkey ./sol-perp-instrument.json) \
  --mark-price 100.00 \
  --taker-fee 10 \
  --contract-size 1.0 \
  --yes

# Now traders can trade both BTC-PERP and SOL-PERP
```

### Add More DLPs

Create competing liquidity providers:

```bash
# Create DLP 2
solana-keygen new --outfile ~/.config/solana/dlp2-wallet.json
solana airdrop 502 $(solana-keygen pubkey ~/.config/solana/dlp2-wallet.json) --url localhost

# Deposit capital
barista-dlp deposit --amount 500000000000 --keypair ~/.config/solana/dlp2-wallet.json --network localnet

# Create competing slab
barista-dlp slab-create \
  --instrument <SAME_INSTRUMENT_ID> \
  --mark-price 50000.00 \
  --taker-fee 5 \
  --contract-size 1.0 \
  --keypair ~/.config/solana/dlp2-wallet.json \
  --network localnet \
  --yes

# Traders can now choose between slabs (compare fees!)
```

### Simulate Price Movements

Update oracle prices to simulate market movements using the keeper:

```bash
# Update oracle to $52,000 (as the DLP/authority)
./target/release/percolator-keeper oracle update \
  --oracle <ORACLE_ADDRESS> \
  --price 52000 \
  --keypair ~/.config/solana/dlp-wallet.json \
  --rpc-url http://localhost:8899

# Expected output:
# ✓ Oracle price updated successfully!
#   New Price:    $52,000.00
#   Confidence:   ±$520.00 (default 0.1%)
#   Transaction:  4kE8pN...qRt5M

# Verify update
./target/release/percolator-keeper oracle show \
  --oracle <ORACLE_ADDRESS> \
  --rpc-url http://localhost:8899

# Traders can also check the new price
barista price --oracle <ORACLE_ADDRESS> --network localnet
```

### Automated Price Updates (Oracle Crank with CoinGecko Feed)

For automated price updates from real market data (CoinGecko API):

```bash
# Start oracle crank (fetches from CoinGecko by default)
./target/release/percolator-keeper oracle crank \
  --oracle <ORACLE_ADDRESS> \
  --instrument BTC \
  --keypair ~/.config/solana/dlp-wallet.json \
  --rpc-url http://localhost:8899 \
  --interval 30

# Example for different assets:
# BTC:  --instrument BTC
# ETH:  --instrument ETH
# SOL:  --instrument SOL
# USDC: --instrument USDC
# USDT: --instrument USDT

# Or use full instrument names:
# BTC/USD, BTC-PERP, ETH/USD, SOL-PERP, etc.
# The crank extracts the base symbol (BTC, ETH, SOL) and maps to CoinGecko ID

# The crank will:
# - Fetch current price from CoinGecko API every 30 seconds
# - Update the on-chain oracle if price changed significantly
# - Display price updates in terminal
# - Run continuously until you press Ctrl+C

# You can also specify the price source explicitly:
./target/release/percolator-keeper oracle crank \
  --oracle <ORACLE_ADDRESS> \
  --instrument SOL \
  --source coingecko \
  --interval 30 \
  --keypair ~/.config/solana/dlp-wallet.json \
  --rpc-url http://localhost:8899

# Other supported sources:
# --source binance   (for Binance spot prices)
# --source coinbase  (for Coinbase prices)

# Press Ctrl+C to stop the crank
```

**Supported Instrument Symbols** (auto-mapped to CoinGecko):
- `BTC` → bitcoin
- `ETH` → ethereum
- `SOL` → solana
- `USDC` → usd-coin
- `USDT` → tether
- Any other symbol → used as-is (must match CoinGecko ID)

**Find CoinGecko IDs**: https://www.coingecko.com/

---

## Monitoring and Analytics

### Real-Time Portfolio Monitoring

```bash
# Watch DLP portfolio (updates every 2 seconds)
watch -n 2 "barista-dlp portfolio"

# Watch trader portfolio
watch -n 2 "barista portfolio --keypair ~/.config/solana/trader1.json --network localnet"
```

### Transaction History

```bash
# View recent transactions for an address
solana transaction-history <ADDRESS> --url localhost
```

### Slab Statistics

```bash
# View slab details (DLP)
barista-dlp slab-view --address <SLAB_ADDRESS> --detailed
```

### Oracle Price Monitoring

```bash
# Check current oracle price (traders)
barista price --instrument <INSTRUMENT_ID> --network localnet
barista price --oracle <ORACLE_ADDRESS> --network localnet

# View oracle details (using keeper)
./target/release/percolator-keeper oracle show \
  --oracle <ORACLE_ADDRESS> \
  --rpc-url http://localhost:8899

# Watch oracle price (updates every 5 seconds)
watch -n 5 "barista price --oracle <ORACLE_ADDRESS> --network localnet"
```

---

## Troubleshooting

### Issue: "--keypair is required" (for barista-dlp commands)

**Solution**: Set the BARISTA_DLP_KEYPAIR environment variable
```bash
export BARISTA_DLP_KEYPAIR=/Users/<YOUR_USER>/.config/solana/dlp-wallet.json

# Then retry your command
barista-dlp deposit --amount 1000000000000 --network localnet
```

**Root cause**: Commander.js doesn't properly handle the `--keypair` option without the environment variable set as a default value. This is a known limitation.

### Issue: "Portfolio not found"

**Solution**: Initialize portfolio first
```bash
barista deposit --amount 1000000000 --keypair <KEYPAIR> --network localnet
```

### Issue: "Insufficient balance"

**Solution**: Airdrop more SOL
```bash
solana airdrop 100 <ADDRESS> --url localhost
```

### Issue: "Slab not found"

**Solution**: Verify slab address
```bash
barista-dlp slab-view --address <SLAB_ADDRESS> --network localnet
```

### Issue: "Cannot withdraw with open positions"

**Solution**: Close all positions before withdrawing
```bash
# Check open positions
barista portfolio --keypair <KEYPAIR> --network localnet

# Close positions (sell if long, buy if short)
barista sell --slab <SLAB> -q <QUANTITY> -p <PRICE> --keypair <KEYPAIR> --network localnet
```

### Issue: "Error 0x2" (InvalidAccount) when trading

**Solution**: The DLP portfolio doesn't exist for the slab's lp_owner. This happens when:
1. The slab was created without the `BARISTA_DLP_KEYPAIR` environment variable set
2. The slab was created with a different DLP keypair than the one that deposited funds

**Fix**: Reset validator and recreate everything with `BARISTA_DLP_KEYPAIR` set:
```bash
# 1. Stop validator and reset
solana-test-validator --reset

# 2. Redeploy programs (see below)

# 3. Set DLP keypair BEFORE creating slab
export BARISTA_DLP_KEYPAIR=/Users/<YOUR_USER>/.config/solana/dlp-wallet.json

# 4. Reinitialize registry, deposit, create slab
# (Follow Steps 3-4 from the guide with the env var set)
```

### Issue: Programs not deployed

**Solution**: Redeploy programs
```bash
# Build all programs (from repo root)
./build-programs.sh

# Deploy each program
solana program deploy target/deploy/percolator_router.so
solana program deploy target/deploy/percolator_slab.so
solana program deploy target/deploy/percolator_oracle.so
```

---

## Testing Checklist

Use this checklist to verify your simulator is working:

- [ ] Localnet running (`solana cluster-version` works)
- [ ] All 3 programs deployed (router, slab, oracle)
- [ ] Registry initialized
- [ ] DLP wallet funded (1000+ SOL)
- [ ] DLP portfolio created and funded
- [ ] Slab created successfully
- [ ] Oracle initialized
- [ ] Trader wallets funded (100 SOL each)
- [ ] Trader portfolios created
- [ ] First trade executed successfully
- [ ] PnL settlement verified (SOL transferred)
- [ ] Portfolio balances update correctly
- [ ] Zero-sum verified (total PnL = 0)

---

## Next Steps

### Extend Your Simulator

1. **Add More Traders**: Create 5-10 trader accounts for realistic volume
2. **Automated Trading**: Write scripts to execute trades automatically
3. **Price Oracle Updates**: Simulate realistic price movements
4. **Market Making**: Program a bot to provide liquidity
5. **Stress Testing**: Execute hundreds of trades to test performance
6. **Integration Testing**: Test your own trading applications

### Learn More

- **DLP Operations**: See [DLP_LOCALNET_SETUP_GUIDE.md](DLP_LOCALNET_SETUP_GUIDE.md)
- **Trader Operations**: See [cli-client README](../cli-client/README.md)
- **SDK Integration**: See [SDK README](../sdk/README.md)
- **Architecture**: See [ARCHITECTURE.md](../ARCHITECTURE.md)

---

## Summary

You now have a complete perpetuals trading simulator running on localnet:

**Infrastructure**:
- ✅ 3 programs deployed (router, slab, oracle)
- ✅ Registry initialized

**DLP**:
- ✅ 1000 SOL capital
- ✅ BTC-PERP slab @ $50,000
- ✅ Earning fees + counterparty PnL

**Traders**:
- ✅ Multiple accounts funded
- ✅ Portfolios created
- ✅ Trading BTC-PERP with real PnL settlement

**Features**:
- Real-time PnL settlement
- Zero-sum accounting
- SOL transfers between portfolios
- CLI-based trading interface
- Portfolio monitoring

**Time to Setup**: ~30 minutes
**Cost**: $0 (localnet is free!)

Happy trading! 🚀

---

**Created**: 2025-10-26
**Version**: v0.5 (Counterparty Settlement Model)
**Programs**: Router, Slab, Oracle
**CLIs**: cli-dlp (DLPs), cli-client (Traders)

---

## Update: 2025-10-27 - PnL Tracking Now Available

### New Feature: Complete PnL Tracking

The portfolio command now displays comprehensive PnL information for all positions!

#### What's New

**Entry Price Tracking**:
- Every position now tracks its weighted average entry price
- Multiple buys at different prices are averaged correctly
- Entry price used for unrealized PnL calculation

**Realized PnL**:
- Sell orders now properly realize PnL
- Shows cumulative realized gains/losses per position
- Historical PnL preserved even after position closed

**Unrealized PnL**:
- Calculated from (current_mark_price - entry_price) × position_qty
- Updates in real-time as mark price changes
- Shows potential gain/loss if position closed now

#### Portfolio Display Example

```bash
$ barista portfolio --network localnet

📊 Portfolio Summary

💰 Balance
Equity:                 49.940000 SOL  # Reflects realized PnL
Principal (Deposits):   50.000000 SOL
Free Collateral:        49.737794 SOL

📈 PnL & Vesting
Total Realized PnL:     -0.060000 SOL  # Cumulative from all trades
Vested PnL:             -0.060000 SOL

📍 Trading Positions

┌────────────────┬────────────┬──────────────┬─────────────┬────────────┬─────────────────┬─────────────────┐
│ Slab           │ Instrument │ Position Qty │ Entry Price │ Mark Price │ Unrealized PnL  │ Realized PnL    │
├────────────────┼────────────┼──────────────┼─────────────┼────────────┼─────────────────┼─────────────────┤
│ 4dUTGx...      │ BTC-PERP   │ 10.000000    │ $201.950000 │ $201.890000│ -0.000600       │ -0.060000       │
└────────────────┴────────────┴──────────────┴─────────────┴────────────┴─────────────────┴─────────────────┘
```

#### How It Works

**Behind the Scenes**:
- Each position gets a PositionDetails PDA (136 bytes)
- Tracks: entry price, realized PnL, fees, trade count, timestamps
- Created on first trade, closed when position reaches zero
- Rent refunded to user on position close

**PnL Calculations**:
```
Unrealized PnL = position_qty × (mark_price - entry_price)
Realized PnL   = accumulated from all closing trades
Total PnL      = Unrealized + Realized
```

**Weighted Average Entry Price**:
```
Entry Price = (old_qty × old_price + new_qty × new_price) / total_qty
```

#### Testing PnL Tracking

**Scenario 1: Simple Buy and Sell**
```bash
# Buy 10 contracts at $201.95
$ echo "y" | barista buy --slab <SLAB> --quantity 10 --oracle <ORACLE> --network localnet
# Entry Price: $201.950000, Unrealized PnL: $0.00

# Price moves to $202.00
$ barista portfolio --network localnet
# Entry Price: $201.950000, Unrealized PnL: $0.50 (10 × 0.05)

# Sell 5 contracts at $202.00
$ echo "y" | barista sell --slab <SLAB> --quantity 5 --oracle <ORACLE> --network localnet
# Realized PnL: $0.25 (5 × 0.05)
# Position now: 5 contracts, Entry: $201.950000, Realized: $0.25
```

**Scenario 2: Averaging**
```bash
# Buy 10 contracts at $200.00
$ echo "y" | barista buy --slab <SLAB> --quantity 10 --oracle <ORACLE> --network localnet
# Entry Price: $200.000000

# Buy 10 more at $202.00
$ echo "y" | barista buy --slab <SLAB> --quantity 10 --oracle <ORACLE> --network localnet  
# Entry Price: $201.000000  # (10×200 + 10×202) / 20 = 201

# Sell 15 contracts at $203.00
$ echo "y" | barista sell --slab <SLAB> --quantity 15 --oracle <ORACLE> --network localnet
# Realized PnL: $30.00  # 15 × (203 - 201)
# Position now: 5 contracts, Entry: $201.000000, Realized: $30.00
```

**Scenario 3: Full Position Close**
```bash
# Close entire position
$ echo "y" | barista sell --slab <SLAB> --quantity 20 --oracle <ORACLE> --network localnet
# All PnL realized
# PositionDetails PDA closed and rent refunded
# Position removed from portfolio display
```

#### Verification

**Check On-Chain Data**:
```bash
# Get position details PDA
$ solana account <POSITION_DETAILS_PDA> --url localhost --output json

# View portfolio equity
$ barista portfolio --network localnet
# Equity = Principal + Realized PnL
```

**Track PnL Over Time**:
```bash
# Before trade
$ barista portfolio --network localnet | grep "Total Realized PnL"

# Execute trade
$ echo "y" | barista sell --slab <SLAB> --quantity 5 --oracle <ORACLE> --network localnet

# After trade  
$ barista portfolio --network localnet | grep "Total Realized PnL"
# Should show change matching realized PnL from trade
```

#### Important Notes

**Position Lifecycle**:
1. First trade → PositionDetails PDA created (user pays ~0.001 SOL rent)
2. Additional trades → PDA updated with new entry price or realized PnL
3. Position close → All PnL realized, PDA closed, rent refunded

**PnL Settlement**:
- Realized PnL settled immediately in SOL
- Equity updated to reflect gains/losses
- SOL transferred directly between portfolio accounts

**Display Accuracy**:
- Entry prices shown to 6 decimal places
- PnL values in SOL (9 decimal precision)
- Mark prices from oracle (localnet) or slab state (mainnet/devnet)

#### Troubleshooting

**"Position shows entry price as $0.00"**:
- PositionDetails PDA might not exist yet
- Only created on first trade
- Check if position was opened before PnL system deployed

**"Unrealized PnL shows as —"**:
- Missing mark price from oracle
- Oracle might not be updating
- Check oracle account has valid data

**"Equity doesn't match expected"**:
- Check Total Realized PnL
- Equity = Principal + Realized PnL
- Fees also deducted from equity

---

**For complete implementation details, see:**
- `DEBUGGING_SESSION_SUMMARY.md` - Session 6
- `PROJECT_DEVELOPMENT_HISTORY.md` - 2025-10-27 entry
- `V1_ROADMAP.md` - PnL Tracking Complete section

