import { Connection, PublicKey } from '@solana/web3.js';
export type NetworkType = 'localnet' | 'devnet' | 'mainnet-beta';
/**
 * Network configuration
 */
export interface NetworkConfig {
    name: NetworkType;
    rpcUrl: string;
    routerProgramId: PublicKey;
    slabProgramId: PublicKey;
}
/**
 * Get RPC URL for network
 * Uses SDK constants which support ENV variable overrides for localnet
 */
export declare function getRpcUrl(network: NetworkType, customUrl?: string): string;
/**
 * Get program IDs for network
 * Uses SDK constants which support ENV variable overrides for localnet
 */
export declare function getProgramIds(network: NetworkType): {
    routerProgramId: PublicKey;
    slabProgramId: PublicKey;
};
/**
 * Create connection to Solana cluster
 */
export declare function createConnection(network: NetworkType, customUrl?: string): Connection;
/**
 * Get network config
 */
export declare function getNetworkConfig(network: NetworkType, customUrl?: string): NetworkConfig;
//# sourceMappingURL=network.d.ts.map