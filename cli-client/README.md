# Barista CLI

Command-line interface for Barista DEX on Solana.

## Installation

```bash
npm install -g @barista-dex/cli
```

Or use directly with npx:

```bash
npx @barista-dex/cli --help
```

## Configuration

The CLI comes pre-configured with program addresses for devnet, mainnet-beta, and localnet. Configuration is handled through environment variables (similar to binance-cli).

### Environment Variables

Set these once in your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
# Network: mainnet-beta (default), devnet, or localnet
export BARISTA_NETWORK=mainnet-beta

# Custom RPC endpoint (optional)
export BARISTA_RPC_URL=https://my-custom-rpc.com

# Keypair path (optional, defaults to ~/.config/solana/id.json)
export BARISTA_KEYPAIR=/path/to/keypair.json
```

**Priority:** CLI flags > Environment variables > Defaults

### Network Selection

You can override environment variables with CLI flags:

```bash
# Use environment variable (if set) or default to mainnet
barista portfolio

# Override with CLI flag
barista portfolio --network devnet

# Use environment variable for network, override RPC
barista portfolio --url https://my-custom-rpc.com
```

### Quick Setup

For mainnet trading with default settings (no configuration needed):
```bash
# Uses mainnet-beta by default
barista portfolio
```

For devnet testing:
```bash
# Option 1: Set environment variable (persistent)
export BARISTA_NETWORK=devnet
barista portfolio

# Option 2: Use CLI flag (one-time)
barista portfolio --network devnet
```

## v0.5 Limitations

**Important:** This CLI interfaces with v0.5 (counterparty settlement model):

- **Market orders only** - Executes instantly at oracle price (±0.5% slippage tolerance)
- **Limit orders execute instantly** (NOT resting orders) - Price validation only, fills immediately
- **Single slab execution** - Must specify `--slab` (cross-slab smart routing disabled in v0.5)
- **Single instrument per slab** - v1+ will support up to 32 instruments per slab
- **Atomic fills** - No partial fills or order book
- **SOL collateral only** - v1+ will support multi-collateral (USDC, etc.)
- **PnL settles against DLP vault** - Each slab has an LP/DLP providing liquidity as counterparty
  - User profit = DLP loss (SOL transferred from DLP Portfolio → User Portfolio)
  - User loss = DLP profit (SOL transferred from User Portfolio → DLP Portfolio)
- **v1 order book** - Migration will enable resting orders, cross-slab routing, trader-to-trader matching

For more details on v0.5 → v1 migration, see [V1_ROADMAP.md](../thoughts/V1_ROADMAP.md).

---

## Commands

### Portfolio Management

#### View Portfolio
```bash
barista portfolio

# View another trader's portfolio
barista portfolio --address <trader-address>
```

#### Deposit Collateral (SOL Only in v0)
```bash
barista deposit --amount <lamports>

# Example: Deposit 1 SOL (1000000000 lamports)
barista deposit --amount 1000000000

# Example: Deposit 0.5 SOL
barista deposit --amount 500000000
```

**Note:**
- Amounts are in lamports (1 SOL = 1,000,000,000 lamports)
- v0 supports SOL deposits only
- Portfolio is automatically created on first deposit
- USDC and other SPL tokens coming in v1+

#### Withdraw Collateral (SOL Only in v0)
```bash
barista withdraw --amount <lamports>

# Example: Withdraw 0.5 SOL
barista withdraw --amount 500000000
```

### Trading

#### Execute Orders (v0.5: Single Slab Required)

**v0.5**: Must specify `--slab` for all trades. Cross-slab smart routing is disabled.

```bash
# Market buy (executes at oracle price)
barista buy --slab <SLAB_ADDRESS> -q 1000

# Market sell
barista sell --slab <SLAB_ADDRESS> -q 500

# Limit buy (sanity-checked, executes instantly)
barista buy --slab <SLAB_ADDRESS> -q 1000 -p 50000000

