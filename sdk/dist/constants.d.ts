import { PublicKey } from '@solana/web3.js';
/**
 * Cluster/Network configuration
 */
export type Cluster = 'devnet' | 'mainnet-beta' | 'localnet';
/**
 * RPC endpoints for each cluster
 * For localnet, can be overridden via BARISTA_LOCALNET_RPC environment variable
 */
export declare const RPC_ENDPOINTS: Record<Cluster, string>;
/**
 * Program IDs for Router program across different clusters
 * For localnet, can be overridden via BARISTA_LOCALNET_ROUTER_PROGRAM_ID environment variable
 * TODO: Update with actual deployed program IDs after deployment
 */
export declare const ROUTER_PROGRAM_IDS: Record<Cluster, PublicKey>;
/**
 * Program IDs for Slab program across different clusters
 * For localnet, can be overridden via BARISTA_LOCALNET_SLAB_PROGRAM_ID environment variable
 * TODO: Update with actual deployed program IDs after deployment
 */
export declare const SLAB_PROGRAM_IDS: Record<Cluster, PublicKey>;
/**
 * Get program IDs for a specific cluster
 */
export declare function getProgramIds(cluster: Cluster): {
    router: PublicKey;
    slab: PublicKey;
};
/**
 * Get RPC endpoint for a specific cluster
 */
export declare function getRpcEndpoint(cluster: Cluster): string;
/**
 * On-chain program constants
 * These MUST match the values in programs/common/src/types.rs
 */
/**
 * Maximum number of slabs in the registry
 * Source: programs/common/src/types.rs:6
 */
export declare const MAX_SLABS = 16;
/**
 * Maximum number of instruments per slab
 * Source: programs/common/src/types.rs:9
 */
export declare const MAX_INSTRUMENTS = 32;
/**
 * Maximum number of LP buckets per portfolio
 * Source: programs/router/src/state/lp_bucket.rs:15
 */
export declare const MAX_LP_BUCKETS = 16;
/**
 * Maximum number of open orders per Slab LP bucket
 * Source: programs/router/src/state/lp_bucket.rs:18
 */
export declare const MAX_OPEN_ORDERS = 8;
/**
 * PnL vesting time constant (in slots)
 * After 4*tau, ~98% of PnL is vested
 * Default: 216,000 slots (~24h @ 400ms slots)
 * Source: programs/router/src/state/pnl_vesting.rs:35
 */
export declare const VESTING_TAU_SLOTS = 216000;
/**
 * Fixed-point scale for global haircut index
 * Source: programs/router/src/state/pnl_vesting.rs:16
 */
export declare const FP_ONE = 1000000000;
/**
 * Portfolio account size (exact)
 * This MUST match Portfolio::LEN from programs/router/src/state/portfolio.rs
 * Calculated as: size_of::<Portfolio>() = 12176 bytes (updated after MAX_SLABS reduced from 256 to 16)
 *
 * DO NOT use the calculated approximation below - use this exact value!
 */
export declare const PORTFOLIO_SIZE = 12176;
/**
 * Portfolio size calculation (for reference only - DO NOT USE)
 * The actual size (135056) differs from this calculation due to Rust's struct padding
 */
export declare const PORTFOLIO_FIXED_SIZE = 272;
export declare const EXPOSURE_SIZE = 12;
export declare const LP_BUCKET_SIZE = 350;
export declare const PORTFOLIO_SIZE_CALCULATED: number;
/**
 * Slab account size (exact)
 * This MUST match SlabState::LEN from programs/slab/src/state/slab.rs
 * Layout: SlabHeader (256B) + QuoteCache (256B) + BookArea (3KB)
 * Total: ~4KB
 */
export declare const SLAB_SIZE = 3584;
