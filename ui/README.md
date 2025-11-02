# Barista DEX Trading UI

Modern web interface for trading perpetual futures on Barista DEX (Solana). Features real-time price charts, leveraged trading (1x-10x), and comprehensive portfolio management.

## Features

### Trading
- 📊 **TradingView-style Charts** - Powered by lightweight-charts with candlestick, line, and area views
- ⚡ **Real-time Price Data** - Live Binance price feeds with configurable intervals (1m-1D)
- 💱 **Market & Limit Orders** - Execute trades at market price or set limit prices
- 🎯 **Leverage Trading** - Trade with 1x-10x leverage on all positions
- 📍 **Entry Price Lines** - Visual position markers on charts
- 🔄 **Position Management** - Open, add to, reduce, or close positions with real-time PnL

### Portfolio
- 💰 **Real-time Portfolio Tracking** - Auto-refreshing balance, margin, and PnL
- 📈 **Unrealized & Realized PnL** - Track profits/losses across all positions
- 🎚️ **Margin Management** - Monitor initial margin, maintenance margin, and free collateral
- ⚠️ **Risk Indicators** - Visual warnings for low margin and liquidation risk
- 💵 **SOL Deposits/Withdrawals** - One-click collateral management (localnet auto-airdrops)

### UI/UX
- 🎨 **Dark Theme** - Jupiter/Hyperliquid-inspired professional trading interface
- 🔑 **Smart Wallet System** - Seamless localnet (env var) ↔ browser wallet switching
- 🔔 **Toast Notifications** - Transaction confirmations with close buttons
- ⚡ **Anti-flickering** - Memoized position and PnL rendering for smooth updates
- 🐛 **Known Bugs Dialog** - In-app documentation of limitations and recent fixes

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- Solana CLI configured for localnet
- Running `solana-test-validator` (for local development)
- Deployed Barista DEX programs (router, slab, oracle)

### Installation

```bash
# Install dependencies
pnpm install
```

### Configuration

1. Copy the example environment file:
```bash
cp .env.local.example .env.local
```

2. Edit `.env.local` with your configuration:

```bash
# Wallet Configuration
NEXT_PUBLIC_WALLET_MODE=localnet  # or 'browser' for production
NEXT_PUBLIC_NETWORK=localnet      # or 'devnet' / 'mainnet-beta'

# Localnet Wallet (for development)
# Get your keypair from: cat ~/.config/solana/id.json
NEXT_PUBLIC_LOCALNET_PRIVATE_KEY='[123,456,...]'

# RPC Endpoint
NEXT_PUBLIC_RPC_URL=http://localhost:8899

# Program IDs (from your deployment)
NEXT_PUBLIC_ROUTER_PROGRAM_ID=YourRouterProgramId
NEXT_PUBLIC_SLAB_PROGRAM_ID=YourSlabProgramId
NEXT_PUBLIC_ORACLE_PROGRAM=YourOracleProgramId

# Feature Flags
NEXT_PUBLIC_SHOW_DEBUG_INFO=true   # Show debug panels
NEXT_PUBLIC_AUTO_CONNECT=true      # Auto-connect wallet on load
```

### Start Development Server

```bash
pnpm dev
```

Visit http://localhost:3000

## Usage

### Localnet Development

1. **Auto-connect**: With `AUTO_CONNECT=true`, wallet connects automatically using your env keypair
2. **Deposit Funds**: Click the `+` icon in the navbar, specify amount (localnet auto-airdrops first)
3. **Select Market**: Choose a slab from the market selector
4. **Place Trade**:
   - Enter quantity (in contracts, e.g., "10")
   - Select leverage (1x-10x)
   - Choose side (Buy/Sell)
   - Set limit price (optional, leave empty for market order)
   - Click Buy/Sell button
5. **Monitor Positions**: View entry price, mark price, unrealized PnL, and leverage in the Positions tab
6. **Close Position**: Click "Close" button on any position

### Browser Wallet (Production)

1. Set `NEXT_PUBLIC_WALLET_MODE=browser` in `.env.local`
2. Connect using Phantom, Solflare, or other Solana wallets
3. Trading flow is the same as localnet

## Project Structure

