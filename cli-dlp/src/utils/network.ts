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
 */
export function getRpcUrl(network: NetworkType, customUrl?: string): string {
  if (customUrl) {
    return customUrl;
  }

  switch (network) {
    case 'localnet':
      return 'http://localhost:8899';
    case 'devnet':
      return 'https://api.devnet.solana.com';
    case 'mainnet-beta':
      return 'https://api.mainnet-beta.solana.com';
    default:
      throw new Error(`Unknown network: ${network}`);
  }
}

/**
 * Get program IDs for network
 * TODO: Update with actual deployed program IDs
 */
export function getProgramIds(network: NetworkType): {
  routerProgramId: PublicKey;
  slabProgramId: PublicKey;
} {
  // TODO: Replace with actual deployed program IDs per network
  switch (network) {
    case 'localnet':
      // Localnet uses test program IDs (replace after deployment)
      return {
        routerProgramId: new PublicKey('11111111111111111111111111111111'),
        slabProgramId: new PublicKey('11111111111111111111111111111111'),
      };
    case 'devnet':
      // TODO: Deploy to devnet and update
      return {
        routerProgramId: new PublicKey('11111111111111111111111111111111'),
        slabProgramId: new PublicKey('11111111111111111111111111111111'),
      };
    case 'mainnet-beta':
      // TODO: Deploy to mainnet and update
      return {
        routerProgramId: new PublicKey('11111111111111111111111111111111'),
        slabProgramId: new PublicKey('11111111111111111111111111111111'),
      };
    default:
      throw new Error(`Unknown network: ${network}`);
  }
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
