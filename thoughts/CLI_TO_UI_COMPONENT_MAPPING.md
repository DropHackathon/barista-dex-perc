# CLI-to-UI Component Mapping & Reusable Logic

**Date**: 2025-10-28
**Purpose**: Document reusable code from cli-client for trading-ui implementation

## Executive Summary

The CLI client (`cli-client/`) contains battle-tested logic that can be directly reused or adapted for the trading UI. This document maps CLI components to their UI equivalents and identifies shared utility code.

---

## 1. Core Utility Files (100% Reusable)

### 1.1 Network Configuration

**CLI**: `cli-client/src/config/networks.ts`

**What It Does**:
- Loads network configs (mainnet, devnet, localnet)
- Handles environment variable overrides
- Returns program IDs and RPC URLs

**Reusable For UI**:
```typescript
// trading-ui/src/lib/config.ts
// Can copy almost directly, just adjust for Next.js env vars

export function getConfig(): AppConfig {
  const network = process.env.NEXT_PUBLIC_NETWORK as NetworkName;
  const config = NETWORK_CONFIGS[network];

  // Override with env vars
  if (process.env.NEXT_PUBLIC_RPC_URL) {
    config.rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
  }

  return config;
}
```

**Key Functions to Copy**:
- ✅ `getNetworkConfig()` - Network selection with env overrides
- ✅ `NETWORK_CONFIGS` - Program IDs and RPC URLs by network
- ✅ Environment variable pattern

**Adaptation Notes**:
- Change `process.env.BARISTA_*` → `process.env.NEXT_PUBLIC_*`
- Remove `getDefaultKeypairPath()` (not needed for browser wallets)

---

### 1.2 Display Utilities & Formatting

**CLI**: `cli-client/src/utils/display.ts`

**What It Does**:
- Format BN amounts with decimals
- Calculate spread percentages
- Format addresses and signatures
- Generate explorer URLs

**Reusable For UI**:
```typescript
// trading-ui/src/lib/utils.ts
// 100% reusable! Just copy these functions

export function formatAmount(amount: BN, decimals: number = 6): string {
  const divisor = new BN(10).pow(new BN(decimals));
  const isNegative = amount.isNeg();
  const absAmount = amount.abs();

  const whole = absAmount.div(divisor);
  const frac = absAmount.mod(divisor);

  const fracStr = frac.toString().padStart(decimals, '0');
  const sign = isNegative ? '-' : '';
  return `${sign}${whole.toString()}.${fracStr}`;
}

export function formatSol(amount: BN): string {
  return formatAmount(amount, 9);
}

export function formatPrice(price: BN): string {
  return formatAmount(price, 6);
}

export function calculateSpread(bid: BN, ask: BN): string {
  if (bid.isZero()) return '0.00';
  const spread = ask.sub(bid);
  const percentage = spread.mul(new BN(10000)).div(bid).toNumber() / 100;
  return percentage.toFixed(2);
}

export function getExplorerUrl(signature: string, network: string): string {
  const cluster = network === 'mainnet-beta' ? '' : `?cluster=${network}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}
```

**Key Functions to Copy**:
- ✅ `formatAmount()` - Handles negative numbers correctly
- ✅ `formatSol()` - 9 decimal SOL formatting
- ✅ `formatPrice()` - 6 decimal price formatting
- ✅ `calculateSpread()` - Bid-ask spread calculation
- ✅ `getExplorerUrl()` - Explorer links

**Adaptation Notes**:
- Remove chalk/console logging functions
- Add React toast/notification equivalents

---

### 1.3 Wallet Utilities

**CLI**: `cli-client/src/utils/wallet.ts`

**What It Does**:
- Load keypair from file (localnet)
- Get network config
- Get default keypair path

**Reusable For UI**:
```typescript
// trading-ui/src/lib/wallet/LocalnetWalletAdapter.ts
// Use loadKeypair() logic for loading from env var