```
ui/
├── app/                    # Next.js 14 app directory
│   ├── page.tsx           # Main trading page
│   └── layout.tsx         # Root layout with Toaster
├── components/
│   ├── layout/            # Header, nav components
│   │   └── Header.tsx     # Navbar with wallet, deposit, bugs dialog
│   ├── trading/           # Trading-specific components
│   │   ├── LightweightChart.tsx    # TradingView-style charts
│   │   └── MarketSelector.tsx      # Slab/market picker
│   └── ui/                # Shadcn/ui components (Button, Dialog, etc.)
├── lib/
│   ├── hooks/             # React hooks
│   │   ├── useBarista.ts  # Markets, slabs, instruments
│   │   ├── usePortfolio.ts # Portfolio data with anti-flicker
│   │   └── useTrade.ts     # Trade execution logic
│   ├── wallet/            # Wallet abstraction
│   │   └── WalletProvider.tsx
│   ├── chart/             # Chart data providers
│   │   └── priceData.ts   # Binance price fetching
│   ├── config.ts          # Network and program configuration
│   └── utils.ts           # Utility functions
├── public/                # Static assets, screenshots
└── .env.local            # Environment configuration (gitignored)
```

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NEXT_PUBLIC_WALLET_MODE` | Yes | Wallet connection mode | `localnet` or `browser` |
| `NEXT_PUBLIC_NETWORK` | Yes | Solana network | `localnet`, `devnet`, `mainnet-beta` |
| `NEXT_PUBLIC_RPC_URL` | Yes | RPC endpoint URL | `http://localhost:8899` |
| `NEXT_PUBLIC_ROUTER_PROGRAM_ID` | Yes | Router program public key | `Hp6y...` |
| `NEXT_PUBLIC_SLAB_PROGRAM_ID` | Yes | Slab program public key | `DfEn...` |
| `NEXT_PUBLIC_ORACLE_PROGRAM` | No | Oracle program (for localnet pricing) | `Fvwz...` |
| `NEXT_PUBLIC_LOCALNET_PRIVATE_KEY` | Localnet only | Keypair array from `~/.config/solana/id.json` | `[123,45,...]` |
| `NEXT_PUBLIC_SHOW_DEBUG_INFO` | No | Show debug information | `true` / `false` |
| `NEXT_PUBLIC_AUTO_CONNECT` | No | Auto-connect wallet on page load | `true` / `false` |

## Known Limitations & Issues

### Current Limitations
- **No Liquidations**: Liquidation system not yet implemented
- **Single Instrument per Slab**: Each slab supports one trading pair
- **Leverage Range**: 1x-10x only (no higher leverage)
- **Localnet-first**: Optimized for local development, production deployment pending

### Minor Issues
- **Mean Leverage Display**: Aggregate leverage calculation doesn't handle mixed 1x/leveraged positions correctly
- **Portfolio Polling**: 5-second refresh interval may show brief stale data
- **Price Updates**: Chart prices from Binance, on-chain from oracle (may differ slightly)

### Recently Fixed ✓
- **1x Leverage**: Fixed "Insufficient margin" error for spot (1x) trades
- **Position Reversal**: Fixed margin calculation when flipping long/short
- **PnL Calculation**: Corrected leverage multiplier in unrealized PnL
- **UI Flickering**: Fixed position and PnL displays flickering during updates
- **Entry Price Lines**: Fixed duplicate entry price lines accumulating on chart

Click the yellow ⚠️ icon in the navbar to view the full bugs & limitations dialog.

## Development

### Build for Production

```bash
pnpm build
pnpm start
```

### Linting

```bash
pnpm lint
```

### Clean Build

```bash
rm -rf .next
pnpm dev
```

## Troubleshooting

### "Wallet not connected" on localnet
- Ensure `NEXT_PUBLIC_WALLET_MODE=localnet`
- Verify `NEXT_PUBLIC_LOCALNET_PRIVATE_KEY` is set correctly
- Check browser console for connection errors

### "Program not found" errors
- Verify programs are deployed: `solana program show <PROGRAM_ID> --url localhost`
- Check `NEXT_PUBLIC_ROUTER_PROGRAM_ID` and `NEXT_PUBLIC_SLAB_PROGRAM_ID` match deployed IDs

### Trades failing with "Insufficient margin"
- Deposit more SOL using the `+` button in navbar
- Check your portfolio balance in the navbar
- Reduce leverage or position size

### Chart not loading
- Ensure internet connection (fetches from Binance API)
- Check browser console for CORS or network errors
- Verify slab and instrument are configured correctly

## Related Documentation

- [Trading Simulator Setup Guide](../thoughts/TRADING_SIMULATOR_SETUP.md) - Complete local trading environment setup
- [SDK Documentation](../sdk/README.md) - TypeScript SDK for programmatic trading
- [CLI Documentation](../cli-client/README.md) - Command-line trading interface

## License

MIT
