# @barista-dex/sdk

TypeScript SDK for interacting with Barista DEX on Solana, a fork of Percolator DEX by Toly

> **For CLI Users:**
> - **Traders**: Use [`@barista-dex/cli`](../cli-client/README.md) for trading operations
> - **DLPs**: Use `@barista-dex/cli-dlp` (coming soon) for slab management and portfolio operations
>
> This SDK is for programmatic integration - building custom applications, bots, and integrations.

## Installation

```bash
npm install @barista-dex/sdk @solana/web3.js bn.js
```

## Quick Start

```typescript
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { RouterClient } from '@barista-dex/sdk';
import BN from 'bn.js';

// Setup connection and wallet
const connection = new Connection('https://api.devnet.solana.com');
const wallet = Keypair.fromSecretKey(/* your secret key */);

// Initialize Router client
const routerProgramId = new PublicKey('Your_Router_Program_ID');
const router = new RouterClient(connection, routerProgramId, wallet);

// Create and initialize portfolio
const initIx = router.buildInitializePortfolioInstruction(wallet.publicKey);
const tx = new Transaction().add(initIx);
const signature = await connection.sendTransaction(tx, [wallet]);
await connection.confirmTransaction(signature);

console.log('Portfolio initialized!');
```

## Core Concepts

### Router Program
The Router is the global coordinator that handles:
- **Collateral Management**: SOL deposits/withdrawals (v0.5)
- **Portfolio Margin**: Cross-margin accounts with health-based risk management
- **PnL Settlement**: Real SOL transfers between portfolios (v0.5 counterparty model)
- **Cross-Slab Routing**: Single-slab execution (v0.5), multi-slab in v1+
- **Liquidations**: Automated liquidation of undercollateralized positions

### Slab Program
Slabs are LP-run perpetual markets that:
- Run independent order books (v0.5: atomic fills only, v1: resting orders)
- Settle against mark price oracles
- Charge taker fees to traders
- Allow LPs to earn spread and fees

### v0.5 PnL Settlement Model
**Important**: v0.5 implements **DLP counterparty settlement**:
- Each slab has an LP/DLP owner who provides liquidity
- DLP creates a Portfolio account and deposits SOL capital
- Trades settle with **real SOL transfers** between User Portfolio ↔ DLP Portfolio
- **Zero-sum**: User profit = DLP loss (and vice versa)
- **Single-slab**: Only 1 slab per trade (cross-slab routing disabled in v0.5)
- **v1 migration**: Same Portfolio account will track LP inventory PnL (order book model)

## Complete Usage Guide

### 1. Setup and Configuration

#### Network Configuration

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { RouterClient, SlabClient } from '@barista-dex/sdk';

// Devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Localnet (for testing)
// const connection = new Connection('http://localhost:8899', 'confirmed');

// Mainnet-beta
// const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// Load wallet from file
import fs from 'fs';
const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync('wallet.json', 'utf-8')));
const wallet = Keypair.fromSecretKey(secretKey);

// Initialize clients
const routerProgramId = new PublicKey('YourRouterProgramId');
const slabProgramId = new PublicKey('YourSlabProgramId');

const router = new RouterClient(connection, routerProgramId, wallet);
const slab = new SlabClient(connection, slabProgramId, wallet);
```

#### Program Initialization (One-time)

```typescript
import { Transaction, SystemProgram } from '@solana/web3.js';

// Initialize the Router program (creates Registry and Authority)
async function initializeRouter() {
  const ix = router.buildInitializeInstruction(wallet.publicKey);

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log('Router initialized:', signature);
}
```

### 2. Portfolio Management

#### Initialize User Portfolio

```typescript
async function createPortfolio() {
  const ix = router.buildInitializePortfolioInstruction(wallet.publicKey);

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log('Portfolio created:', signature);
}
```

#### Deposit Collateral (SOL Only in v0)

```typescript
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

async function depositCollateral(solAmount: number) {
  // Convert SOL to lamports
  const amount = new BN(solAmount * LAMPORTS_PER_SOL);

  // Automatically creates portfolio if it doesn't exist
  const ensurePortfolioIxs = await router.ensurePortfolioInstructions(wallet.publicKey);
  const depositIx = await router.buildDepositInstruction(amount, wallet.publicKey);

  const tx = new Transaction()
    .add(...ensurePortfolioIxs)
    .add(depositIx);

  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log(`Deposited ${solAmount} SOL:`, signature);
}

// Example: Deposit 10 SOL
await depositCollateral(10);
```

**Note**: v0 supports SOL deposits only. USDC and other SPL tokens will be supported in v1+.

#### Withdraw Collateral (SOL Only in v0)

```typescript
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

