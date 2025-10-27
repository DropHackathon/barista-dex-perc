import { PublicKey } from '@solana/web3.js';

/**
 * Cluster/Network configuration
 */
export type Cluster = 'devnet' | 'mainnet-beta' | 'localnet';

/**
 * RPC endpoints for each cluster
 * For localnet, can be overridden via BARISTA_LOCALNET_RPC environment variable
 */
export const RPC_ENDPOINTS: Record<Cluster, string> = {
  devnet: 'https://api.devnet.solana.com',
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  localnet: process.env.BARISTA_LOCALNET_RPC || 'http://localhost:8899',
};

/**
 * Program IDs for Router program across different clusters
 * For localnet, can be overridden via BARISTA_LOCALNET_ROUTER_PROGRAM_ID environment variable
 * TODO: Update with actual deployed program IDs after deployment
 */
export const ROUTER_PROGRAM_IDS: Record<Cluster, PublicKey> = {
  devnet: new PublicKey('RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr'), // TODO: Replace with actual devnet program ID
  'mainnet-beta': new PublicKey('RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr'), // TODO: Replace with actual mainnet program ID
  localnet: new PublicKey(
    process.env.BARISTA_LOCALNET_ROUTER_PROGRAM_ID || 'Hp6yAnuBFS7mU2P9c3euNrJv4h2oKvNmyWMUHKccB3wx'
  ),
};

/**
 * Program IDs for Slab program across different clusters
 * For localnet, can be overridden via BARISTA_LOCALNET_SLAB_PROGRAM_ID environment variable
 * TODO: Update with actual deployed program IDs after deployment
 */
export const SLAB_PROGRAM_IDS: Record<Cluster, PublicKey> = {
  devnet: new PublicKey('SLabZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk'), // TODO: Replace with actual devnet program ID
  'mainnet-beta': new PublicKey('SLabZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk'), // TODO: Replace with actual mainnet program ID
  localnet: new PublicKey(
    process.env.BARISTA_LOCALNET_SLAB_PROGRAM_ID || 'Hq5XLwLMcEnoGQJbYBeNaTBuTecEoSryavnpYWes8jdW'
  ),
};

/**
 * Get program IDs for a specific cluster
 */
export function getProgramIds(cluster: Cluster) {
  return {
    router: ROUTER_PROGRAM_IDS[cluster],
    slab: SLAB_PROGRAM_IDS[cluster],
  };
}

/**
 * Get RPC endpoint for a specific cluster
 */
export function getRpcEndpoint(cluster: Cluster): string {
  return RPC_ENDPOINTS[cluster];
}

/**
 * On-chain program constants
 * These MUST match the values in programs/common/src/types.rs
 */

/**
 * Maximum number of slabs in the registry
 * Source: programs/common/src/types.rs:6
 */
export const MAX_SLABS = 256;

/**
 * Maximum number of instruments per slab
 * Source: programs/common/src/types.rs:9
 */
export const MAX_INSTRUMENTS = 32;

/**
 * Maximum number of LP buckets per portfolio
 * Source: programs/router/src/state/lp_bucket.rs:15
 */
export const MAX_LP_BUCKETS = 16;

/**
 * Maximum number of open orders per Slab LP bucket
 * Source: programs/router/src/state/lp_bucket.rs:18
 */
export const MAX_OPEN_ORDERS = 8;

/**
 * PnL vesting time constant (in slots)
 * After 4*tau, ~98% of PnL is vested
 * Default: 216,000 slots (~24h @ 400ms slots)
 * Source: programs/router/src/state/pnl_vesting.rs:35
 */
export const VESTING_TAU_SLOTS = 216_000;

/**
 * Fixed-point scale for global haircut index
 * Source: programs/router/src/state/pnl_vesting.rs:16
 */
export const FP_ONE = 1_000_000_000;

/**
 * Portfolio account size (exact)
 * This MUST match Portfolio::LEN from programs/router/src/state/portfolio.rs
 * Calculated as: size_of::<Portfolio>() = 135056 bytes
 *
 * DO NOT use the calculated approximation below - use this exact value!
 */
export const PORTFOLIO_SIZE = 135056;

/**
 * Portfolio size calculation (for reference only - DO NOT USE)
 * The actual size (135056) differs from this calculation due to Rust's struct padding
 */
export const PORTFOLIO_FIXED_SIZE = 272;
export const EXPOSURE_SIZE = 12; // (u16, u16, i64)
export const LP_BUCKET_SIZE = 350; // Approximate (includes Option<AmmLp> and Option<SlabLp>)

export const PORTFOLIO_SIZE_CALCULATED =
  PORTFOLIO_FIXED_SIZE +
  MAX_SLABS * MAX_INSTRUMENTS * EXPOSURE_SIZE +
  MAX_LP_BUCKETS * LP_BUCKET_SIZE;

/**
 * Slab account size (exact)
 * This MUST match SlabState::LEN from programs/slab/src/state/slab.rs
 * Layout: SlabHeader (256B) + QuoteCache (256B) + BookArea (3KB)
 * Total: ~4KB
 */
export const SLAB_SIZE = 3584; // Exact size from Rust's size_of::<SlabState>()
