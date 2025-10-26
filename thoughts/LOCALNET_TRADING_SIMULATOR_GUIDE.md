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
- Anchor 0.28+

# Verify installations
rustc --version
solana --version
node --version
anchor --version
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

### Deploy Router Program

```bash
cd programs/router

# Build and deploy
anchor build
anchor deploy

# Save the program ID
# Output: Program Id: <ROUTER_PROGRAM_ID>
```

### Deploy Slab Program

```bash
cd ../slab

# Build and deploy
anchor build
anchor deploy

# Save the program ID
# Output: Program Id: <SLAB_PROGRAM_ID>
```

### Deploy Oracle Program

```bash
cd ../oracle

# Build and deploy
anchor build
anchor deploy

# Save the program ID
# Output: Program Id: <ORACLE_PROGRAM_ID>
```

**Important**: Save all three program IDs - you'll need them for the next steps.

---

## Step 3: Initialize Router Registry

The router needs a registry account to track slabs:

```bash
cd ../../cli

# Initialize registry
cargo run -- init-registry \
  --keypair ~/.config/solana/id.json \
  --router-program <ROUTER_PROGRAM_ID> \
  --network localnet

# Expected output:
# ✓ Registry initialized at: <REGISTRY_ADDRESS>
```

---

## Step 4: Setup DLP (Liquidity Provider)

As the DLP, you'll provide liquidity and act as counterparty for all trades.

### 4.1: Create DLP Wallet

```bash
# Create a dedicated DLP wallet
solana-keygen new --outfile ~/.config/solana/dlp-wallet.json

# Get the address
solana-keygen pubkey ~/.config/solana/dlp-wallet.json
# Save this: <DLP_PUBKEY>

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

# Set environment variables for convenience
export BARISTA_DLP_KEYPAIR=~/.config/solana/dlp-wallet.json
export BARISTA_DLP_NETWORK=localnet
```

### 4.3: Deposit Capital

```bash
# Deposit 1000 SOL to DLP portfolio (auto-creates portfolio)
barista-dlp deposit --amount 1000000000000

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
# Generate a keypair for BTC-PERP instrument
solana-keygen new --no-bip39-passphrase --outfile ./btc-perp-instrument.json

# Get the instrument ID
solana-keygen pubkey ./btc-perp-instrument.json
# Save this: <INSTRUMENT_ID>
```

### 4.5: Create Slab

```bash
# Create slab interactively
barista-dlp slab:create

# Or specify all parameters:
barista-dlp slab:create \
  --instrument <INSTRUMENT_ID> \
  --mark-price 50000.00 \
  --taker-fee 10 \
  --contract-size 1.0 \
  --yes

# Expected output:
# ✓ Slab created successfully!
#   Slab Address: <SLAB_ADDRESS>
#   Signature: <TX_SIGNATURE>
#
# ⚠ Save this slab address! You'll need it for trading

# Verify slab
barista-dlp slab:view --address <SLAB_ADDRESS> --detailed

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

```bash
# Set oracle program ID for convenience
export BARISTA_ORACLE_PROGRAM_ID=<ORACLE_PROGRAM_ID>

# Initialize oracle for the instrument
barista-dlp oracle:init \
  --instrument <INSTRUMENT_ID> \
  --initial-price 50000.00

# Or use interactive mode:
barista-dlp oracle:init

# Expected output:
# ═══════════════════════════════════════
#        Oracle Initialization
# ═══════════════════════════════════════
# Oracle PDA:        8xR4tP...nZk3vL
# Instrument:        BTC...PERP1
# Initial Price:     $50,000.00
# Authority:         <DLP_PUBKEY>
# Bump:              255
# ═══════════════════════════════════════
#
# ✓ Oracle initialized successfully!
#   Oracle Address: 8xR4tP...nZk3vL
#   Transaction: 3jD9qX...mYr8K
#
# ⚠ Save the oracle address!
# Traders will need this address to verify prices.

# Save the oracle address: <ORACLE_ADDRESS>

# Verify oracle
barista-dlp oracle:view --address <ORACLE_ADDRESS>
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
npm install -g @barista-dex/cli-client

# Verify installation
barista --help

# Or use npx (no installation required)
npx @barista-dex/cli-client --help
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

### 6.1: Trader 1 - Buy BTC-PERP

```bash
barista buy \
  --slab <SLAB_ADDRESS> \
  --quantity 1000000 \
  --limit-price 50000000000 \
  --keypair ~/.config/solana/trader1.json \
  --network localnet

# Expected output:
# ✓ Order executed!
#   Side: Buy
#   Quantity: 1.0
#   Fill Price: $50,000.00
#   PnL: 0.0 SOL (opening position)
```

