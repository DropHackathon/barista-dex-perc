# Barista DLP CLI

Command-line interface for **Decentralized Liquidity Providers (DLPs)** on Barista DEX.

> **Note:** This CLI is for DLPs only. If you're a trader, use the [`cli-client`](../cli-client/README.md) CLI instead.

## Features

- 🏦 **Portfolio Management** - Initialize, deposit, withdraw, and view DLP capital
- 📊 **Slab Operations** - Create and manage order book slabs (coming soon)
- 📈 **Analytics** - Track exposure, PnL, and trading activity (coming soon)
- 🔒 **Safety Checks** - Automatic validation to prevent unsafe operations
- 🎨 **Beautiful Output** - Color-coded displays with real-time spinners

## Installation

```bash
# From workspace root
npm install

# Link for global usage (optional)
cd cli-dlp
npm link
```

## Quick Start

### 1. Initialize Portfolio

```bash
# Initialize a new DLP portfolio
barista-dlp portfolio:init \
  --keypair ~/.config/solana/dlp-wallet.json \
  --network localnet
```

### 2. Deposit Capital

```bash
# Deposit 100 SOL (100000000000 lamports)
barista-dlp deposit \
  --amount 100000000000 \
  --keypair ~/.config/solana/dlp-wallet.json \
  --network localnet
```

### 3. View Portfolio

```bash
# View basic portfolio summary
barista-dlp portfolio \
  --keypair ~/.config/solana/dlp-wallet.json \
  --network localnet

# View detailed breakdown with per-slab exposure
barista-dlp portfolio --detailed
```

### 4. Withdraw Capital

```bash
# Withdraw 10 SOL
barista-dlp withdraw \
  --amount 10000000000 \
  --keypair ~/.config/solana/dlp-wallet.json \
  --network localnet

# Force withdrawal (skip safety checks - dangerous!)
barista-dlp withdraw --amount 10000000000 --force
```

## Environment Variables

Set these to avoid passing options every time:

```bash
export BARISTA_DLP_KEYPAIR=~/.config/solana/dlp-wallet.json
export BARISTA_DLP_NETWORK=localnet
export BARISTA_DLP_RPC_URL=http://127.0.0.1:8899  # Optional custom RPC

# Now you can omit --keypair and --network flags
barista-dlp portfolio
barista-dlp deposit --amount 50000000000
```

## Commands

### Portfolio Commands

#### `portfolio:init`
Initialize a new DLP portfolio account.

```bash
barista-dlp portfolio:init --keypair <path>
```

**Options:**
- `--keypair <path>` - Path to DLP wallet keypair
- `--network <network>` - Network: localnet/devnet/mainnet-beta (default: localnet)
- `--url <url>` - Custom RPC URL

#### `portfolio`
View DLP portfolio details and capital summary.

```bash
barista-dlp portfolio [options]
```

**Options:**
- `--detailed` - Show detailed per-slab exposure breakdown
- `--keypair <path>` - Path to DLP wallet keypair
- `--network <network>` - Network to use

**Example Output:**
```
═══════════════════════════════════════
         DLP Portfolio Summary
═══════════════════════════════════════

┌──────────────────────────────┬──────────────────────────────┐
│ Metric                       │ Value                        │
├──────────────────────────────┼──────────────────────────────┤
│ Principal (Deposited)        │ 100.0 SOL                    │
│ Realized PnL                 │ +2.5 SOL                     │
│ ───────────────────────────  │ ───────────────────────────  │
│ Total Equity                 │ 102.5 SOL                    │
└──────────────────────────────┴──────────────────────────────┘

💡 Tips:
  • Use --detailed for more information
  • Create slabs with: barista-dlp slab create
  • View analytics with: barista-dlp analytics stats
```

#### `deposit`
Deposit SOL capital to your portfolio.

```bash
barista-dlp deposit --amount <lamports>
```

**Options:**
- `--amount <lamports>` - Amount in lamports (1 SOL = 1,000,000,000 lamports)
- `--keypair <path>` - Path to DLP wallet keypair
- `--network <network>` - Network to use

**Safety Checks:**
- Validates amount > 0
- Warns if deposit is unusually large
- Auto-creates portfolio if it doesn't exist

**Examples:**
```bash
# Deposit 1 SOL
barista-dlp deposit --amount 1000000000

# Deposit 100 SOL
barista-dlp deposit --amount 100000000000

# Deposit with custom RPC
barista-dlp deposit --amount 50000000000 --url http://localhost:8899
```