export class LocalnetWalletAdapter {
  async connect(): Promise<void> {
    const privateKeyEnv = process.env.NEXT_PUBLIC_LOCALNET_PRIVATE_KEY;

    if (!privateKeyEnv) {
      throw new Error('NEXT_PUBLIC_LOCALNET_PRIVATE_KEY not set');
    }

    // Reuse this logic from CLI
    try {
      const secretKey = JSON.parse(privateKeyEnv);
      this.keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    } catch (e) {
      throw new Error(`Failed to parse keypair: ${e}`);
    }
  }
}
```

**Key Functions to Adapt**:
- ⚠️ `loadKeypair()` - Adapt for env var instead of file
- ✅ `getConfig()` - Copy with Next.js env vars
- ❌ `getDefaultKeypairPath()` - Not needed for UI

---

## 2. Trading Logic (Adaptable)

### 2.1 Buy/Sell Commands

**CLI**:
- `cli-client/src/commands/trading/buy.ts`
- `cli-client/src/commands/trading/sell.ts`

**What They Do**:
- Parse user input (quantity, price, leverage)
- Connect to Solana
- Build trade instructions via SDK
- Sign and send transactions
- Display results

**Reusable For UI**:
```typescript
// trading-ui/src/hooks/useTrade.ts

export function useTrade() {
  const executeTrade = async (params: TradeParams) => {
    // 1. Parse inputs (REUSE from CLI)
    const quantity = parseAmount(params.quantity.toString(), DECIMALS);
    const leverage = parseLeverage(params.leverage);

    // 2. Build instruction (REUSE SDK calls from CLI)
    const client = new RouterClient(connection, config.routerProgramId);

    const { instruction, receiptSetup } = params.side === 'buy'
      ? await client.buildBuyInstruction(user, slab, quantity, price, oracle, orderType, leverage)
      : await client.buildSellInstruction(user, slab, quantity, price, oracle, orderType, leverage);

    // 3. Build transaction (REUSE from CLI)
    const tx = new Transaction();
    tx.add(receiptSetup);
    tx.add(instruction);

    // 4. Sign and send (DIFFERENT: use wallet adapter instead of loadKeypair)
    const signed = await wallet.signTransaction(tx);
    const signature = await connection.sendRawTransaction(signed.serialize());

    return signature;
  };

  return { executeTrade };
}
```

**Key Logic to Reuse**:
- ✅ `parseQuantity()` - Round to 2 decimals
- ✅ `parseLeverage()` - Validate 1-10x range
- ✅ SDK client setup pattern
- ✅ Transaction building flow
- ✅ Oracle auto-fetching logic
- ✅ Market vs Limit order handling

**Adaptation Notes**:
- Replace `ora` spinner with React loading state
- Replace `console.log` with toast notifications
- Use wallet adapter `signTransaction()` instead of keypair

---

### 2.2 Portfolio Display

**CLI**: `cli-client/src/commands/router/portfolio.ts`

**What It Does**:
- Fetch portfolio account
- Fetch position details PDAs
- Group positions by instrument (NETTING!)
- Calculate weighted average entry price
- Display PnL, margin, leverage

**Reusable For UI**:
```typescript
// trading-ui/src/hooks/usePortfolio.ts

