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

Edit `cli-client/src/config/networks.ts`:

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
cd ../cli-client
npm run build
```

---

## Initialization & Testing

### Step 11: Available CLI Commands

The TypeScript CLI (`cli-client/`) currently supports the following commands:

**Portfolio Management:**
- `portfolio` - View portfolio state
- `deposit` - Deposit collateral to vault
- `withdraw` - Withdraw collateral from vault

**Trading:**
- `buy` - Execute a buy order (market or limit)
- `sell` - Execute a sell order (market or limit)

**Discovery:**
- `slabs` - List all available LP-run slabs
- `slab` - Show detailed information about a slab
- `instruments` - List instruments (markets) in a slab
- `price` - Get current market price (best bid/ask)
- `book` - View order book depth

**Note:** Router initialization and portfolio creation are not yet implemented in the TypeScript CLI. These must be done via the SDK or Rust CLI for now.

### Step 12: Test Available Commands

```bash
# From cli-client directory
cd cli-client

# List available slabs (will be empty initially)
node dist/index.js slabs --network localnet

# Get help for any command
node dist/index.js --help
node dist/index.js portfolio --help
node dist/index.js deposit --help
```

### Step 13: Understanding Router Initialization

**Router Initialization** creates the global `SlabRegistry` account that stores:
- Governance authority
- Risk parameters (IMR, MMR, liquidation bands)
- Insurance fund configuration
- PnL vesting parameters
- Registered slabs list

This is a **one-time protocol-level operation** performed by the deployer, not traders.

**Important Distinction:**
- **Router Initialization** = Protocol-level (deployer does once)
- **Portfolio Creation** = User-level (each trader does once)

### Step 14: Portfolio Creation (Automatic)

While router initialization is a protocol operator task, **portfolio creation is a normal user operation**.

**Good news:** Portfolio creation is **automatic** - you don't need to manually initialize it!

The TypeScript CLI automatically creates your portfolio on first use:
- First `deposit` command → Creates portfolio automatically
- First `buy`/`sell` command → Creates portfolio automatically

**Behind the scenes:**
The CLI checks if your portfolio exists before each transaction. If it doesn't exist, it adds portfolio creation instructions to the same transaction atomically.

**For SDK users:**
If you're using the SDK directly, you can use the `ensurePortfolioInstructions()` helper:

```typescript
// Automatically add portfolio creation if needed
const ensurePortfolioIxs = await client.ensurePortfolioInstructions(wallet.publicKey);
const depositIx = client.buildDepositInstruction(...);

const transaction = new Transaction()
  .add(...ensurePortfolioIxs)  // Empty array if portfolio exists, creation ixs if not
  .add(depositIx);
```

**Note:** Portfolio uses `create_with_seed` (NOT PDA) to bypass Solana's 10KB CPI limit, since portfolios are ~136KB.

---

## Testing Oracle Integration (Optional)

### Step 15: Build and Deploy Oracle Program

The oracle program must be deployed before you can create oracle accounts:

```bash
# From project root
cd /path/to/barista-dex

# Build oracle program (use --manifest-path, NOT -p)
cargo build-sbf --manifest-path programs/oracle/Cargo.toml

# Output location: target/deploy/percolator_oracle.so

# Deploy oracle program to localnet
solana program deploy target/deploy/percolator_oracle.so

# Example output:
# Program Id: 5kL9X3mN8vR2qT4pY7wH6jC1sF8oB9eA2dM4nP6kG3h
```

**Save the Oracle Program Id** - you'll need it for the next step.

### Step 16: Build Keeper Tool

The keeper tool is used to initialize and manage oracles:

```bash
# From project root (NOT from keeper/ directory!)
cargo build --release -p percolator-keeper

# Binary will be at: ./target/release/percolator-keeper
# Verify it works:
./target/release/percolator-keeper --help
```

**Important**: Build from the workspace root, not from `keeper/` directory.

### Step 17: Initialize a Test Oracle

Create an oracle account for price feeds:

```bash
# Initialize oracle (use --instrument, not --symbol!)
./target/release/percolator-keeper oracle init \
  --instrument SOL \
  --price 200.0 \
  --oracle-program <ORACLE_PROGRAM_ID_FROM_STEP_15>

