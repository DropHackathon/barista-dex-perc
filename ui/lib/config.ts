import { PublicKey } from '@solana/web3.js';
import { getRpcEndpoint, type Cluster } from '@barista-dex/sdk';

export type NetworkName = Cluster; // Use SDK's Cluster type
export type WalletMode = 'localnet' | 'browser';

export interface AppConfig {
  walletMode: WalletMode;
  network: NetworkName;
  rpcUrl: string;
  routerProgramId: PublicKey;
  slabProgramId: PublicKey;
  oracleProgramId?: PublicKey; // Optional for localnet oracle support
  showDebugInfo: boolean;
  autoConnect: boolean;
}

/**
 * Get application configuration
 * Uses environment variables for program IDs (required for localnet custom deployments)
 */
export function getConfig(): AppConfig {
  const walletMode = (process.env.NEXT_PUBLIC_WALLET_MODE === 'localnet'
    ? 'localnet'
    : 'browser') as WalletMode;

  const network = (process.env.NEXT_PUBLIC_NETWORK ?? 'localnet') as NetworkName;

  // Get RPC URL from SDK (can be overridden via NEXT_PUBLIC_RPC_URL)
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? getRpcEndpoint(network);

  // Get program IDs from environment variables
  if (!process.env.NEXT_PUBLIC_ROUTER_PROGRAM_ID) {
    throw new Error('NEXT_PUBLIC_ROUTER_PROGRAM_ID is not set');
  }
  if (!process.env.NEXT_PUBLIC_SLAB_PROGRAM_ID) {
    throw new Error('NEXT_PUBLIC_SLAB_PROGRAM_ID is not set');
  }

  // Oracle program ID is optional (only needed for localnet to fetch live prices)
  const oracleProgramId = process.env.NEXT_PUBLIC_ORACLE_PROGRAM
    ? new PublicKey(process.env.NEXT_PUBLIC_ORACLE_PROGRAM)
    : undefined;

  return {
    walletMode,
    network,
    rpcUrl,
    routerProgramId: new PublicKey(process.env.NEXT_PUBLIC_ROUTER_PROGRAM_ID),
    slabProgramId: new PublicKey(process.env.NEXT_PUBLIC_SLAB_PROGRAM_ID),
    oracleProgramId,
    showDebugInfo: process.env.NEXT_PUBLIC_SHOW_DEBUG_INFO === 'true',
    autoConnect: process.env.NEXT_PUBLIC_AUTO_CONNECT === 'true',
  };
}