async function withdrawCollateral(solAmount: number) {
  // Convert SOL to lamports
  const amount = new BN(solAmount * LAMPORTS_PER_SOL);

  const withdrawIx = await router.buildWithdrawInstruction(amount, wallet.publicKey);

  const tx = new Transaction().add(withdrawIx);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log(`Withdrew ${solAmount} SOL:`, signature);
}

// Example: Withdraw 5 SOL
await withdrawCollateral(5);
```

#### Check Portfolio Health

```typescript
import { formatUsd, formatHealth } from '@barista-dex/sdk';

async function checkPortfolioHealth() {
  const portfolio = await router.getPortfolio(wallet.publicKey);

  if (!portfolio) {
    console.log('Portfolio not found');
    return;
  }

  console.log('Portfolio Status:');
  console.log('  Collateral Value:', formatUsd(portfolio.collateralValue));
  console.log('  Unrealized PnL:   ', portfolio.unrealizedPnl.toString());
  console.log('  Equity:           ', formatUsd(portfolio.equity));
  console.log('  Maint Margin:     ', formatUsd(portfolio.maintMargin));
  console.log('  Health Ratio:     ', formatHealth(portfolio.health));

  const healthNum = portfolio.health.toNumber() / 1e6;
  if (healthNum < 100) {
    console.log('⚠️  WARNING: Portfolio is undercollateralized!');
  } else if (healthNum < 110) {
    console.log('⚠️  CAUTION: Close to liquidation threshold');
  } else {
    console.log('✓ Portfolio is healthy');
  }

  return portfolio;
}
```

### 3. Trading

#### Smart Routing (Automatic Best Execution)

```typescript
// Find best slab for trading an instrument
async function tradeWithSmartRouting(
  instrumentId: PublicKey,
  side: 'buy' | 'sell',
  quantity: BN
) {
  // Smart routing finds best price across all slabs
  const bestSlab = await router.findBestSlabForTrade(
    instrumentId,
    side,
    quantity,
    slabProgramId
  );

  console.log(`Best ${side} price: ${bestSlab.price}`);
  console.log(`On slab: ${bestSlab.slab.toBase58()}`);
  console.log(`Available liquidity: ${bestSlab.availableQty}`);

  // Execute on the best slab
  const split: SlabSplit = {
    slabMarket: bestSlab.slab,
    isBuy: side === 'buy',
    size: quantity,
    price: bestSlab.price,
  };

  const ix = router.buildExecuteCrossSlabInstruction(
    wallet.publicKey,
    [split],
    slabProgramId
  );

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  return signature;
}

// Example: Buy BTC-PERP with smart routing
const btcInstrument = new PublicKey('BTC...');
await tradeWithSmartRouting(btcInstrument, 'buy', new BN(1_000_000));
```

#### Get Quote Data from Slabs

```typescript
// Get detailed quotes from a slab (includes best bid/ask levels)
async function getSlabQuotes(slabMarket: PublicKey) {
  const quotes = await router.getSlabQuotes(slabMarket);

  console.log('Instrument:', quotes.instrument.toBase58());
  console.log('Mark Price:', quotes.markPrice.toString());
  console.log('\nBest Bids:');
  quotes.cache.bestBids.forEach((level, i) => {
    console.log(`  ${i + 1}. Price: ${level.price}, Qty: ${level.availableQty}`);
  });
  console.log('\nBest Asks:');
  quotes.cache.bestAsks.forEach((level, i) => {
    console.log(`  ${i + 1}. Price: ${level.price}, Qty: ${level.availableQty}`);
  });

  return quotes;
}
```

#### Manual Cross-Slab Trade

```typescript
import { SlabSplit } from '@barista-dex/sdk';

async function executeTrade(
  side: 'buy' | 'sell',
  totalSize: number,
  slabMarkets: PublicKey[]
) {
  // Split order across multiple slabs for best execution
  const sizePerSlab = totalSize / slabMarkets.length;

  const splits: SlabSplit[] = slabMarkets.map(market => ({
    slabMarket: market,
    isBuy: side === 'buy',
    size: new BN(sizePerSlab * 1_000_000), // 6 decimals
    price: new BN(50_000_000), // $50.00 limit price
  }));

  const ix = router.buildExecuteCrossSlabInstruction(
    wallet.publicKey,
    splits,
    slabProgramId
  );

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log(`Executed ${side} of ${totalSize}:`, signature);
}