# Example with actual program ID:
./target/release/percolator-keeper oracle init \
  --instrument SOL \
  --price 200.0 \
  --oracle-program FrnW9C4pyFYriXU88ydVNhKBTWbhksCzpAkjuD4Smpzf

# Example output:
# [INFO] Initializing oracle for instrument: SOL
# [INFO] Oracle address: 4eJudU6pHRUQSxfwxX1Esn6x5H9C3K2G1oEXW74E7iuG
# [INFO] Instrument: SOL (EPEhSwfWjqyvFhNYJK9sEmZUG33CtUm37pvJ6C3eJF5N)
# [INFO] Initial price: $200.00 (200000000 scaled)
# ✓ Oracle created successfully
```

**Save the Oracle Address** - you'll need this for the router configuration.

### Step 18: Start Oracle Crank (Auto-Updates)

```bash
# Start auto-updater with mock prices
./target/release/percolator-keeper oracle crank \
  --oracle <ORACLE_ADDRESS> \
  --source mock \
  --interval 5

# With example oracle address
./target/release/percolator-keeper oracle crank \
  --oracle 6Lhay5rpwDm8Jr1Ce4UDPo7fXRS8SbxnRFJKMVDoc12K \
  --source mock \
  --interval 5

# Or with real CoinGecko prices (for SOL):
./target/release/percolator-keeper oracle crank \
  --oracle <ORACLE_ADDRESS> \
  --oracle-program <ORACLE_PROGRAM_ID> \
  --source coingecko \
  --instrument solana \
  --interval 60

# With example oracle address
./target/release/percolator-keeper oracle crank \
  --oracle 6Lhay5rpwDm8Jr1Ce4UDPo7fXRS8SbxnRFJKMVDoc12K \
  --oracle-program FrnW9C4pyFYriXU88ydVNhKBTWbhksCzpAkjuD4Smpzf \
  --source coingecko \
  --instrument solana \
  --interval 60
```

### Step 19: Verify Oracle

```bash
# Check oracle state
./target/release/percolator-keeper oracle show \
  --oracle <ORACLE_ADDRESS>

# Output:
# Oracle: 4eJudU6pHRUQSxfwxX1Esn6x5H9C3K2G1oEXW74E7iuG
# Price: $200.12
# Confidence: ±0.01
# Timestamp: 2025-10-26 09:30:00 UTC
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
3. Rebuild CLI: `cd cli-client && npm run build`
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

# View portfolio (requires portfolio to exist first)
node dist/index.js portfolio --network localnet

# List slabs
node dist/index.js slabs --network localnet
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
- **CLI config**: `cli-client/src/config/networks.ts`
- **SDK config**: `sdk/src/constants.ts`

---

## Next Steps

After successful localnet deployment, you have deployed the programs but will need additional tooling to fully interact with them:

### User Roles and Tooling

**End Users (Traders)** → TypeScript CLI (`cli-client/`):
- ✅ Portfolio viewing
- ✅ Discovery (slabs, instruments, prices)
- ✅ Trading (buy/sell orders)
- ✅ Deposits/withdrawals

**Protocol Operators (Deployers)** → SDK or Rust CLI (`cli/`):
- Router initialization (one-time per deployment)
- Slab/market creation
- Liquidity provisioning
- Keeper/oracle management

### Testing Protocol Operations

For protocol-level initialization and testing, use the **Rust CLI**:

```bash
# Build Rust CLI
cd cli
cargo build --release

# Initialize router (one-time)
./target/release/percolator margin init --network localnet

# See all available commands
./target/release/percolator --help
```

The TypeScript CLI intentionally excludes these protocol operator commands to keep it focused on end-user (trader) workflows.

For production deployment to **devnet** or **mainnet-beta**, see `DEVNET_DEPLOYMENT_GUIDE.md` (TODO).

---

**Last Updated**: 2025-10-24
**Solana Version**: 1.x.x (stable)
**Network**: Localnet
