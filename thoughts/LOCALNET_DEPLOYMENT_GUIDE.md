# Localnet Deployment Guide

Complete guide for deploying Barista DEX programs to localnet for development and testing.

---

## Prerequisites

### 1. Install Solana CLI Tools

```bash
# Install Solana CLI (stable version)
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Add to PATH - add this line to ~/.zshrc or ~/.bashrc
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Reload your shell
source ~/.zshrc  # or source ~/.bashrc

# Verify installation
solana --version
# Should show: solana-cli 1.x.x
```

### 2. Install Rust and Cargo (if not already installed)

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Verify
rustc --version
cargo --version
```

---

## Deployment Process

### Step 1: Build Programs

Build both Slab and Router programs for BPF deployment:

```bash
# From project root
cd /path/to/barista-dex

# Build slab program
cargo build-sbf --manifest-path programs/slab/Cargo.toml

# Build router program
cargo build-sbf --manifest-path programs/router/Cargo.toml
```

**Output location**:
- Slab: `target/deploy/percolator_slab.so`
- Router: `target/deploy/percolator_router.so`

**Expected output**:
```
To deploy this program:
  $ solana program deploy /path/to/barista-dex/target/deploy/percolator_slab.so
The program address will default to this keypair (override with --program-id):
  /path/to/barista-dex/target/deploy/percolator_slab-keypair.json
```

### Step 2: Start Local Validator

In a **separate terminal** (keep this running):

```bash
# Start local test validator
solana-test-validator

# Optional: Start with specific settings
solana-test-validator \
  --reset \
  --quiet
```

**What this does**:
- Starts a local Solana validator on `http://localhost:8899`
- Provides fast block times for testing
- Automatically airdrops SOL to wallets
- Resets state on each restart (with `--reset`)

**Keep this terminal open** - the validator must run continuously.

### Step 3: Configure Solana CLI

In a **new terminal**:

```bash
# Set CLI to use localnet
solana config set --url localhost

# Verify configuration
solana config get
# Should show:
# RPC URL: http://localhost:8899
# WebSocket URL: ws://localhost:8900/
# Keypair Path: /Users/you/.config/solana/id.json
# Commitment: confirmed
```

### Step 4: Setup Wallet

```bash
# Check if you have a wallet
solana address

# If no wallet exists, create one
solana-keygen new --outfile ~/.config/solana/id.json

# Check balance
solana balance

# Airdrop SOL for deployment fees (need ~5-10 SOL)
solana airdrop 10

# Verify balance
solana balance
# Should show: 10 SOL
```

### Step 5: Deploy Slab Program

```bash
# Deploy slab program
solana program deploy target/deploy/percolator_slab.so

# Example output:
# Program Id: 7xKPD9kFVZ1x2J3yHqR5mN8wL4pQvB6tC9sA3fE2gH4i
```

**Save the Program Id** - you'll need it for configuration.

**Troubleshooting**:
- If you get "Insufficient funds": `solana airdrop 5`
- If deployment fails: Check that `solana-test-validator` is still running
- To redeploy: Just run the same command again (overwrites existing program)

### Step 6: Deploy Router Program

```bash
# Deploy router program
solana program deploy target/deploy/percolator_router.so

# Example output:
# Program Id: 9aL2B8nD5kR7x3M4vT1qH6pY8wS9oC4jF7eA2bN3kG5m
```

**Save this Program Id** too.

### Step 7: Verify Deployments

```bash
# Check slab program
solana program show <SLAB_PROGRAM_ID>

# Check router program
solana program show <ROUTER_PROGRAM_ID>

# Both should show:
# Program Id: <your-program-id>
# Owner: BPFLoaderUpgradeab1e11111111111111111111111
# ProgramData Address: <data-address>
# Authority: <your-wallet-address>
# Last Deployed In Slot: <slot>
# Data Length: <size> bytes
```

---

## Configuration Updates

### Step 8: Update CLI Configuration

Edit `cli/src/config/networks.ts`:

```typescript
export const NETWORKS: Record<string, NetworkConfig> = {
  'localnet': {
    name: 'Localnet',
    rpcUrl: 'http://localhost:8899',
    routerProgramId: new PublicKey('YOUR_ROUTER_PROGRAM_ID_HERE'),  // ← Replace
    slabProgramId: new PublicKey('YOUR_SLAB_PROGRAM_ID_HERE'),      // ← Replace
    commitment: 'confirmed'
  },
  'devnet': {
    // ... existing devnet config
  },
  'mainnet-beta': {
    // ... existing mainnet config
  }
};
```