#### `withdraw`
Withdraw SOL from your portfolio.

```bash
barista-dlp withdraw --amount <lamports> [--force]
```

**Options:**
- `--amount <lamports>` - Amount in lamports to withdraw
- `--force` - Skip safety checks (dangerous!)
- `--keypair <path>` - Path to DLP wallet keypair
- `--network <network>` - Network to use

**Safety Checks:**
- ✅ Ensures sufficient balance
- ✅ Blocks withdrawals with open positions
- ✅ Warns about unrealized PnL
- ✅ Prevents capital undercollateralization
- ✅ Enforces minimum balance thresholds

**Examples:**
```bash
# Withdraw 10 SOL (with safety checks)
barista-dlp withdraw --amount 10000000000

# Force withdrawal (skip safety checks)
barista-dlp withdraw --amount 5000000000 --force
```

**Safety Check Example:**
```
⚠ Safety Warnings:
  • Withdrawal reduces free capital by 50% - monitor your exposure
  • Recommended minimum: Keep at least 10 SOL as buffer

✓ Proceed with withdrawal despite warnings? No
❯ Withdrawal cancelled
```

### Slab Commands

#### `slab:create`
Create a new order book slab.

```bash
barista-dlp slab:create \
  --instrument <instrument-address> \
  --mark-price 100.50 \
  --taker-fee 10 \
  --contract-size 1.0
```

**Options:**
- `--instrument <address>` - Instrument (perp market) public key
- `--mark-price <price>` - Initial mark price in USD (e.g., 100.50)
- `--taker-fee <bps>` - Taker fee in basis points (e.g., 10 = 0.1%)
- `--contract-size <size>` - Contract size (e.g., 1.0)
- `--yes` - Skip confirmation prompts
- `--keypair <path>` - Path to DLP wallet keypair
- `--network <network>` - Network to use

**Interactive Mode:**
If options are not provided, the CLI will prompt for each parameter:
```bash
barista-dlp slab:create

? Instrument address (perp market): <paste-address>
? Mark price (USD, e.g., 100.50): 100.00
? Taker fee (bps, e.g., 10 = 0.1%): 10
? Contract size (e.g., 1.0): 1.0
? Create slab with these settings? Yes

✓ Slab created successfully!
  Slab Address: 7EqQdEU...vcMwJeK
  Signature: 5j8dqXJ...rYjk9Z

⚠ Save this slab address! You'll need it to manage this slab
```

**Notes:**
- Slab PDA is derived from: `['slab', lpOwner, instrument]`
- Only one slab per LP Owner + Instrument combination
- Requires portfolio to exist first

#### `slab:view`
View slab details and current state.

```bash
# Basic view
barista-dlp slab:view --address <slab-pubkey>

# Detailed view with prices and instruments
barista-dlp slab:view --address <slab-pubkey> --detailed
```

**Options:**
- `--address <pubkey>` - Slab address (required)
- `--detailed` - Show best prices and instruments
- `--keypair <path>` - Path to DLP wallet (to check ownership)
- `--network <network>` - Network to use

**Example Output:**
```
═══════════════════════════════════════
           Slab Information
═══════════════════════════════════════

┌──────────────────────┬────────────────────────────────┐
│ Field                │ Value                          │
├──────────────────────┼────────────────────────────────┤
│ Slab Address         │ 7EqQdEU...vcMwJeK              │
│ LP Owner (DLP)       │ 9aE2FN...Lp4k2                 │
│ Router ID            │ Router1...2r3t                 │
│ Instrument           │ SOLPER...P1                    │
│                      │ ✓ You own this slab            │
└──────────────────────┴────────────────────────────────┘

┌──────────────────────┬────────────────────────────────┐
│ Parameter            │ Value                          │
├──────────────────────┼────────────────────────────────┤
│ Mark Price           │ $100.00                        │
│ Contract Size        │ 1.000000                       │
│ Taker Fee            │ 10.00 bps                      │
│ Sequence Number      │ 0                              │
│ Bump                 │ 255                            │
└──────────────────────┴────────────────────────────────┘
```

#### `slab:update` (Coming Soon)
Update slab parameters (fees, limits, etc.).

```bash
barista-dlp slab:update --address <slab-pubkey> --fee-bps 10
```

