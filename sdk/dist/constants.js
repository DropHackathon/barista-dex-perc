"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SLAB_SIZE = exports.PORTFOLIO_SIZE_CALCULATED = exports.LP_BUCKET_SIZE = exports.EXPOSURE_SIZE = exports.PORTFOLIO_FIXED_SIZE = exports.PORTFOLIO_SIZE = exports.FP_ONE = exports.VESTING_TAU_SLOTS = exports.MAX_OPEN_ORDERS = exports.MAX_LP_BUCKETS = exports.MAX_INSTRUMENTS = exports.MAX_SLABS = exports.SLAB_PROGRAM_IDS = exports.ROUTER_PROGRAM_IDS = exports.RPC_ENDPOINTS = void 0;
exports.getProgramIds = getProgramIds;
exports.getRpcEndpoint = getRpcEndpoint;
const web3_js_1 = require("@solana/web3.js");
/**
 * RPC endpoints for each cluster
 * For localnet, can be overridden via BARISTA_LOCALNET_RPC environment variable
 */
exports.RPC_ENDPOINTS = {
    devnet: 'https://api.devnet.solana.com',
    'mainnet-beta': 'https://api.mainnet-beta.solana.com',
    localnet: process.env.BARISTA_LOCALNET_RPC || 'http://localhost:8899',
};
/**
 * Program IDs for Router program across different clusters
 * For localnet, can be overridden via BARISTA_LOCALNET_ROUTER_PROGRAM_ID environment variable
 * TODO: Update with actual deployed program IDs after deployment
 */
exports.ROUTER_PROGRAM_IDS = {
    devnet: new web3_js_1.PublicKey('RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr'), // TODO: Replace with actual devnet program ID
    'mainnet-beta': new web3_js_1.PublicKey('RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr'), // TODO: Replace with actual mainnet program ID
    localnet: new web3_js_1.PublicKey(process.env.BARISTA_LOCALNET_ROUTER_PROGRAM_ID || 'Hp6yAnuBFS7mU2P9c3euNrJv4h2oKvNmyWMUHKccB3wx'),
};
/**
 * Program IDs for Slab program across different clusters
 * For localnet, can be overridden via BARISTA_LOCALNET_SLAB_PROGRAM_ID environment variable
 * TODO: Update with actual deployed program IDs after deployment
 */
exports.SLAB_PROGRAM_IDS = {
    devnet: new web3_js_1.PublicKey('SLabZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk'), // TODO: Replace with actual devnet program ID
    'mainnet-beta': new web3_js_1.PublicKey('SLabZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk'), // TODO: Replace with actual mainnet program ID
    localnet: new web3_js_1.PublicKey(process.env.BARISTA_LOCALNET_SLAB_PROGRAM_ID || 'Hq5XLwLMcEnoGQJbYBeNaTBuTecEoSryavnpYWes8jdW'),
};
/**
 * Get program IDs for a specific cluster
 */
function getProgramIds(cluster) {
    return {
        router: exports.ROUTER_PROGRAM_IDS[cluster],
        slab: exports.SLAB_PROGRAM_IDS[cluster],
    };
}
/**
 * Get RPC endpoint for a specific cluster
 */
function getRpcEndpoint(cluster) {
    return exports.RPC_ENDPOINTS[cluster];
}
/**
 * On-chain program constants
 * These MUST match the values in programs/common/src/types.rs
 */
/**
 * Maximum number of slabs in the registry
 * Source: programs/common/src/types.rs:6
 */
exports.MAX_SLABS = 16; // Reduced from 256 to fit within 10KB CPI allocation limit
/**
 * Maximum number of instruments per slab
 * Source: programs/common/src/types.rs:9
 */
exports.MAX_INSTRUMENTS = 32;
/**
 * Maximum number of LP buckets per portfolio
 * Source: programs/router/src/state/lp_bucket.rs:15
 */
exports.MAX_LP_BUCKETS = 16;
/**
 * Maximum number of open orders per Slab LP bucket
 * Source: programs/router/src/state/lp_bucket.rs:18
 */
exports.MAX_OPEN_ORDERS = 8;
/**
 * PnL vesting time constant (in slots)
 * After 4*tau, ~98% of PnL is vested
 * Default: 216,000 slots (~24h @ 400ms slots)
 * Source: programs/router/src/state/pnl_vesting.rs:35
 */
exports.VESTING_TAU_SLOTS = 216000;
/**
 * Fixed-point scale for global haircut index
 * Source: programs/router/src/state/pnl_vesting.rs:16
 */
exports.FP_ONE = 1000000000;
/**
 * Portfolio account size (exact)
 * This MUST match Portfolio::LEN from programs/router/src/state/portfolio.rs
 * Calculated as: size_of::<Portfolio>() = 12176 bytes (updated after MAX_SLABS reduced from 256 to 16)
 *
 * DO NOT use the calculated approximation below - use this exact value!
 */
exports.PORTFOLIO_SIZE = 12176;
/**
 * Portfolio size calculation (for reference only - DO NOT USE)
 * The actual size (135056) differs from this calculation due to Rust's struct padding
 */
exports.PORTFOLIO_FIXED_SIZE = 272;
exports.EXPOSURE_SIZE = 12; // (u16, u16, i64)
exports.LP_BUCKET_SIZE = 350; // Approximate (includes Option<AmmLp> and Option<SlabLp>)
exports.PORTFOLIO_SIZE_CALCULATED = exports.PORTFOLIO_FIXED_SIZE +
    exports.MAX_SLABS * exports.MAX_INSTRUMENTS * exports.EXPOSURE_SIZE +
    exports.MAX_LP_BUCKETS * exports.LP_BUCKET_SIZE;
/**
 * Slab account size (exact)
 * This MUST match SlabState::LEN from programs/slab/src/state/slab.rs
 * Layout: SlabHeader (256B) + QuoteCache (256B) + BookArea (3KB)
 * Total: ~4KB
 */
exports.SLAB_SIZE = 3584; // Exact size from Rust's size_of::<SlabState>()
