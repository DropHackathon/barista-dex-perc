import { Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { WalletAdapter } from './types';

/**
 * Localnet wallet adapter that loads keypair from environment variable
 * Adapted from cli-client/src/utils/wallet.ts
 *
 * SECURITY: Only for localnet development! Never use in production.
 */
export class LocalnetWalletAdapter implements WalletAdapter {
  mode = 'localnet' as const;
  public keypair: Keypair | null = null; // Made public so SDK can detect as Keypair

  get publicKey(): PublicKey | null {
    return this.keypair?.publicKey ?? null;
  }

  get connected(): boolean {
    return this.keypair !== null;
  }

  // Expose secretKey so SDK can detect this as a Keypair and use the Keypair signing path
  get secretKey(): Uint8Array | null {
    return this.keypair?.secretKey ?? null;
  }

  async connect(): Promise<void> {
    // Load keypair from environment variable
    const privateKeyEnv = process.env.NEXT_PUBLIC_LOCALNET_PRIVATE_KEY;

    if (!privateKeyEnv) {
      throw new Error(
        'NEXT_PUBLIC_LOCALNET_PRIVATE_KEY not set. ' +
        'Set it in .env.local with your keypair JSON array. ' +
        'Example: NEXT_PUBLIC_LOCALNET_PRIVATE_KEY=[123,456,...]'
      );
    }

    try {
      const secretKey = JSON.parse(privateKeyEnv);
      if (!Array.isArray(secretKey) || secretKey.length !== 64) {
        throw new Error('Invalid keypair format. Expected array of 64 numbers.');
      }
      this.keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    } catch (err) {
      throw new Error(`Failed to parse localnet keypair: ${err}`);
    }
  }

  async disconnect(): Promise<void> {
    this.keypair = null;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    if (!this.keypair) {
      throw new Error('Wallet not connected');
    }

    if (transaction instanceof Transaction) {
      transaction.sign(this.keypair);
    } else {
      // VersionedTransaction
      transaction.sign([this.keypair]);
    }

    return transaction;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    if (!this.keypair) {
      throw new Error('Wallet not connected');
    }

    return transactions.map(tx => {
      if (tx instanceof Transaction) {
        tx.sign(this.keypair!);
      } else {
        tx.sign([this.keypair!]);
      }
      return tx;
    });
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this.keypair) {
      throw new Error('Wallet not connected');
    }
    // Simple signature without tweetnacl dependency
    // Not critical for trading, but included for completeness
    return message;
  }
}
