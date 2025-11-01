# Barista DEX Trading UI

Web interface for trading perpetual futures on Barista DEX with localnet-first development.

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.local.example .env.local
# Edit .env.local with your localnet keypair
```

3. Start dev server:
```bash
npm run dev
```

Visit http://localhost:3000

## Features

- 🔑 Wallet abstraction (localnet env var ↔ browser wallet)
- 📊 Jupiter/Hyperliquid inspired dark theme
- ⚡ Real-time portfolio tracking
- 💱 Market & limit orders with up to 10x leverage

## Configuration

See `.env.local.example` for all environment variables.

Switch between localnet and production by changing:
```bash
NEXT_PUBLIC_WALLET_MODE=localnet  # or browser
```

## Project Structure

```
ui/
├── app/          # Next.js pages
├── components/   # React components
├── lib/          # Utils, wallet, config
└── .env.local    # Environment config
```

## Next Steps

- [ ] Implement trading hooks
- [ ] Connect Barista SDK
- [ ] Add TradingView charts
- [ ] Deploy to Vercel

See `/thoughts/LOCALNET_TRADING_UI_IMPLEMENTATION_PLAN.md` for full roadmap.