// Example: Buy 10 ETH-PERP across 2 slabs
const slabs = [
  new PublicKey('Slab1Address'),
  new PublicKey('Slab2Address'),
];
await executeTrade('buy', 10, slabs);
```

#### Advanced Trading with Price Optimization

```typescript
async function smartTrade(
  side: 'buy' | 'sell',
  targetSize: number,
  maxSlippage: number = 0.01 // 1%
) {
  // Get best prices across all slabs
  const slabMarkets = await getAvailableSlabs(); // Your function to fetch slabs

  const slabPrices = await Promise.all(
    slabMarkets.map(async (slab) => {
      const state = await slabClient.getSlabState(slab);
      return { slab, markPx: state?.markPx || new BN(0) };
    })
  );

  // Sort by best price
  slabPrices.sort((a, b) => {
    if (side === 'buy') {
      return a.markPx.cmp(b.markPx); // Lowest first for buys
    } else {
      return b.markPx.cmp(a.markPx); // Highest first for sells
    }
  });

  // Build splits with slippage protection
  const splits: SlabSplit[] = slabPrices.slice(0, 3).map((item, idx) => {
    const slippageBps = maxSlippage * 10000 * (idx + 1);
    const slippageAdjustment = item.markPx.muln(slippageBps).divn(10000);

    const limitPrice = side === 'buy'
      ? item.markPx.add(slippageAdjustment)
      : item.markPx.sub(slippageAdjustment);

    return {
      slabMarket: item.slab,
      isBuy: side === 'buy',
      size: new BN((targetSize / 3) * 1_000_000),
      price: limitPrice,
    };
  });

  const ix = router.buildExecuteCrossSlabInstruction(
    wallet.publicKey,
    splits,
    slabProgramId
  );

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  return signature;
}
```

### 4. Liquidations (Keeper Bots)

#### Monitor and Liquidate Undercollateralized Positions

```typescript
async function liquidationKeeper() {
  // Scan for unhealthy portfolios
  const registry = await router.getRegistry();
  if (!registry) return;

  for (let i = 0; i < registry.numPortfolios; i++) {
    // Get portfolio data (you'd need to track users)
    const user = getUserAtIndex(i); // Your indexing function
    const portfolio = await router.getPortfolio(user);

    if (!portfolio) continue;

    const health = portfolio.health.toNumber() / 1e6;

    if (health < 100) {
      console.log(`Found liquidation target: ${user.toString()}`);
      await liquidateUser(user);
    }
  }
}

async function liquidateUser(targetUser: PublicKey) {
  const [portfolioPDA] = router.derivePortfolioPDA(targetUser);

  // Get required oracle and slab accounts
  const oracles = [
    new PublicKey('OracleAddress1'),
    new PublicKey('OracleAddress2'),
  ];

  const slabs = [
    new PublicKey('SlabAddress1'),
    new PublicKey('SlabAddress2'),
  ];

  const params = {
    portfolio: portfolioPDA,
    oracles,
    slabs,
    isPreliq: false,
    currentTs: new BN(Math.floor(Date.now() / 1000)),
  };

  const ix = router.buildLiquidateUserInstruction(params);

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log('Liquidation executed:', signature);
}

