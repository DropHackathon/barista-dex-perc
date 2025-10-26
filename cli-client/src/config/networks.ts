import { PublicKey } from '@solana/web3.js';
import {
  Cluster,
  ROUTER_PROGRAM_IDS,
  SLAB_PROGRAM_IDS,
  RPC_ENDPOINTS,
} from '@barista-dex/sdk';

/**
 * Network-specific configuration for Barista DEX
 *
 * Note: This file imports constants from @barista-dex/sdk
 * to maintain a single source of truth.
 */
export interface NetworkConfig {
  routerProgramId: PublicKey;
  slabProgramId: PublicKey;
  oracleProgramId: PublicKey;
  rpcUrl: string;
}

// Oracle program IDs (placeholder - update with actual deployed IDs)
export const ORACLE_PROGRAM_IDS: Record<Cluster, PublicKey> = {
  'mainnet-beta': new PublicKey('11111111111111111111111111111111'), // TODO: Deploy
  'devnet': new PublicKey('11111111111111111111111111111111'), // TODO: Deploy
  'localnet': new PublicKey('11111111111111111111111111111111'), // TODO: Set from deployment
};

/**
 * Supported networks (re-exported from SDK)
 */
export type NetworkName = Cluster;

/**
 * Network configurations using SDK constants
 * All program IDs and RPC endpoints come from @barista-dex/sdk
 */
export const NETWORK_CONFIGS: Record<NetworkName, NetworkConfig> = {
  'mainnet-beta': {
    routerProgramId: ROUTER_PROGRAM_IDS['mainnet-beta'],
    slabProgramId: SLAB_PROGRAM_IDS['mainnet-beta'],
    oracleProgramId: ORACLE_PROGRAM_IDS['mainnet-beta'],
    rpcUrl: RPC_ENDPOINTS['mainnet-beta'],
  },
  'devnet': {
    routerProgramId: ROUTER_PROGRAM_IDS.devnet,
    slabProgramId: SLAB_PROGRAM_IDS.devnet,
    oracleProgramId: ORACLE_PROGRAM_IDS.devnet,
    rpcUrl: RPC_ENDPOINTS.devnet,
  },
  'localnet': {
    routerProgramId: ROUTER_PROGRAM_IDS.localnet,
    slabProgramId: SLAB_PROGRAM_IDS.localnet,
    oracleProgramId: ORACLE_PROGRAM_IDS.localnet,
    rpcUrl: RPC_ENDPOINTS.localnet,
  },
};

/**
 * Get network configuration with environment variable overrides
 *
 * Environment variables:
 * - BARISTA_NETWORK: Network name (mainnet-beta, devnet, localnet)
 * - BARISTA_RPC_URL: Custom RPC URL (overrides network default)
 * - BARISTA_ROUTER_PROGRAM: Custom router program ID
 * - BARISTA_SLAB_PROGRAM: Custom slab program ID
 * - BARISTA_ORACLE_PROGRAM: Custom oracle program ID
 *
 * @param networkName Network name (defaults to mainnet-beta)
 * @returns Network configuration with any env var overrides applied
 */
export function getNetworkConfig(networkName?: string): NetworkConfig {
  const network = (networkName || process.env.BARISTA_NETWORK || 'mainnet-beta') as NetworkName;

  if (!NETWORK_CONFIGS[network]) {
    throw new Error(
      `Invalid network: ${network}. Must be one of: mainnet-beta, devnet, localnet`
    );
  }

  const config = { ...NETWORK_CONFIGS[network] };

  // Apply environment variable overrides
  if (process.env.BARISTA_RPC_URL) {
    config.rpcUrl = process.env.BARISTA_RPC_URL;
  }

  if (process.env.BARISTA_ROUTER_PROGRAM) {
    config.routerProgramId = new PublicKey(process.env.BARISTA_ROUTER_PROGRAM);
  }

  if (process.env.BARISTA_SLAB_PROGRAM) {
    config.slabProgramId = new PublicKey(process.env.BARISTA_SLAB_PROGRAM);
  }

  if (process.env.BARISTA_ORACLE_PROGRAM) {
    config.oracleProgramId = new PublicKey(process.env.BARISTA_ORACLE_PROGRAM);
  }

  return config;
}

/**
 * Get default keypair path
 * Checks BARISTA_KEYPAIR env var, falls back to ~/.config/solana/id.json
 */
export function getDefaultKeypairPath(): string {
  return process.env.BARISTA_KEYPAIR || `${process.env.HOME}/.config/solana/id.json`;
}