#### `slab:pause` (Coming Soon)
Pause trading on a slab (emergency stop).

```bash
barista-dlp slab:pause --address <slab-pubkey>
```

#### `slab:resume` (Coming Soon)
Resume trading on a paused slab.

```bash
barista-dlp slab:resume --address <slab-pubkey>
```

### Analytics Commands (Coming Soon)

#### `analytics:exposure`
View current exposure across all slabs.

```bash
barista-dlp analytics:exposure
```

#### `analytics:stats`
View performance statistics and metrics.

```bash
barista-dlp analytics:stats --period 7d
```

#### `analytics:trades`
View recent trades and settlements.

```bash
barista-dlp analytics:trades --limit 50
```

## Configuration

### Network Configuration

The CLI automatically configures program IDs based on the network:

- **localnet**: Uses localhost programs
- **devnet**: Uses Solana devnet programs
- **mainnet-beta**: Uses production programs

### Wallet Setup

```bash
# Generate a new DLP wallet
solana-keygen new -o ~/.config/solana/dlp-wallet.json

# Check balance
solana balance ~/.config/solana/dlp-wallet.json

# Airdrop SOL on localnet/devnet
solana airdrop 100 ~/.config/solana/dlp-wallet.json --url http://127.0.0.1:8899
```

## Safety Features

### Deposit Safety
- Validates deposit amount is positive
- Warns if amount is unusually large (>1000 SOL)
- Auto-initializes portfolio if needed

### Withdrawal Safety
The CLI performs comprehensive safety checks before withdrawals:

1. **Balance Check** - Ensures sufficient balance exists
2. **Position Check** - Blocks withdrawals with open positions
3. **PnL Check** - Warns about unrealized losses
4. **Utilization Check** - Prevents capital undercollateralization
5. **Minimum Balance** - Enforces safety buffers

**Override with `--force`** (not recommended):
```bash
barista-dlp withdraw --amount 100000000000 --force
```

## Development

### Build

```bash
cd cli-dlp
npm run build
```

### Test

```bash
npm test
```

### Local Development

```bash
# Watch mode for development
npm run dev

# Link for testing
npm link
barista-dlp --help
```

## Troubleshooting

### "Portfolio not found"
You need to initialize a portfolio first:
```bash
barista-dlp portfolio:init --keypair <path>
```

Or deposit capital (auto-creates portfolio):
```bash
barista-dlp deposit --amount 100000000000 --keypair <path>
```

### "Insufficient balance"
Check your wallet balance:
```bash
solana balance ~/.config/solana/dlp-wallet.json
```

Airdrop SOL on localnet/devnet:
```bash
solana airdrop 100 ~/.config/solana/dlp-wallet.json --url http://127.0.0.1:8899
```

### "Cannot withdraw with open positions"
Close all positions before withdrawing. View open positions:
```bash
barista-dlp portfolio --detailed
```

### Connection errors
Verify your RPC URL is correct:
```bash
# Test connection
curl http://127.0.0.1:8899 -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getVersion"}'
```

## Architecture

```
cli-dlp/
├── src/
│   ├── index.ts                  # CLI entry point with Commander.js
│   ├── commands/
│   │   ├── portfolio/
│   │   │   ├── init.ts          # Initialize portfolio
│   │   │   ├── view.ts          # View portfolio details
│   │   │   ├── deposit.ts       # Deposit capital
│   │   │   └── withdraw.ts      # Withdraw capital
│   │   ├── slab/                # Slab management (coming soon)
│   │   └── analytics/           # Analytics commands (coming soon)
│   └── utils/
│       ├── wallet.ts            # Keypair loading
│       ├── network.ts           # RPC and program ID config
│       ├── display.ts           # Formatting and display
│       └── safety.ts            # Safety checks and validations
├── package.json
├── tsconfig.json
└── README.md
```

## Related

- **SDK**: [`@barista-dex/sdk`](../sdk/README.md) - TypeScript SDK for building applications
- **Trader CLI**: [`cli-client`](../cli-client/README.md) - CLI for traders
- **Keeper CLI**: [`cli`](../cli/README.md) - Rust-based keeper operations (alternative)

## Support

- **Documentation**: [Barista DEX Docs](https://docs.barista.dev)
- **Issues**: [GitHub Issues](https://github.com/barista-dex/barista-dex/issues)
- **Discord**: [Join our community](https://discord.gg/barista-dex)

## License

Apache-2.0