// Run keeper continuously
setInterval(liquidationKeeper, 10000); // Check every 10 seconds
```

#### Pre-liquidation (Warning System)

```typescript
async function preliquidateUser(targetUser: PublicKey) {
  const [portfolioPDA] = router.derivePortfolioPDA(targetUser);

  const params = {
    portfolio: portfolioPDA,
    oracles: [],
    slabs: [],
    isPreliq: true, // Pre-liquidation flag
    currentTs: new BN(Math.floor(Date.now() / 1000)),
  };

  const ix = router.buildLiquidateUserInstruction(params);

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);

  console.log('Pre-liquidation warning sent:', signature);
}
```

### 5. LP Operations

#### Initialize a Slab Market (LP)

```typescript
async function createSlabMarket(instrumentPubkey: PublicKey) {
  const markPx = new BN(50_000_000); // $50.00 initial mark price
  const takerFeeBps = new BN(5_000); // 0.5% taker fee
  const contractSize = new BN(1_000_000); // 1.0 contract size

  const ix = slabClient.buildInitializeSlabInstruction(
    wallet.publicKey, // LP owner
    routerProgramId,
    instrumentPubkey,
    markPx,
    takerFeeBps,
    contractSize,
    wallet.publicKey // payer
  );

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  // Derive slab address
  const [slabPDA] = slabClient.deriveSlabPDA(wallet.publicKey, instrumentPubkey);
  console.log('Slab created:', slabPDA.toString());

  return slabPDA;
}
```

#### Burn LP Shares

```typescript
async function burnLpShares(
  marketId: PublicKey,
  sharesToBurn: number,
  currentSharePrice: number
) {
  const params = {
    user: wallet.publicKey,
    marketId,
    sharesToBurn: new BN(sharesToBurn * 1_000_000),
    currentSharePrice: new BN(currentSharePrice * 1_000_000),
    currentTs: new BN(Math.floor(Date.now() / 1000)),
    maxStalenessSeconds: new BN(60), // 1 minute
  };

  const ix = router.buildBurnLpSharesInstruction(params);

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log('LP shares burned:', signature);
}
```

#### Cancel LP Orders

```typescript
async function cancelLpOrders(
  marketId: PublicKey,
  orderIds: number[]
) {
  if (orderIds.length > 16) {
    throw new Error('Can only cancel up to 16 orders at once');
  }

  const params = {
    user: wallet.publicKey,
    marketId,
    orderIds: orderIds.map(id => new BN(id)),
    freedQuote: new BN(0), // Updated by program
    freedBase: new BN(0),  // Updated by program
  };

  const ix = router.buildCancelLpOrdersInstruction(params);

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log(`Cancelled ${orderIds.length} orders:`, signature);
}
```

### 6. Market Data

#### Get Slab State

```typescript
async function getMarketInfo(slabAddress: PublicKey) {
  const state = await slabClient.getSlabState(slabAddress);

  if (!state) {
    console.log('Slab not found');
    return;
  }

  console.log('Market Information:');
  console.log('  LP Owner:       ', state.lpOwner.toString());
  console.log('  Instrument:     ', state.instrument.toString());
  console.log('  Mark Price:     ', state.markPx.toString());
  console.log('  Taker Fee (bps):', state.takerFeeBps.toString());
  console.log('  Contract Size:  ', state.contractSize.toString());
  console.log('  Sequence Number:', state.seqno);

  return state;
}
```

#### Get Fill Receipt

```typescript
async function getFillDetails(slabAddress: PublicKey, seqno: number) {
  const receipt = await slabClient.getFillReceipt(slabAddress, seqno);

  if (!receipt) {
    console.log('Fill not found');
    return;
  }

  console.log('Fill Details:');
  console.log('  Slab:      ', receipt.slab.toString());
  console.log('  Sequence:  ', receipt.seqno);
  console.log('  Side:      ', receipt.side === 0 ? 'BUY' : 'SELL');
  console.log('  Quantity:  ', receipt.qty.toString());
  console.log('  Fill Price:', receipt.fillPx.toString());
  console.log('  Timestamp: ', new Date(receipt.timestamp.toNumber() * 1000));

  return receipt;
}
```

### 7. Utility Functions

#### Format and Parse Amounts

```typescript
import { formatAmount, parseAmount, formatUsd } from '@barista-dex/sdk';

// Format token amounts
const amount = new BN(1_500_000); // 1.5 USDC (6 decimals)
console.log(formatAmount(amount, 6)); // "1.500000"
console.log(formatUsd(amount)); // "$1.500000"

// Parse user input
const userInput = "1.5";
const parsed = parseAmount(userInput, 6);
console.log(parsed.toString()); // "1500000"
```

#### Display Portfolio Summary

```typescript
import {
  formatUsd,
  formatHealth,
  formatTimestamp,
  truncatePubkey
} from '@barista-dex/sdk';