# With leverage (5x)
barista buy --slab <SLAB_ADDRESS> -q 1000 -l 5x
```

**v0.5 Behavior:**
- `--slab` is **required** (single-slab execution only)
- `--instrument` is **optional** (for future multi-instrument slabs in v1+)
- Orders execute instantly (no order book)
- Market orders: Filled at oracle price ± 0.5% slippage
- Limit orders: Price validated within ±20% of oracle, then filled instantly
- Settlement: Real SOL transfer between User Portfolio ↔ DLP Portfolio

**v1 (Future):**
- `--slab` will be optional (cross-slab smart routing re-enabled)
- `--instrument` will enable best price discovery across slabs
- Resting limit orders will wait for price
- Trader-to-trader matching via order book

### Market Data

#### Get Price
```bash
barista price --slab <market>
```

#### View Order Book
```bash
barista book --slab <market>

# Show 20 levels
barista book --slab <market> --levels 20
```

## Options

All commands support the following options:

- `-n, --network <network>` - Network to use: `mainnet-beta`, `devnet`, or `localnet` (default: `BARISTA_NETWORK` env var or `mainnet-beta`)
- `-u, --url <url>` - Custom RPC URL (default: `BARISTA_RPC_URL` env var or network default)
- `-k, --keypair <path>` - Path to keypair file (default: `BARISTA_KEYPAIR` env var or `~/.config/solana/id.json`)
- `-h, --help` - Display help for command

## Examples

### Complete Trading Workflow

```bash
# 1. Deposit SOL collateral (10 SOL = 10000000000 lamports)
barista deposit --amount 10000000000

# 2. Check your portfolio
barista portfolio

# 3. View market prices
barista price --slab SLaBZ6Ps...

# 4. View order book depth
barista book --slab SLaBZ6Ps... --levels 10

# 5. Place a buy order
barista buy --slab SLaBZ6Ps... --quantity 1000000

# 6. Place a sell order
barista sell --slab SLaBZ6Ps... --quantity 500000

# 7. Withdraw funds (5 SOL)
barista withdraw --amount 5000000000
```

### Example Output

**Portfolio:**
```
📊 Portfolio Summary

┌─────────────────────────┬──────────────────────────────┐
│ Metric                  │ Value                        │
├─────────────────────────┼──────────────────────────────┤
│ Owner                   │ 5Z6sRxvL...                  │
│ Equity                  │ 1000.000000                  │
│ Collateral Value        │ 1000.000000                  │
│ Maint Margin            │ 0.000000                     │
│ Unrealized PnL          │ 0.000000                     │
│ Health                  │ 100.000000                   │
│ Last Update             │ 1234567890                   │
└─────────────────────────┴──────────────────────────────┘
```

**Order Book:**
```
📖 Order Book (SLaBZ6Ps...)

┌────────────────────┬────────────────────┬─────┬────────────────────┬────────────────────┐
│ Bid Size           │ Bid Price          │     │ Ask Price          │ Ask Size           │
├────────────────────┼────────────────────┼─────┼────────────────────┼────────────────────┤
│ 10.500000          │ 50000.000000       │     │ 50010.000000       │ 8.250000           │
│ 5.250000           │ 49990.000000       │     │ 50020.000000       │ 12.000000          │
└────────────────────┴────────────────────┴─────┴────────────────────┴────────────────────┘

Spread: 10.000000 (0.02%)
Total Bid Depth: 15 levels
Total Ask Depth: 12 levels
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Link locally
npm link

# Test
barista --help
```

## Architecture

The CLI is built on top of the [`@barista-dex/sdk`](https://www.npmjs.com/package/@barista-dex/sdk) package, which handles all Solana interactions and instruction building.

```
CLI (@barista-dex/cli)
  └── SDK (@barista-dex/sdk)
        └── Solana Web3.js
```

## License

MIT