export function usePortfolio() {
  const fetchPortfolio = async () => {
    const client = new RouterClient(connection, config.routerProgramId);

    // 1. Fetch portfolio (REUSE from CLI)
    const portfolio = await client.getPortfolio(userAddress);

    // 2. Fetch position details (REUSE from CLI)
    const positionsByInstrument = new Map<string, PositionData>();

    for (const exp of portfolio.exposures) {
      const slabEntry = registry.slabs[exp.slabIndex];

      // Fetch instrument address from slab (REUSE from CLI)
      const instruments = await slabClient.getInstruments(slabEntry.slabId);
      const instrumentAddress = instruments[exp.instrumentIndex].pubkey.toBase58();

      // Fetch PositionDetails PDA (REUSE from CLI)
      const [positionDetailsPda] = client.derivePositionDetailsPDA(...);
      const positionDetails = await connection.getAccountInfo(positionDetailsPda);

      // Parse margin, entry price, etc (REUSE from CLI)
      const entryPrice = data.readBigInt64LE(48);
      const marginHeld = readU128(data, 112);

      // Group by instrument (REUSE NETTING LOGIC from CLI!)
      const existing = positionsByInstrument.get(instrumentAddress);
      if (existing) {
        existing.totalQty = existing.totalQty.add(exp.positionQty);
        existing.weightedEntryPrice = existing.weightedEntryPrice.add(notional);
        // ... (exact logic from CLI portfolio.ts:238-283)
      }
    }

    // 3. Calculate netted positions (REUSE from CLI)
    const positions = Array.from(positionsByInstrument.values())
      .filter(p => !p.totalQty.isZero())
      .map(p => ({
        instrumentAddress: p.instrumentAddress,
        netSize: p.totalQty,
        avgEntryPrice: p.weightedEntryPrice.div(p.totalNotional),
        // ... (exact logic from CLI portfolio.ts:287-343)
      }));

    return positions;
  };

  return { positions, loading };
}
```

**Key Logic to Reuse**:
- ✅ **INSTRUMENT NETTING ALGORITHM** (lines 238-343) - Critical!
- ✅ PositionDetails PDA derivation and parsing
- ✅ Weighted average entry price calculation
- ✅ Margin aggregation by instrument
- ✅ Oracle price fetching pattern
- ✅ Registry slab lookup

**This is the most important reuse!** The portfolio netting logic we just implemented in CLI should be copied almost verbatim to the UI.

**Adaptation Notes**:
- Replace `Table` output with React components
- Add real-time polling (every 10s)
- Use React state instead of console output

---

### 2.3 Deposit/Withdraw

**CLI**:
- `cli-client/src/commands/router/deposit.ts`
- `cli-client/src/commands/router/withdraw.ts`

**What They Do**:
- Initialize portfolio if needed
- Build deposit/withdraw instructions
- Handle token account creation
- Sign and send

**Reusable For UI**:
```typescript
// trading-ui/src/hooks/usePortfolio.ts (add these methods)

export function usePortfolio() {
  const deposit = async (amount: number) => {
    const amountLamports = new BN(amount * 1e9);

    // REUSE from CLI deposit.ts:80-120
    const client = new RouterClient(connection, config.routerProgramId);
    const instruction = await client.buildDepositInstruction(
      userAddress,
      amountLamports,
      collateralMint
    );

    // Build and send transaction
    const tx = new Transaction().add(instruction);
    // ... (same pattern as trade)
  };

  const withdraw = async (amount: number) => {
    // REUSE from CLI withdraw.ts
    // Similar pattern
  };

  return { deposit, withdraw };
}
```

**Key Logic to Reuse**:
- ✅ Portfolio initialization check
- ✅ Token account creation/validation
- ✅ Amount validation (max withdraw = free collateral)
- ✅ SDK instruction building

---

## 3. Market Data (Adaptable)

### 3.1 Price Fetching

**CLI**:
- `cli-client/src/commands/market/price.ts`
- `cli-client/src/commands/discovery/price.ts`

**What They Do**:
- Fetch oracle prices
- Fetch mark prices from slabs
- Display current market data

**Reusable For UI**:
```typescript
// trading-ui/src/hooks/useMarketData.ts

