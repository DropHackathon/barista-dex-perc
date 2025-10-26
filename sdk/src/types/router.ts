import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

/**
 * Router instruction discriminators
 */
export enum RouterInstruction {
  Initialize = 0,
  Deposit = 1,
  Withdraw = 2,
  InitializePortfolio = 3,
  ExecuteCrossSlab = 4,
  LiquidateUser = 5,
  BurnLpShares = 6,
  CancelLpOrders = 7,
}

/**
 * Exposure: (slab_index, instrument_index, position_qty)
 * Represents a trader position in a specific instrument on a specific slab
 */
export interface Exposure {
  slabIndex: number;          // u16
  instrumentIndex: number;    // u16
  positionQty: BN;            // i64
}

/**
 * Venue kind enum
 */
export enum VenueKind {
  Slab = 0,
  Amm = 1,
}

/**
 * Venue identifier
 * Struct layout: market_id (32 bytes) + venue_kind (1 byte) + padding (7 bytes)
 */
export interface VenueId {
  marketId: PublicKey;
  venueKind: VenueKind;
}

/**
 * AMM LP share tracking
 */
export interface AmmLp {
  lpShares: BN;               // u64
  sharePriceCached: BN;       // i64
  lastUpdateTs: BN;           // u64
}

/**
 * Slab LP order reservation tracking
 */
export interface SlabLp {
  reservedQuote: BN;          // u128
  reservedBase: BN;           // u128
  openOrderCount: number;     // u16
  openOrderIds: BN[];         // [u64; MAX_OPEN_ORDERS]
}

/**
 * LP Bucket: venue-scoped liquidity provider exposure
 */
export interface LpBucket {
  venue: VenueId;
  amm: AmmLp | null;          // Option<AmmLp>
  slab: SlabLp | null;        // Option<SlabLp>
  im: BN;                     // u128
  mm: BN;                     // u128
  active: boolean;            // bool
}

/**
 * Portfolio account structure
 *
 * IMPORTANT: This must match the on-chain layout exactly!
 * Source: programs/router/src/state/portfolio.rs
 */
export interface Portfolio {
  // Identity
  routerId: PublicKey;        // 32 bytes
  user: PublicKey;            // 32 bytes

  // Cross-margin state
  equity: BN;                 // i128 (16 bytes)
  im: BN;                     // u128 (16 bytes) - Initial Margin
  mm: BN;                     // u128 (16 bytes) - Maintenance Margin
  freeCollateral: BN;         // i128 (16 bytes)
  lastMarkTs: BN;             // u64 (8 bytes)
  exposureCount: number;      // u16 (2 bytes)
  bump: number;               // u8 (1 byte)

  // Liquidation tracking
  health: BN;                 // i128 (16 bytes) = equity - mm
  lastLiquidationTs: BN;      // u64 (8 bytes)
  cooldownSeconds: BN;        // u64 (8 bytes)

  // PnL vesting state
  principal: BN;              // i128 (16 bytes) - deposits - withdrawals
  pnl: BN;                    // i128 (16 bytes) - current unrealized PnL
  vestedPnl: BN;              // i128 (16 bytes) - vested portion
  lastSlot: BN;               // u64 (8 bytes)
  pnlIndexCheckpoint: BN;     // i128 (16 bytes)

  // Dynamic arrays
  exposures: Exposure[];      // Trader positions (non-zero only)
  lpBuckets: LpBucket[];      // LP exposures (active only)
}

/**
 * Slab entry in registry
 */
export interface SlabEntry {
  slabId: PublicKey;
  versionHash: Buffer;
  oracleId: PublicKey;  // Oracle for this slab
  imr: BN;              // Initial margin ratio (basis points)
  mmr: BN;              // Maintenance margin ratio (basis points)
  makerFeeCap: BN;
  takerFeeCap: BN;
  latencySlaMs: BN;
  maxExposure: BN;
  registeredTs: BN;
  active: boolean;
}

/**
 * Registry account structure (SlabRegistry in Rust)
 */
export interface Registry {
  routerId: PublicKey;
  governance: PublicKey;
  slabCount: number;
  bump: number;
  // Liquidation parameters
  imr: BN;
  mmr: BN;
  liqBandBps: BN;
  preliqBuffer: BN;
  preliqBandBps: BN;
  routerCapPerSlab: BN;
  minEquityToQuote: BN;
  oracleToleranceBps: BN;
  // Registered slabs
  slabs: SlabEntry[];
}

/**
 * Vault account structure
 */
export interface Vault {
  mint: PublicKey;
  totalDeposits: BN;
  totalWithdrawals: BN;
  balance: BN;
}

/**
 * Execution type enum (for oracle-validated fills)
 */
export enum ExecutionType {
  Market = 0,
  Limit = 1,
}

/**
 * Slab split for cross-slab routing (v0.5: single slab only)
 */
export interface SlabSplit {
  slabMarket: PublicKey;
  side: number;      // 0 = Buy, 1 = Sell
  qty: BN;           // i64 - quantity in 1e6 scale
  limitPx: BN;       // i64 - limit price in 1e6 scale
  oracle: PublicKey; // Oracle price feed for this slab
  dlpOwner?: PublicKey; // LP/DLP owner (from slab.lp_owner) - required for v0.5 PnL settlement
}

/**
 * Liquidation parameters
 */
export interface LiquidationParams {
  portfolio: PublicKey;
  oracles: PublicKey[];
  slabs: PublicKey[];
  isPreliq: boolean;
  currentTs: BN;
}

/**
 * LP shares burn parameters
 */
export interface BurnLpSharesParams {
  user: PublicKey;
  marketId: PublicKey;
  sharesToBurn: BN;
  currentSharePrice: BN;
  currentTs: BN;
  maxStalenessSeconds: BN;
}

/**
 * Cancel LP orders parameters
 */
export interface CancelLpOrdersParams {
  user: PublicKey;
  marketId: PublicKey;
  orderIds: BN[];
  freedQuote: BN;
  freedBase: BN;
}

/**
 * Health calculation result
 */
export interface HealthResult {
  equity: BN;
  maintMargin: BN;
  health: BN;
  isHealthy: boolean;
}
