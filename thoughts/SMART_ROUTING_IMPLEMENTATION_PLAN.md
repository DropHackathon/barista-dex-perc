# Smart Routing Implementation Plan

**Goal**: Add intelligent slab selection for cross-slab routing, enabling automatic best execution across multiple liquidity venues trading the same instrument.

**Status**: 📋 Planning Phase
**Priority**: High (core feature for capital efficiency)
**Estimated Effort**: 2-3 days

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Architecture Overview](#architecture-overview)
3. [Implementation Steps](#implementation-steps)
4. [Testing Strategy](#testing-strategy)
5. [Documentation Updates](#documentation-updates)
6. [Future Enhancements](#future-enhancements)

---

## Current State Analysis

### What Exists ✅

**On-Chain Infrastructure**:
- ✅ Cross-slab routing via `execute_cross_slab` instruction
- ✅ QuoteCache in each slab (best 4 bid/ask levels)
- ✅ Instrument identification (Pubkey in SlabHeader)
- ✅ Multiple slabs can trade same instrument

**SDK Infrastructure**:
- ✅ `getAllSlabs()` - Discovers all slabs for a program
- ✅ `getSlabsForInstrument()` - Filters by instrument
- ✅ `getMarketPrice()` - Reads mark price from slab header
- ✅ `buildExecuteCrossSlabInstruction()` - Multi-slab execution

**CLI**:
- ✅ `buy`/`sell` commands with `--slab` flag
- ✅ Single-slab execution working

### What's Missing ❌

**SDK**:
- ❌ QuoteCache parsing (best bid/ask levels)
- ❌ Price comparison across slabs
- ❌ Best slab selection logic
- ❌ Order splitting across multiple slabs

**CLI**:
- ❌ `--instrument` flag for smart routing
- ❌ Automatic best price discovery
- ❌ Clear messaging about routing decisions

**Documentation**:
- ❌ Smart routing usage guide
- ❌ Instrument vs slab explanation
- ❌ Multi-venue liquidity concepts

---

## Architecture Overview

### Data Flow

```
User Request (--instrument BTC-PERP)
    ↓
CLI: Parse instrument ID
    ↓
SDK: findBestSlabForTrade(instrument, side, qty)
    ↓
SDK: getSlabsForInstrument() → [Slab1, Slab2, Slab3]
    ↓
SDK: getSlabQuotes() for each slab
    ↓
SDK: Compare quotes, select best price
    ↓
SDK: buildExecuteCrossSlabInstruction([bestSlab])
    ↓
On-chain: Execute trade on optimal slab
```

### Key Data Structures

**QuoteCache** (exists on-chain, needs SDK parser):
```rust
pub struct QuoteCache {
    pub seqno_snapshot: u32,
    pub best_bids: [QuoteLevel; 4],
    pub best_asks: [QuoteLevel; 4],
}

pub struct QuoteLevel {
    pub px: i64,           // Price (1e6 scale)
    pub avail_qty: i64,    // Available quantity
}
```

**Slab Layout** (for parsing):
```
Offset 0:   SlabHeader (256 bytes)
  - instrument: Pubkey at offset 80
  - mark_px: i64 at offset 176
Offset 256: QuoteCache (256 bytes)
  - seqno_snapshot: u32 at 256
  - best_bids[4]: 64 bytes at 264
  - best_asks[4]: 64 bytes at 328
Offset 512: BookArea (3KB+)
```

---

## Implementation Steps

### Phase 1: SDK QuoteCache Parsing

**Files to Modify**:
- `sdk/src/types/slab.ts` - Add QuoteCache types
- `sdk/src/clients/RouterClient.ts` - Add parsing methods

**Tasks**:

#### 1.1 Add QuoteCache Type Definitions
**File**: `sdk/src/types/slab.ts`

```typescript
export interface QuoteLevel {
  price: BN;         // 1e6 scale
  availableQty: BN;  // 1e6 scale
}

export interface QuoteCache {
  seqnoSnapshot: number;
  bestBids: QuoteLevel[];  // Up to 4 levels
  bestAsk: QuoteLevel[];   // Up to 4 levels
}

export interface SlabQuotes {
  slab: PublicKey;
  instrument: PublicKey;
  markPrice: BN;
  cache: QuoteCache;
}
```

#### 1.2 Implement QuoteCache Parsing
**File**: `sdk/src/clients/RouterClient.ts`

```typescript
/**
 * Parse QuoteCache from slab account data
 * @param data Slab account data
 * @param offset Offset to QuoteCache (default 256)
 * @returns Parsed QuoteCache
 */
private parseQuoteCache(data: Buffer, offset: number = 256): QuoteCache {
  let pos = offset;

  // Read seqno_snapshot (u32)
  const seqnoSnapshot = data.readUInt32LE(pos);
  pos += 4;
  pos += 4; // Skip padding

  // Read best_bids[4]
  const bestBids: QuoteLevel[] = [];
  for (let i = 0; i < 4; i++) {
    const px = new BN(data.readBigInt64LE(pos).toString());
    pos += 8;
    const availQty = new BN(data.readBigInt64LE(pos).toString());
    pos += 8;

    if (!px.isZero() || !availQty.isZero()) {
      bestBids.push({ price: px, availableQty: availQty });
    }
  }

  // Read best_asks[4]
  const bestAsks: QuoteLevel[] = [];
  for (let i = 0; i < 4; i++) {
    const px = new BN(data.readBigInt64LE(pos).toString());
    pos += 8;
    const availQty = new BN(data.readBigInt64LE(pos).toString());
    pos += 8;

    if (!px.isZero() || !availQty.isZero()) {
      bestAsks.push({ price: px, availableQty: availQty });
    }
  }

  return {
    seqnoSnapshot,
    bestBids,
    bestAsks,
  };
}

/**
 * Get detailed quotes from a slab (includes QuoteCache)
 * @param slabMarket Slab market address
 * @returns Slab quotes with best bid/ask levels
 */
async getSlabQuotes(slabMarket: PublicKey): Promise<SlabQuotes> {
  const accountInfo = await this.connection.getAccountInfo(slabMarket);

  if (!accountInfo) {
    throw new Error(`Slab market not found: ${slabMarket.toBase58()}`);
  }

  // Parse header for instrument and mark price
  const instrument = new PublicKey(accountInfo.data.slice(80, 112));
  const markPrice = new BN(accountInfo.data.readBigInt64LE(176).toString());

  // Parse QuoteCache at offset 256
  const cache = this.parseQuoteCache(accountInfo.data, 256);

  return {
    slab: slabMarket,
    instrument,
    markPrice,
    cache,
  };
}
```

**Tests**: Add unit tests for QuoteCache parsing with sample data

---

### Phase 2: SDK Smart Routing Logic

**Files to Modify**:
- `sdk/src/clients/RouterClient.ts` - Add routing methods

**Tasks**:

#### 2.1 Implement Best Slab Finder
**File**: `sdk/src/clients/RouterClient.ts`

```typescript
/**
 * Find the best slab for a trade (smart routing)
 * Compares prices across all slabs trading the same instrument
 *
 * @param instrumentId Instrument to trade
 * @param side 'buy' or 'sell'
 * @param quantity Desired quantity (for liquidity checking)
 * @param slabProgramId Slab program ID
 * @returns Best slab with price and available liquidity
 */
async findBestSlabForTrade(
  instrumentId: PublicKey,
  side: 'buy' | 'sell',
  quantity: BN,
  slabProgramId: PublicKey
): Promise<{
  slab: PublicKey;
  price: BN;
  availableQty: BN;
  totalLiquidity: BN;
}> {
  // 1. Get all slabs trading this instrument
  const slabAddresses = await this.getSlabsForInstrument(
    instrumentId,
    slabProgramId
  );

  if (slabAddresses.length === 0) {
    throw new Error(
      `No slabs found for instrument ${instrumentId.toBase58()}`
    );
  }

  // 2. Fetch quotes from all slabs in parallel
  const slabQuotes = await Promise.all(
    slabAddresses.map(async (slab) => {
      try {
        return await this.getSlabQuotes(slab);
      } catch (err) {
        // Skip slabs that fail to fetch
        return null;
      }
    })
  );

  // Filter out nulls
  const validQuotes = slabQuotes.filter((q): q is SlabQuotes => q !== null);

  if (validQuotes.length === 0) {
    throw new Error('Failed to fetch quotes from any slab');
  }

  // 3. Find best price across all slabs
  let bestSlab: PublicKey | null = null;
  let bestPrice: BN | null = null;
  let bestAvailQty: BN | null = null;
  let totalLiquidityAtLevel: BN = new BN(0);

  for (const quotes of validQuotes) {
    // Select appropriate side (buy looks at asks, sell looks at bids)
    const levels = side === 'buy' ? quotes.cache.bestAsks : quotes.cache.bestBids;

    if (levels.length === 0) continue; // No liquidity

    const topLevel = levels[0]; // Best price is always first

    if (topLevel.availableQty.isZero()) continue; // No quantity available

    // For buy: lower price is better (cheaper)
    // For sell: higher price is better (more revenue)
    const isBetter =
      !bestPrice ||
      (side === 'buy'
        ? topLevel.price.lt(bestPrice)
        : topLevel.price.gt(bestPrice));

    if (isBetter) {
      bestSlab = quotes.slab;
      bestPrice = topLevel.price;
      bestAvailQty = topLevel.availableQty;

      // Calculate total liquidity at this price level across all slabs
      totalLiquidityAtLevel = validQuotes
        .filter(q => {
          const lvl = side === 'buy' ? q.cache.bestAsks[0] : q.cache.bestBids[0];
          return lvl && lvl.price.eq(topLevel.price);
        })
        .reduce((sum, q) => {
          const lvl = side === 'buy' ? q.cache.bestAsks[0] : q.cache.bestBids[0];
          return sum.add(lvl.availableQty);
        }, new BN(0));
    }
  }

  if (!bestSlab || !bestPrice || !bestAvailQty) {
    throw new Error('No liquidity available across any slabs');
  }

  // 4. Check if sufficient liquidity exists
  if (bestAvailQty.lt(quantity)) {
    throw new Error(
      `Insufficient liquidity: requested ${quantity.toString()}, available ${bestAvailQty.toString()} at best price`
    );
  }

  return {
    slab: bestSlab,
    price: bestPrice,
    availableQty: bestAvailQty,
    totalLiquidity: totalLiquidityAtLevel,
  };
}
```

#### 2.2 Implement Multi-Slab Order Splitting (Future - v1+)
**File**: `sdk/src/clients/RouterClient.ts`

```typescript
/**
 * Build optimal splits across multiple slabs for large orders
 * Uses greedy algorithm to fill from best price to worst
 *
 * NOTE: v0 implementation - advanced feature for future use
 *
 * @param instrumentId Instrument to trade
 * @param side 'buy' or 'sell'
 * @param totalQuantity Total quantity to fill
 * @param slabProgramId Slab program ID
 * @returns Array of slab splits for best execution
 */
async buildOptimalSplits(
  instrumentId: PublicKey,
  side: 'buy' | 'sell',
  totalQuantity: BN,
  slabProgramId: PublicKey
): Promise<SlabSplit[]> {
  const slabAddresses = await this.getSlabsForInstrument(
    instrumentId,
    slabProgramId
  );

  const slabQuotes = await Promise.all(
    slabAddresses.map(async (slab) => {
      try {
        return await this.getSlabQuotes(slab);
      } catch {
        return null;
      }
    })
  );

  const validQuotes = slabQuotes.filter((q): q is SlabQuotes => q !== null);

  // Flatten all levels across all slabs
  type LevelWithSlab = QuoteLevel & { slab: PublicKey };
  const allLevels: LevelWithSlab[] = [];

  for (const quotes of validQuotes) {
    const levels = side === 'buy' ? quotes.cache.bestAsks : quotes.cache.bestBids;
    for (const level of levels) {
      if (!level.availableQty.isZero()) {
        allLevels.push({
          ...level,
          slab: quotes.slab,
        });
      }
    }
  }

  // Sort by price (ascending for buy, descending for sell)
  allLevels.sort((a, b) => {
    const cmp = a.price.cmp(b.price);
    return side === 'buy' ? cmp : -cmp;
  });

  // Greedy fill algorithm
  const splits: SlabSplit[] = [];
  let remaining = totalQuantity;

  for (const level of allLevels) {
    if (remaining.isZero()) break;

    const fillQty = BN.min(remaining, level.availableQty);

    splits.push({
      slabMarket: level.slab,
      isBuy: side === 'buy',
      size: fillQty,
      price: level.price,
    });

    remaining = remaining.sub(fillQty);
  }

  if (!remaining.isZero()) {
    throw new Error(
      `Insufficient total liquidity: ${remaining.toString()} remaining unfilled`
    );
  }

  return splits;
}
```

**Tests**: Add unit tests with mock slab data

---

### Phase 3: CLI Integration

**Files to Modify**:
- `cli-client/src/commands/trading/buy.ts`
- `cli-client/src/commands/trading/sell.ts`
- `cli-client/src/index.ts`

**Tasks**:

#### 3.1 Add `--instrument` Flag Support
**Files**: `buy.ts`, `sell.ts`

```typescript
interface BuyOptions {
  // Either slab OR instrument must be provided
  slab?: string;        // Manual slab selection
  instrument?: string;  // Smart routing by instrument (NEW)

  quantity: string;
  price?: string;       // Optional for market orders
  leverage?: string;
  keypair?: string;
  url?: string;
  network?: string;
}

export async function buyCommand(options: BuyOptions): Promise<void> {
  const spinner = ora('Initializing...').start();

  // Validate mutually exclusive flags
  if (options.slab && options.instrument) {
    spinner.fail();
    displayError('Cannot specify both --slab and --instrument. Choose one.');
    process.exit(1);
  }

  if (!options.slab && !options.instrument) {
    spinner.fail();
    displayError('Must specify either --slab or --instrument');
    console.log(chalk.gray('\nExamples:'));
    console.log(chalk.cyan('  barista buy --slab SLaBZ6Ps... -q 100'));
    console.log(chalk.cyan('  barista buy --instrument BTC-PERP -q 100'));
    process.exit(1);
  }

  // Setup connection and client
  const config = getConfig(options.network, options.url);
  const wallet = loadWallet(options.keypair);
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const client = new RouterClient(
    connection,
    new PublicKey(config.routerProgramId),
    wallet
  );

  const quantityInput = new BN(options.quantity);
  const leverage = parseLeverage(options.leverage || '1x');
  const isMarketOrder = !options.price;

  let slabMarket: PublicKey;
  let price: BN;

  try {
    if (options.instrument) {
      // ============ SMART ROUTING MODE ============
      spinner.text = 'Finding best slab for instrument...';
      const instrumentId = new PublicKey(options.instrument);

      const bestSlab = await client.findBestSlabForTrade(
        instrumentId,
        'buy',
        quantityInput,
        new PublicKey(config.slabProgramId)
      );

      slabMarket = bestSlab.slab;
      price = bestSlab.price;

      spinner.succeed();
      console.log();
      console.log(chalk.green('✓ Smart routing found best price'));
      console.log(chalk.gray(`  Instrument: ${options.instrument}`));
      console.log(chalk.gray(`  Best slab: ${slabMarket.toBase58()}`));
      console.log(chalk.gray(`  Best price: ${price.toString()} (${formatPrice(price)})`));
      console.log(chalk.gray(`  Available liquidity: ${bestSlab.availableQty.toString()}`));
      console.log();

    } else {
      // ============ MANUAL SLAB MODE (existing) ============
      slabMarket = new PublicKey(options.slab!);

      spinner.text = isMarketOrder
        ? 'Fetching market price...'
        : 'Validating order...';

      price = isMarketOrder
        ? await client.getMarketPrice(slabMarket, new PublicKey(config.slabProgramId))
        : new BN(options.price!);

      if (isMarketOrder) {
        console.log(chalk.gray(`  Market price: ${price.toString()}`));
      }
    }

    // Rest of existing buy logic (validation, execution, etc.)
    // ...

  } catch (error: any) {
    spinner.fail();
    displayError(error.message);
    process.exit(1);
  }
}
```

**Same changes apply to `sell.ts`** (with `side: 'sell'`)

#### 3.2 Update CLI Command Registration
**File**: `cli-client/src/index.ts`

```typescript
program
  .command('buy')
  .description('Execute a buy order with smart routing or manual slab selection')
  .option('--slab <address>', 'Slab market address (manual selection)')
  .option('--instrument <id>', 'Instrument ID for smart routing (e.g., BTC-PERP pubkey)')
  .requiredOption('-q, --quantity <amount>',
    'Margin to commit. With leverage, actual position = quantity × leverage')
  .option('-p, --price <price>',
    'Limit price (optional, omit for market order)')
  .option('-l, --leverage <multiplier>',
    'Leverage multiplier (e.g., "5x"). Default: 1x (spot)')
  .option('-n, --network <network>',
    'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'Custom RPC URL')
  .action(buyCommand);

program
  .command('sell')
  .description('Execute a sell order with smart routing or manual slab selection')
  .option('--slab <address>', 'Slab market address (manual selection)')
  .option('--instrument <id>', 'Instrument ID for smart routing (e.g., BTC-PERP pubkey)')
  .requiredOption('-q, --quantity <amount>',
    'Margin to commit. With leverage, actual position = quantity × leverage')
  .option('-p, --price <price>',
    'Limit price (optional, omit for market order)')
  .option('-l, --leverage <multiplier>',
    'Leverage multiplier (e.g., "5x"). Default: 1x (spot)')
  .option('-n, --network <network>',
    'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'Custom RPC URL')
  .action(sellCommand);
```

---

### Phase 4: Testing Strategy

#### 4.1 Unit Tests

**File**: `sdk/src/clients/__tests__/RouterClient.test.ts`

Add tests for:
- `parseQuoteCache()` with sample binary data
- `getSlabQuotes()` with mocked connection
- `findBestSlabForTrade()` with multiple mock slabs
- `buildOptimalSplits()` with various order sizes

**Test Cases**:
```typescript
describe('Smart Routing', () => {
  describe('parseQuoteCache', () => {
    it('should parse empty quote cache');
    it('should parse quote cache with bids only');
    it('should parse quote cache with asks only');
    it('should parse full quote cache (4 bids, 4 asks)');
  });

  describe('findBestSlabForTrade', () => {
    it('should find cheapest ask for buy order');
    it('should find highest bid for sell order');
    it('should throw if no slabs found for instrument');
    it('should throw if insufficient liquidity');
    it('should skip slabs with no liquidity');
    it('should handle parallel slab fetching failures gracefully');
  });

  describe('buildOptimalSplits', () => {
    it('should fill from single slab if sufficient liquidity');
    it('should split across multiple slabs for large orders');
    it('should respect price-time priority');
    it('should throw if total liquidity insufficient');
  });
});
```

#### 4.2 Integration Tests

**File**: `cli-client/src/__tests__/commands/smart-routing.test.ts`

Add tests for:
- CLI with `--instrument` flag
- CLI with mutually exclusive `--slab` and `--instrument` validation
- Error messaging for missing instrument

#### 4.3 Localnet Testing

**Manual Test Plan**:
1. Start localnet with multiple slabs trading same instrument
2. Set different prices in each slab's QuoteCache
3. Run `barista buy --instrument <ID> -q 100`
4. Verify correct slab selected (cheapest ask)
5. Run `barista sell --instrument <ID> -q 50`
6. Verify correct slab selected (highest bid)

---

### Phase 5: Documentation Updates

**Files to Create/Modify**:

#### 5.1 Create Smart Routing Guide
**File**: `thoughts/SMART_ROUTING_GUIDE.md`

Content:
- What is smart routing?
- Benefits of cross-slab execution
- How to use `--instrument` flag
- Understanding instrument IDs vs slab addresses
- Multi-venue liquidity aggregation
- Best execution guarantee
- Examples and use cases

#### 5.2 Update SDK README
**File**: `sdk/README.md`

Add section:
```markdown
### Smart Routing (Cross-Slab Execution)

Barista DEX supports multiple liquidity providers (slabs) trading the same instrument. Smart routing automatically finds the best price across all venues.

#### Find Best Slab
\`\`\`typescript
const bestSlab = await client.findBestSlabForTrade(
  instrumentId,     // e.g., BTC-PERP pubkey
  'buy',            // or 'sell'
  quantity,
  slabProgramId
);

console.log(`Best price: ${bestSlab.price}`);
console.log(`On slab: ${bestSlab.slab.toBase58()}`);
\`\`\`

#### Get Detailed Quotes
\`\`\`typescript
const quotes = await client.getSlabQuotes(slabMarket);

console.log('Best bid:', quotes.cache.bestBids[0]);
console.log('Best ask:', quotes.cache.bestAsks[0]);
\`\`\`

#### Multi-Slab Order Splitting (Advanced)
\`\`\`typescript
const splits = await client.buildOptimalSplits(
  instrumentId,
  'buy',
  largeQuantity,
  slabProgramId
);

const ix = client.buildExecuteCrossSlabInstruction(user, splits, slabProgramId);
\`\`\`
```

#### 5.3 Update CLI README
**File**: `cli-client/README.md`

Add section:
```markdown
### Smart Routing

The CLI supports two modes for trading:

#### 1. Manual Slab Selection
Specify a slab address directly:
\`\`\`bash
barista buy --slab SLaBZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk -q 100
\`\`\`

#### 2. Smart Routing (Automatic Best Execution)
Specify an instrument ID to automatically find the best price:
\`\`\`bash
# Smart routing finds cheapest ask across all BTC-PERP slabs
barista buy --instrument BtcPerpInstrumentPubkey111111111 -q 100

# Smart routing finds highest bid across all ETH-PERP slabs
barista sell --instrument EthPerpInstrumentPubkey111111111 -q 50
\`\`\`

**Benefits**:
- Automatic best price discovery
- No need to track multiple slab addresses
- Guaranteed best execution across venues
- Capital efficient cross-margin netting

**Note**: You must specify either `--slab` OR `--instrument`, not both.
```

#### 5.4 Update Main Project README
**File**: `README.md`

Update features section to highlight smart routing:
```markdown
### Key Features

- **Cross-Margin Portfolio**: Single collateral pool for all positions
- **Cross-Slab Smart Routing**: Automatic best execution across multiple liquidity venues
- **Atomic Fills**: Instant execution with oracle prices (v0)
- **SOL-Margined Perpetuals**: Trade any instrument with SOL collateral
- **Leverage Trading**: Up to 10x leverage with intuitive UX
- **Multi-Venue Liquidity**: Aggregate liquidity from multiple LPs trading same instrument
```

#### 5.5 Update Development History
**File**: `thoughts/PROJECT_DEVELOPMENT_HISTORY.md`

Add new phase:
```markdown
## Phase 8: Smart Routing Implementation

### Commits: `<hash>` → `<hash>`

**Goal**: Enable intelligent cross-slab routing with automatic best execution

### Smart Routing Infrastructure

**SDK Enhancements**:
- Added QuoteCache parsing from slab accounts
- Implemented `findBestSlabForTrade()` for best price discovery
- Added `buildOptimalSplits()` for multi-slab order aggregation
- New types: `QuoteCache`, `QuoteLevel`, `SlabQuotes`

**CLI Updates**:
- Added `--instrument` flag to buy/sell commands
- Smart routing mode vs manual slab selection
- Clear messaging about routing decisions
- Validation for mutually exclusive flags

**Capital Efficiency**:
- Automatic price comparison across venues
- Best execution guarantee
- Cross-margin netting across all slabs
- No manual venue selection required

**Impact**: Users can now trade by instrument rather than tracking individual slab addresses, with automatic best price discovery across all liquidity venues.
```

---

## Testing Strategy

### Unit Tests
- ✅ QuoteCache parsing with binary test data
- ✅ Best slab selection with mock data
- ✅ Order splitting algorithm
- ✅ Edge cases (no liquidity, insufficient funds, etc.)

### Integration Tests
- ✅ CLI command validation
- ✅ SDK method chaining
- ✅ Error handling paths

### Localnet Tests
- ✅ Multiple slabs with same instrument
- ✅ Price comparison accuracy
- ✅ Liquidity checking
- ✅ Execution on correct slab

### Performance Tests
- ✅ Parallel slab fetching speed
- ✅ Large order splitting efficiency
- ✅ Network request optimization

---

## Future Enhancements

### v1+ Features

1. **Slippage Protection**
   - Add `--max-slippage` flag
   - Reject if price moves beyond tolerance

2. **Multi-Slab Execution**
   - Implement `buildOptimalSplits()` in CLI
   - Add `--use-multiple-slabs` flag for large orders

3. **Price Impact Analysis**
   - Calculate expected price impact
   - Show warning for large orders

4. **Venue Reputation Scoring**
   - Track slab performance metrics
   - Prefer reliable venues in routing decisions

5. **Advanced Order Types**
   - TWAP (Time-Weighted Average Price)
   - VWAP (Volume-Weighted Average Price)
   - Iceberg orders across slabs

6. **Real-Time Quote Streaming**
   - WebSocket subscriptions to slabs
   - Live price updates in CLI

7. **Registry Integration**
   - Read from SlabRegistry instead of scanning
   - Faster slab discovery
   - Official venue list

---

## Success Metrics

**Functionality**:
- ✅ Smart routing selects correct slab 100% of time
- ✅ QuoteCache parsing matches on-chain data
- ✅ No execution failures due to routing errors

**Performance**:
- ✅ Slab discovery < 2 seconds (10 slabs)
- ✅ Price comparison < 100ms
- ✅ End-to-end routing < 3 seconds

**UX**:
- ✅ Clear messaging about routing decisions
- ✅ Helpful errors for edge cases
- ✅ Intuitive CLI flags

**Documentation**:
- ✅ Complete usage guide
- ✅ Updated SDK/CLI READMEs
- ✅ Code examples for all features

---

## Implementation Checklist

### SDK Implementation
- [ ] Add QuoteCache types to `sdk/src/types/slab.ts`
- [ ] Implement `parseQuoteCache()` in RouterClient
- [ ] Implement `getSlabQuotes()` in RouterClient
- [ ] Implement `findBestSlabForTrade()` in RouterClient
- [ ] Implement `buildOptimalSplits()` in RouterClient (optional for v0)
- [ ] Add unit tests for all new methods
- [ ] Update SDK README with examples

### CLI Implementation
- [ ] Add `--instrument` flag to buy command
- [ ] Add `--instrument` flag to sell command
- [ ] Implement smart routing mode in buy.ts
- [ ] Implement smart routing mode in sell.ts
- [ ] Add mutual exclusivity validation
- [ ] Update CLI command registration in index.ts
- [ ] Add integration tests
- [ ] Update CLI README with examples

### Testing
- [ ] Unit tests for QuoteCache parsing
- [ ] Unit tests for best slab selection
- [ ] Unit tests for order splitting
- [ ] Integration tests for CLI commands
- [ ] Localnet tests with multiple slabs
- [ ] Performance benchmarks

### Documentation
- [ ] Create SMART_ROUTING_GUIDE.md
- [ ] Update sdk/README.md
- [ ] Update cli-client/README.md
- [ ] Update main README.md
- [ ] Update PROJECT_DEVELOPMENT_HISTORY.md
- [ ] Add code examples to all docs

### Deployment
- [ ] Bump SDK version (0.1.3 → 0.1.4)
- [ ] Bump CLI version (0.1.1 → 0.1.2)
- [ ] Build and test packages
- [ ] Publish SDK to npm
- [ ] Publish CLI to npm
- [ ] Create git commit(s)
- [ ] Update changelog

---

**Document Created**: 2025-10-26
**Author**: Claude + Sean
**Status**: Ready for implementation