export function useMarketData(instrumentAddress: PublicKey) {
  const [price, setPrice] = useState<BN | null>(null);

  useEffect(() => {
    const fetchPrice = async () => {
      const client = new RouterClient(connection, config.routerProgramId);
      const slabClient = new SlabClient(connection, config.slabProgramId);

      // REUSE oracle fetching logic from CLI
      const registry = await client.getRegistry();
      const slabEntry = registry.slabs[0]; // TODO: find by instrument

      const oracleAccount = await connection.getAccountInfo(slabEntry.oracleId);
      const oraclePrice = readOraclePrice(oracleAccount); // REUSE parsing logic

      setPrice(oraclePrice);
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 5000); // Poll every 5s

    return () => clearInterval(interval);
  }, [instrumentAddress]);

  return { price };
}
```

**Key Logic to Reuse**:
- ✅ Oracle account parsing (offset 80 for price)
- ✅ Registry slab lookup
- ✅ Pyth vs Custom oracle detection

---

### 3.2 Order Book Display

**CLI**: `cli-client/src/commands/market/book.ts`

**What It Does**:
- Fetch QuoteCache from slab
- Display bids and asks
- Calculate spread

**Reusable For UI**:
```typescript
// trading-ui/src/hooks/useOrderBook.ts

export function useOrderBook(slabAddress: PublicKey) {
  const [book, setBook] = useState<OrderBook | null>(null);

  useEffect(() => {
    const fetchBook = async () => {
      const slabClient = new SlabClient(connection, config.slabProgramId);

      // REUSE from CLI book.ts:35-60
      const quotes = await slabClient.getSlabQuotes(slabAddress);

      setBook({
        bids: quotes.best_bids, // Array of {px, avail_qty}
        asks: quotes.best_asks,
        spread: calculateSpread(quotes.best_bids[0].px, quotes.best_asks[0].px),
      });
    };

    fetchBook();
    const interval = setInterval(fetchBook, 2000); // Poll every 2s

    return () => clearInterval(interval);
  }, [slabAddress]);

  return { book };
}
```

**Key Logic to Reuse**:
- ✅ QuoteCache fetching via SDK
- ✅ Spread calculation
- ✅ Bid/ask parsing

---

## 4. Discovery Commands (Reference)

### 4.1 Slab & Instrument Discovery

**CLI**:
- `cli-client/src/commands/discovery/slabs.ts`
- `cli-client/src/commands/discovery/instruments.ts`
- `cli-client/src/commands/discovery/slabInfo.ts`

**What They Do**:
- List all active slabs
- List instruments on a slab
- Display slab metadata

**Reusable For UI**:
```typescript
// trading-ui/src/hooks/useMarkets.ts

