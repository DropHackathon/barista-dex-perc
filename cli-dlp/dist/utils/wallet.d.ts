import { Keypair } from '@solana/web3.js';
/**
 * Load keypair from file path
 * Supports both absolute and relative paths, with ~ expansion
 */
export declare function loadKeypair(keypairPath: string): Keypair;
/**
 * Get default keypair path (Solana CLI default)
 */
export declare function getDefaultKeypairPath(): string;
//# sourceMappingURL=wallet.d.ts.map