**Example** (with actual IDs):
```typescript
'localnet': {
  name: 'Localnet',
  rpcUrl: 'http://localhost:8899',
  routerProgramId: new PublicKey('9aL2B8nD5kR7x3M4vT1qH6pY8wS9oC4jF7eA2bN3kG5m'),
  slabProgramId: new PublicKey('7xKPD9kFVZ1x2J3yHqR5mN8wL4pQvB6tC9sA3fE2gH4i'),
  commitment: 'confirmed'
},
```

### Step 9: Update SDK Constants

Edit `sdk/src/constants.ts`:

```typescript
export const NETWORKS = {
  'localnet': {
    name: 'Localnet',
    rpcUrl: 'http://localhost:8899',
    routerProgramId: new PublicKey('YOUR_ROUTER_PROGRAM_ID_HERE'),  // ← Replace
    slabProgramId: new PublicKey('YOUR_SLAB_PROGRAM_ID_HERE'),      // ← Replace
    commitment: 'confirmed' as Commitment
  },
  // ... other networks
};
```

### Step 10: Rebuild CLI and SDK

```bash
# Rebuild SDK with new program IDs
cd sdk
npm run build

# Rebuild CLI with new program IDs
cd ../cli
npm run build
```

---

## Initialization & Testing

### Step 11: Initialize Router

The router needs to be initialized once to create global state:

```bash
# From cli directory
cd cli

# Initialize router (creates Registry and Authority PDAs)
node dist/index.js init --network localnet

# Expected output:
# ✓ Router initialized successfully!
#   Registry: <registry-pda-address>
#   Authority: <authority-pda-address>
```

**Note**: This only needs to be done **once** per deployment.

### Step 12: Create Portfolio

```bash
# View/create your portfolio
node dist/index.js portfolio --network localnet

# First time output:
# ✓ Portfolio created successfully!
#   Address: <portfolio-pda>
#   Equity: 0
#   IM: 0
#   Positions: []

# Subsequent calls show portfolio state:
# Portfolio: <address>
# Equity: 0 units
# Initial Margin: 0 units
# Positions: None
```

### Step 13: Deposit Collateral

Before trading, you need collateral in your portfolio:

```bash
# First, you'll need a token mint (USDC-like token)
# For testing, you can create a mock token:

# Create a test token mint
spl-token create-token
# Save the Token Address shown

# Create token account
spl-token create-account <TOKEN_MINT_ADDRESS>

# Mint some tokens to yourself (1,000,000 = 1 USDC with 6 decimals)
spl-token mint <TOKEN_MINT_ADDRESS> 1000000000

# Deposit to Barista portfolio
node dist/index.js deposit \
  --mint <TOKEN_MINT_ADDRESS> \
  --amount 1000000000 \
  --network localnet

# Verify deposit
node dist/index.js portfolio --network localnet
# Should show: Equity: 1000000000 units
```

### Step 14: Test Trading (Once Slab Exists)

```bash
# List available slabs
node dist/index.js slabs --network localnet

# Get slab info
node dist/index.js slab --slab <SLAB_ADDRESS> --network localnet

# Execute a buy order
node dist/index.js buy \
  --slab <SLAB_ADDRESS> \
  -q 100 \
  -p 50000000 \
  --network localnet

# Execute a sell order
node dist/index.js sell \
  --slab <SLAB_ADDRESS> \
  -q 50 \
  -p 51000000 \
  --network localnet
```

---

## Testing Oracle Integration (Optional)

### Step 15: Deploy Custom Oracle

For localnet testing, use the custom oracle format:

```bash
# Build keeper
cd keeper
cargo build --release

# Initialize a test oracle
./target/release/keeper oracle init \
  --symbol SOL \
  --price 100.0 \
  --network localnet

# Example output:
# ✓ Oracle created: 8kX2M5nB3vL9qR4tH7pS6wC1fY8oE9jA2dN4kP6mG3h
```

### Step 16: Start Oracle Crank (Auto-Updates)

```bash
# Start auto-updater with mock prices
keeper oracle crank \
  --oracle <ORACLE_ADDRESS> \
  --source mock \
  --interval 5 \
  --network localnet

# Or with real CoinGecko prices (for SOL):
keeper oracle crank \
  --oracle <ORACLE_ADDRESS> \
  --source coingecko \
  --symbol solana \
  --interval 10 \
  --network localnet
```