export function useMarkets() {
  const [markets, setMarkets] = useState<Market[]>([]);

  useEffect(() => {
    const fetchMarkets = async () => {
      const client = new RouterClient(connection, config.routerProgramId);
      const slabClient = new SlabClient(connection, config.slabProgramId);

      // REUSE from CLI slabs.ts:40-75
      const registry = await client.getRegistry();

      const activeSlabs = registry.slabs
        .slice(0, registry.slab_count)
        .filter(s => s.active);

      // For each slab, fetch instruments (REUSE from instruments.ts)
      const markets = [];
      for (const slab of activeSlabs) {
        const instruments = await slabClient.getInstruments(slab.slabId);

        for (const instrument of instruments) {
          markets.push({
            instrumentAddress: instrument.pubkey,
            slabAddress: slab.slabId,
            symbol: await getSymbolForInstrument(instrument.pubkey), // TODO
            oracle: slab.oracleId,
          });
        }
      }

      setMarkets(markets);
    };

    fetchMarkets();
  }, []);

  return { markets };
}
```

**Key Logic to Reuse**:
- ✅ Registry iteration
- ✅ Active slab filtering
- ✅ Instrument enumeration

---

## 5. Reusable Patterns Summary

### 5.1 Copy These Files Directly

| CLI File | UI Destination | Notes |
|----------|----------------|-------|
| `config/networks.ts` | `lib/config.ts` | Change env var prefix |
| `utils/display.ts` | `lib/utils.ts` | Remove chalk, keep formatting |

### 5.2 Adapt These Patterns

| CLI File | UI Hook/Component | Key Logic to Reuse |
|----------|-------------------|-------------------|
| `commands/trading/buy.ts` | `hooks/useTrade.ts` | Input parsing, SDK calls, tx building |
| `commands/trading/sell.ts` | `hooks/useTrade.ts` | Same as buy |
| `commands/router/portfolio.ts` | `hooks/usePortfolio.ts` | **NETTING ALGORITHM** (critical!) |
| `commands/router/deposit.ts` | `hooks/usePortfolio.ts` | Portfolio init, deposit flow |
| `commands/router/withdraw.ts` | `hooks/usePortfolio.ts` | Withdraw validation |
| `commands/market/price.ts` | `hooks/useMarketData.ts` | Oracle parsing |
| `commands/market/book.ts` | `hooks/useOrderBook.ts` | QuoteCache parsing |
| `commands/discovery/slabs.ts` | `hooks/useMarkets.ts` | Registry iteration |

### 5.3 Key Algorithms to Preserve

1. **Portfolio Netting** (`portfolio.ts:238-343`):
   - Group by instrument pubkey
   - Sum quantities for net exposure
   - Weighted average entry price
   - Aggregate margin by instrument

2. **Input Validation**:
   - `parseQuantity()` - Round to 2 decimals
   - `parseLeverage()` - Validate 1-10x

3. **Amount Formatting**:
   - `formatAmount()` - Handles negatives correctly
   - `formatSol()` - 9 decimal precision

4. **Transaction Building**:
   - Receipt keypair generation
   - Instruction ordering (receiptSetup → trade instruction)
   - Blockhash and fee payer setup

---

## 6. Code Reuse Checklist

### Phase 1: Core Utilities ✅
- [ ] Copy `formatAmount()`, `formatSol()`, `formatPrice()` to `lib/utils.ts`
- [ ] Copy `calculateSpread()` to `lib/utils.ts`
- [ ] Copy `getExplorerUrl()` to `lib/utils.ts`
- [ ] Copy `getNetworkConfig()` pattern to `lib/config.ts`
- [ ] Adapt network config for Next.js env vars

### Phase 2: Trading Hooks ✅
- [ ] Extract `parseQuantity()` and `parseLeverage()` to `lib/validation.ts`
- [ ] Implement `useTrade()` hook using buy.ts/sell.ts patterns
- [ ] Copy SDK client setup pattern
- [ ] Copy transaction building flow
- [ ] Adapt wallet signing (adapter instead of keypair)

### Phase 3: Portfolio Hooks ✅✅✅ (MOST IMPORTANT!)
- [ ] **Copy entire netting algorithm** from `portfolio.ts:238-343`
- [ ] Implement `usePortfolio()` hook
- [ ] Copy PositionDetails PDA parsing logic
- [ ] Copy weighted average entry price calculation
- [ ] Copy margin aggregation by instrument
- [ ] Add real-time polling (10s interval)

### Phase 4: Market Data Hooks ✅
- [ ] Implement `useMarketData()` using price.ts patterns
- [ ] Copy oracle parsing logic (offset 80)
- [ ] Implement `useOrderBook()` using book.ts patterns
- [ ] Copy QuoteCache parsing
- [ ] Add polling for real-time updates

### Phase 5: Discovery ✅
- [ ] Implement `useMarkets()` using slabs.ts patterns
- [ ] Copy registry iteration logic
- [ ] Copy instrument enumeration

---

## 7. Testing Strategy

### 7.1 Unit Tests (Reuse from CLI)

The CLI has tests we can adapt:
- `__tests__/utils/display.test.ts` - Copy formatting tests
- `__tests__/utils/wallet.test.ts` - Adapt for wallet adapter
- `__tests__/commands/integration.test.ts` - Reference for E2E

### 7.2 Integration Tests

Test UI hooks against localnet using same flows as CLI:
1. Connect wallet
2. Deposit SOL
3. Execute trade
4. Check portfolio (verify netting!)
5. Withdraw

---

## 8. Migration Priorities

### High Priority (Week 1)
1. ✅ Copy formatting utilities (`formatAmount`, etc.)
2. ✅ Copy network config pattern
3. ✅ Implement wallet adapter using `loadKeypair()` logic

### Critical Priority (Week 2)
4. ✅✅✅ **Copy portfolio netting algorithm** - This is the most important!
5. ✅ Implement `useTrade()` using buy/sell patterns
6. ✅ Implement `usePortfolio()` with netting

### Medium Priority (Week 3)
7. ✅ Implement `useMarketData()` using price patterns
8. ✅ Implement `useOrderBook()` using book patterns
9. ✅ Add real-time polling

### Low Priority (Week 4)
10. ✅ Implement `useMarkets()` for discovery
11. ✅ Add deposit/withdraw functionality
12. ✅ Polish and optimize

---

## 9. Key Takeaways

### What to Copy Verbatim
- ✅ Formatting utilities (100% reusable)
- ✅ Network config pattern (95% reusable, just change env vars)
- ✅ **Portfolio netting algorithm** (95% reusable, critical!)

### What to Adapt
- ⚠️ Wallet loading (file → env var → browser wallet)
- ⚠️ Output (console → React state → UI components)
- ⚠️ Error handling (throw → toast notifications)

### What to Add New
- 🆕 Real-time polling intervals
- 🆕 React state management (Zustand)
- 🆕 Browser wallet integration
- 🆕 UI components (forms, tables, charts)

---

## 10. Example: Complete Reuse Flow

Here's how to reuse CLI code for portfolio display:

### Step 1: Copy Utilities
```typescript
// trading-ui/src/lib/utils.ts
// Copy from cli-client/src/utils/display.ts
export function formatAmount(amount: BN, decimals: number = 6): string {
  // ... exact copy ...
}
```

### Step 2: Adapt Portfolio Logic
```typescript
// trading-ui/src/hooks/usePortfolio.ts
// Adapt from cli-client/src/commands/router/portfolio.ts