### 6.2: Trader 2 - Sell BTC-PERP

```bash
barista sell \
  --slab <SLAB_ADDRESS> \
  --quantity 500000 \
  --limit-price 50000000000 \
  --keypair ~/.config/solana/trader2.json \
  --network localnet

# Expected output:
# ✓ Order executed!
#   Side: Sell
#   Quantity: 0.5
#   Fill Price: $50,000.00
#   PnL: 0.0 SOL (opening position)
```

### 6.3: Close Positions with PnL

Assume BTC price moves to $51,000 (update oracle or use market order):

```bash
# Trader 1 - Close long position (profit)
barista sell \
  --slab <SLAB_ADDRESS> \
  --quantity 1000000 \
  --limit-price 51000000000 \
  --keypair ~/.config/solana/trader1.json \
  --network localnet

# Expected output:
# ✓ Order executed!
#   Side: Sell
#   Quantity: 1.0
#   Fill Price: $51,000.00
#   Realized PnL: +0.02 SOL (profit!)
#   SOL transferred from DLP → Trader

# Trader 2 - Close short position (loss)
barista buy \
  --slab <SLAB_ADDRESS> \
  --quantity 500000 \
  --limit-price 51000000000 \
  --keypair ~/.config/solana/trader2.json \
  --network localnet

# Expected output:
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
# Setup: BTC @ $50,000
# Trader 1 buys 1.0 BTC-PERP
barista buy --slab <SLAB> -q 1000000 -p 50000000000 --keypair trader1.json --network localnet

# BTC rises to $52,000
# Trader 1 sells 1.0 BTC-PERP (close position)
barista sell --slab <SLAB> -q 1000000 -p 52000000000 --keypair trader1.json --network localnet

# Result:
# - Trader 1 profit: ~0.04 SOL
# - DLP loss: ~0.04 SOL
# - SOL transferred: DLP → Trader 1
```

### Scenario 2: Short Position Profit

```bash
# Setup: BTC @ $50,000
# Trader 2 sells 0.5 BTC-PERP (short)
barista sell --slab <SLAB> -q 500000 -p 50000000000 --keypair trader2.json --network localnet

# BTC drops to $48,000
# Trader 2 buys 0.5 BTC-PERP (close position)
barista buy --slab <SLAB> -q 500000 -p 48000000000 --keypair trader2.json --network localnet

# Result:
# - Trader 2 profit: ~0.02 SOL
# - DLP loss: ~0.02 SOL
# - SOL transferred: DLP → Trader 2
```

### Scenario 3: Multiple Traders, Mixed Outcomes

```bash
# Trader 1: Buy 1.0 BTC @ $50k
barista buy --slab <SLAB> -q 1000000 -p 50000000000 --keypair trader1.json --network localnet

# Trader 2: Sell 0.5 BTC @ $50k
barista sell --slab <SLAB> -q 500000 -p 50000000000 --keypair trader2.json --network localnet

# Price moves to $51k

# Trader 1 closes (profit)
barista sell --slab <SLAB> -q 1000000 -p 51000000000 --keypair trader1.json --network localnet

# Trader 2 closes (loss)
barista buy --slab <SLAB> -q 500000 -p 51000000000 --keypair trader2.json --network localnet

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
barista-dlp slab:create \
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
barista-dlp slab:create \
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

Update oracle prices to simulate market movements:

```bash
# Update oracle to $52,000 (as the DLP/authority)
barista-dlp oracle:update \
  --address <ORACLE_ADDRESS> \
  --price 52000.00 \
  --confidence 0.00

# Expected output:
# ✓ Oracle price updated successfully!
#   New Price:    $52,000.00
#   Confidence:   ±$0.00
#   Transaction:  4kE8pN...qRt5M

# Verify update
barista-dlp oracle:view --address <ORACLE_ADDRESS>
```

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
# View slab details
barista-dlp slab:view --address <SLAB_ADDRESS> --detailed
```

---

## Troubleshooting

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
barista-dlp slab:view --address <SLAB_ADDRESS> --network localnet
```

### Issue: "Cannot withdraw with open positions"

**Solution**: Close all positions before withdrawing
```bash
# Check open positions
barista portfolio --keypair <KEYPAIR> --network localnet

# Close positions (sell if long, buy if short)
barista sell --slab <SLAB> -q <QUANTITY> -p <PRICE> --keypair <KEYPAIR> --network localnet
```

### Issue: Programs not deployed

**Solution**: Redeploy programs
```bash
cd programs/router && anchor deploy
cd ../slab && anchor deploy
cd ../oracle && anchor deploy
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
