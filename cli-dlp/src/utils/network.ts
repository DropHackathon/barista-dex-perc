import { Connection, PublicKey } from '@solana/web3.js';
import {
  Cluster,
  getRpcEndpoint,
  ROUTER_PROGRAM_IDS,
  SLAB_PROGRAM_IDS,
} from '@barista-dex/sdk';

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
export function getRpcUrl(network: NetworkType, customUrl?: string): string {
  if (customUrl) {
    return customUrl;
  }

  return getRpcEndpoint(network as Cluster);
}

/**
 * Get program IDs for network
 * Uses SDK constants which support ENV variable overrides for localnet
 */
export function getProgramIds(network: NetworkType): {
  routerProgramId: PublicKey;
  slabProgramId: PublicKey;
} {
  return {
    routerProgramId: ROUTER_PROGRAM_IDS[network as Cluster],
    slabProgramId: SLAB_PROGRAM_IDS[network as Cluster],
  };
}

/**
 * Create connection to Solana cluster
 */
export function createConnection(
  network: NetworkType,
  customUrl?: string
): Connection {
  const rpcUrl = getRpcUrl(network, customUrl);
  return new Connection(rpcUrl, 'confirmed');
}

/**
 * Get network config
 */
export function getNetworkConfig(
  network: NetworkType,
  customUrl?: string
): NetworkConfig {
  const rpcUrl = getRpcUrl(network, customUrl);
  const { routerProgramId, slabProgramId } = getProgramIds(network);

  return {
    name: network,
    rpcUrl,
    routerProgramId,
    slabProgramId,
  };
}