export function usePortfolio() {
  // Lines 135-150: Setup (adapt)
  const fetchPortfolio = async () => {
    const client = new RouterClient(connection, config.routerProgramId);
    const portfolio = await client.getPortfolio(userAddress);

    // Lines 151-236: Position fetching (adapt)
    // ... fetch PositionDetails PDAs ...

    // Lines 238-343: NETTING ALGORITHM (copy verbatim!)
    const positionsByInstrument = new Map<string, PositionData>();

    for (const exp of portfolio.exposures) {
      // ... exact logic from CLI ...
      const existing = positionsByInstrument.get(instrumentAddress);
      if (existing) {
        existing.totalQty = existing.totalQty.add(exp.positionQty);
        existing.weightedEntryPrice = existing.weightedEntryPrice.add(notional);
        // ... (lines 238-283, exact copy)
      }
    }

    // Lines 287-343: Display calculation (adapt to React state)
    return Array.from(positionsByInstrument.values());
  };

  return { positions, loading };
}
```

### Step 3: Display in React
```typescript
// trading-ui/src/components/PositionList.tsx
export function PositionList() {
  const { positions } = usePortfolio();

  return (
    <table>
      {positions.map(p => (
        <tr>
          <td>{p.instrumentAddress}</td>
          <td>{formatAmount(p.totalQty)}</td>
          {/* Same columns as CLI table */}
        </tr>
      ))}
    </table>
  );
}
```

---

## 11. Conclusion

**70-80% of CLI logic is directly reusable** for the UI:
- Formatting utilities: 100% reusable
- Trading logic: 80% reusable (adapt wallet signing)
- Portfolio netting: 95% reusable (critical algorithm!)
- Market data: 85% reusable (add polling)

**Key Success Factor**: The portfolio netting algorithm (lines 238-343) MUST be copied exactly to ensure consistent behavior between CLI and UI.

**Next Step**: Start with Phase 1 (utilities) and build up from there, testing each piece against localnet as we go.

---

**Document Version**: 1.0
**Last Updated**: 2025-10-28
**Author**: Claude (Barista DEX Development Agent)
**Status**: Ready for Implementation