async function displayPortfolio(userAddress: PublicKey) {
  const portfolio = await router.getPortfolio(userAddress);

  if (!portfolio) {
    console.log('No portfolio found');
    return;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PORTFOLIO SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Owner:              ${truncatePubkey(portfolio.owner.toString())}`);
  console.log(`Collateral:         ${formatUsd(portfolio.collateralValue)}`);
  console.log(`Unrealized PnL:     ${portfolio.unrealizedPnl.toString()}`);
  console.log(`Equity:             ${formatUsd(portfolio.equity)}`);
  console.log(`Maintenance Margin: ${formatUsd(portfolio.maintMargin)}`);
  console.log(`Health Ratio:       ${formatHealth(portfolio.health)}`);
  console.log(`Last Update:        ${formatTimestamp(portfolio.lastUpdate)}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}
```

## Error Handling

```typescript
import { SendTransactionError, LAMPORTS_PER_SOL } from '@solana/web3.js';

async function safeDeposit(solAmount: number) {
  try {
    const amount = new BN(solAmount * LAMPORTS_PER_SOL);

    // Auto-create portfolio if needed
    const ensurePortfolioIxs = await router.ensurePortfolioInstructions(wallet.publicKey);
    const depositIx = await router.buildDepositInstruction(amount, wallet.publicKey);

    const tx = new Transaction()
      .add(...ensurePortfolioIxs)
      .add(depositIx);

    // Add recent blockhash and fee payer
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = wallet.publicKey;

    const signature = await connection.sendTransaction(tx, [wallet], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`Deposited ${solAmount} SOL successfully:`, signature);
    return signature;

  } catch (error) {
    if (error instanceof SendTransactionError) {
      console.error('Transaction error:', error.message);
      console.error('Logs:', error.logs);
    } else {
      console.error('Unexpected error:', error);
    }
    throw error;
  }
}
```

## API Reference

### RouterClient

#### Constructor
```typescript
new RouterClient(connection: Connection, programId: PublicKey, wallet?: Keypair)
```

#### PDA Derivation
- `derivePortfolioPDA(user: PublicKey): [PublicKey, number]`
- `deriveVaultPDA(mint: PublicKey): [PublicKey, number]`
- `deriveRegistryPDA(): [PublicKey, number]`
- `deriveAuthorityPDA(): [PublicKey, number]`

#### Account Fetching
- `getPortfolio(user: PublicKey): Promise<Portfolio | null>`
- `getRegistry(): Promise<Registry | null>`
- `getVault(mint: PublicKey): Promise<Vault | null>`

#### Instruction Builders
- `buildInitializeInstruction(payer: PublicKey): TransactionInstruction`
- `buildDepositInstruction(amount: BN, user: PublicKey): Promise<TransactionInstruction>` (SOL only in v0)
- `buildWithdrawInstruction(amount: BN, user: PublicKey): Promise<TransactionInstruction>` (SOL only in v0)
- `buildInitializePortfolioInstruction(user: PublicKey): TransactionInstruction`
- `ensurePortfolioInstructions(user: PublicKey): Promise<TransactionInstruction[]>` (auto-creates portfolio if needed)
- `buildExecuteCrossSlabInstruction(user, splits, slabProgram): TransactionInstruction`
- `buildLiquidateUserInstruction(params: LiquidationParams): TransactionInstruction`
- `buildBurnLpSharesInstruction(params: BurnLpSharesParams): TransactionInstruction`
- `buildCancelLpOrdersInstruction(params: CancelLpOrdersParams): TransactionInstruction`

### SlabClient

#### Constructor
```typescript
new SlabClient(connection: Connection, programId: PublicKey, wallet?: Keypair)
```

#### PDA Derivation
- `deriveSlabPDA(lpOwner: PublicKey, instrument: PublicKey): [PublicKey, number]`
- `deriveFillReceiptPDA(slab: PublicKey, seqno: number): [PublicKey, number]`

#### Account Fetching
- `getSlabState(slab: PublicKey): Promise<SlabState | null>`
- `getFillReceipt(slab: PublicKey, seqno: number): Promise<FillReceipt | null>`
- `getOrderBook(slab: PublicKey): Promise<OrderBook>`

#### Instruction Builders
- `buildInitializeSlabInstruction(lpOwner, routerId, instrument, markPx, takerFeeBps, contractSize, payer): TransactionInstruction`
- `buildCommitFillInstruction(slab, expectedSeqno, side, qty, limitPx, routerSigner): TransactionInstruction`

## Types

### Portfolio
```typescript
interface Portfolio {
  owner: PublicKey;
  collateralValue: BN;
  maintMargin: BN;
  unrealizedPnl: BN;
  equity: BN;
  health: BN;
  lastUpdate: BN;
}
```

### SlabSplit
```typescript
interface SlabSplit {
  slabMarket: PublicKey;
  isBuy: boolean;
  size: BN;
  price: BN;
}
```

### LiquidationParams
```typescript
interface LiquidationParams {
  portfolio: PublicKey;
  oracles: PublicKey[];
  slabs: PublicKey[];
  isPreliq: boolean;
  currentTs: BN;
}
```

## Best Practices

1. **Always check portfolio health before trading**
   ```typescript
   const portfolio = await router.getPortfolio(wallet.publicKey);
   if (portfolio.health.toNumber() / 1e6 < 110) {
     console.warn('Low health - add collateral or reduce position');
   }
   ```

2. **Use transaction confirmation**
   ```typescript
   const signature = await connection.sendTransaction(tx, [wallet]);
   await connection.confirmTransaction(signature, 'confirmed');
   ```

3. **Handle errors gracefully**
   ```typescript
   try {
     await executeTrade();
   } catch (error) {
     console.error('Trade failed:', error);
     // Implement retry logic or alert user
   }
   ```

4. **Monitor for liquidations (keepers)**
   - Scan portfolios periodically
   - React quickly to unhealthy positions
   - Ensure sufficient gas for liquidation transactions

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Clean build artifacts
npm run clean
```

## License

MIT
