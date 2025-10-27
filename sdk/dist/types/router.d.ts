import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
/**
 * Router instruction discriminators
 * IMPORTANT: These must match programs/router/src/entrypoint.rs exactly
 */
export declare enum RouterInstruction {
    Initialize = 0,
    InitializePortfolio = 1,
    Deposit = 2,
    Withdraw = 3,
    ExecuteCrossSlab = 4,
    LiquidateUser = 5,
    BurnLpShares = 6,
    CancelLpOrders = 7
}
/**
 * Exposure: (slab_index, instrument_index, position_qty)
 * Represents a trader position in a specific instrument on a specific slab
 */
export interface Exposure {
    slabIndex: number;
    instrumentIndex: number;
    positionQty: BN;
}
/**
 * Venue kind enum
 */
export declare enum VenueKind {
    Slab = 0,
    Amm = 1
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
    lpShares: BN;
    sharePriceCached: BN;
    lastUpdateTs: BN;
}
/**
 * Slab LP order reservation tracking
 */
export interface SlabLp {
    reservedQuote: BN;
    reservedBase: BN;
    openOrderCount: number;
    openOrderIds: BN[];
}
/**
 * LP Bucket: venue-scoped liquidity provider exposure
 */
export interface LpBucket {
    venue: VenueId;
    amm: AmmLp | null;
    slab: SlabLp | null;
    im: BN;
    mm: BN;
    active: boolean;
}
/**
 * Portfolio account structure
 *
 * IMPORTANT: This must match the on-chain layout exactly!
 * Source: programs/router/src/state/portfolio.rs
 */
export interface Portfolio {
    routerId: PublicKey;
    user: PublicKey;
    equity: BN;
    im: BN;
    mm: BN;
    freeCollateral: BN;
    lastMarkTs: BN;
    exposureCount: number;
    bump: number;
    health: BN;
    lastLiquidationTs: BN;
    cooldownSeconds: BN;
    principal: BN;
    pnl: BN;
    vestedPnl: BN;
    lastSlot: BN;
    pnlIndexCheckpoint: BN;
    exposures: Exposure[];
    lpBuckets: LpBucket[];
}
/**
 * Slab entry in registry
 */
export interface SlabEntry {
    slabId: PublicKey;
    versionHash: Buffer;
    oracleId: PublicKey;
    imr: BN;
    mmr: BN;
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
    imr: BN;
    mmr: BN;
    liqBandBps: BN;
    preliqBuffer: BN;
    preliqBandBps: BN;
    routerCapPerSlab: BN;
    minEquityToQuote: BN;
    oracleToleranceBps: BN;
    slabs: SlabEntry[];
}
/**
 * Vault account storing collateral for a specific mint
 * PDA: ["vault", router_id, mint]
 * Source: programs/router/src/state/vault.rs
 */
export interface Vault {
    routerId: PublicKey;
    mint: PublicKey;
    tokenAccount: PublicKey;
    balance: BN;
    totalPledged: BN;
    bump: number;
}
/**
 * Execution type enum (for oracle-validated fills)
 */
export declare enum ExecutionType {
    Market = 0,
    Limit = 1
}
/**
 * Slab split for cross-slab routing (v0.5: single slab only)
 */
export interface SlabSplit {
    slabMarket: PublicKey;
    side: number;
    qty: BN;
    limitPx: BN;
    oracle: PublicKey;
    dlpOwner?: PublicKey;
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