### Step 17: Verify Oracle

```bash
# Check oracle state
keeper oracle show \
  --oracle <ORACLE_ADDRESS> \
  --network localnet

# Output:
# Oracle: 8kX2M5nB3vL9qR4tH7pS6wC1fY8oE9jA2dN4kP6mG3h
# Price: 100.123456
# Confidence: ±0.01
# Timestamp: 2025-10-24 23:30:00 UTC
# Status: Trading
```

---

## Common Operations

### Redeploy Programs

If you make changes to the programs:

```bash
# 1. Rebuild
cargo build-sbf --manifest-path programs/router/Cargo.toml

# 2. Redeploy (overwrites existing program)
solana program deploy target/deploy/percolator_router.so

# Program ID stays the same!
# No need to update config files
```

### Reset Localnet State

```bash
# Stop validator (Ctrl+C in validator terminal)

# Restart with --reset flag
solana-test-validator --reset

# This clears all accounts and programs
# You'll need to redeploy everything and re-initialize
```

### Check Program Logs

```bash
# In validator terminal, you'll see program logs
# Or use solana logs:
solana logs | grep "Program <YOUR_PROGRAM_ID>"
```

### Extend Program (Add More Data/Accounts)

```bash
# If program needs more space
solana program extend <PROGRAM_ID> <ADDITIONAL_BYTES>

# Example: Add 1000 bytes
solana program extend 9aL2B8nD5kR7x3M4vT1qH6pY8wS9oC4jF7eA2bN3kG5m 1000
```

---

## Troubleshooting

### Validator Won't Start

```bash
# Check if port is already in use
lsof -i :8899

# Kill existing validator
pkill solana-test-validator

# Restart
solana-test-validator --reset
```

### Deployment Fails: "Insufficient Funds"

```bash
# Check balance
solana balance

# Airdrop more SOL
solana airdrop 10

# Try deployment again
```

### Program Deploy: "Error: Account allocation failed"

```bash
# You may need more SOL
solana airdrop 5

# Or increase max deploy size
solana program deploy \
  --max-len 500000 \
  target/deploy/percolator_router.so
```

### CLI Commands Fail: "Program not found"

1. Verify validator is running: `solana cluster-version`
2. Check program IDs in config files match deployed IDs
3. Rebuild CLI: `cd cli && npm run build`
4. Verify network setting: `node dist/index.js portfolio --network localnet`

### Transaction Fails: "Custom program error: 0x1"

Check program logs in validator terminal for detailed error messages.

Common issues:
- Portfolio not initialized
- Insufficient collateral
- Invalid slab address
- Oracle price stale

---

## Quick Reference

### Essential Commands

```bash
# Start validator
solana-test-validator

# Check validator status
solana cluster-version

# Deploy program
solana program deploy target/deploy/program.so

# Check program
solana program show <PROGRAM_ID>

# Airdrop SOL
solana airdrop 10

# Check balance
solana balance

# View portfolio
node dist/index.js portfolio --network localnet

# Initialize router (once)
node dist/index.js init --network localnet
```

### Environment Variables

```bash
# Set default network
export BARISTA_NETWORK=localnet

# Set custom RPC URL
export BARISTA_RPC_URL=http://localhost:8899

# Set custom wallet
export BARISTA_KEYPAIR_PATH=/path/to/keypair.json
```

### File Locations

- **Deployed programs**: `target/deploy/*.so`
- **Program keypairs**: `target/deploy/*-keypair.json`
- **Solana config**: `~/.config/solana/cli/config.yml`
- **Default wallet**: `~/.config/solana/id.json`
- **CLI config**: `cli/src/config/networks.ts`
- **SDK config**: `sdk/src/constants.ts`

---

## Next Steps

After successful localnet deployment:

1. **Create Slabs**: Deploy LP-run slabs for specific instruments
2. **Test Trading**: Execute buy/sell orders
3. **Oracle Integration**: Test with custom or Pyth oracles
4. **Leverage Trading**: Test spot and margin trades
5. **Portfolio Margining**: Test cross-margin calculations
6. **Liquidations**: Test liquidation mechanics

For production deployment to **devnet** or **mainnet-beta**, see `DEVNET_DEPLOYMENT_GUIDE.md` (TODO).

---

**Last Updated**: 2025-10-24
**Solana Version**: 1.x.x (stable)
**Network**: Localnet
