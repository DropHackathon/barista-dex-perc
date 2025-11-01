import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

export type WalletMode = 'localnet' | 'browser';

export interface WalletAdapter {
  mode: WalletMode;
  publicKey: PublicKey | null;
  connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
  signMessage?(message: Uint8Array): Promise<Uint8Array>;
}

export interface WalletContextState extends WalletAdapter {
  connecting: boolean;
  error: Error | null;
}
