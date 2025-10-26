import { Keypair } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Load keypair from file path
 * Supports both absolute and relative paths, with ~ expansion
 */
export function loadKeypair(keypairPath: string): Keypair {
  // Expand ~ to home directory
  if (keypairPath.startsWith('~')) {
    keypairPath = path.join(os.homedir(), keypairPath.slice(1));
  }

  // Resolve to absolute path
  const absolutePath = path.resolve(keypairPath);

  // Check if file exists
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Keypair file not found: ${absolutePath}`);
  }

  // Read and parse keypair
  try {
    const keypairData = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));

    // Handle both array format [1,2,3...] and Uint8Array
    const secretKey = Uint8Array.from(keypairData);

    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    throw new Error(`Failed to load keypair from ${absolutePath}: ${error}`);
  }
}

/**
 * Get default keypair path (Solana CLI default)
 */
export function getDefaultKeypairPath(): string {
  return path.join(os.homedir(), '.config', 'solana', 'id.json');
}
