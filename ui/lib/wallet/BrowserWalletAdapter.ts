import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { WalletAdapter } from './types';

/**
 * Browser wallet adapter for Phantom, Solflare, etc.
 * Detects and connects to installed Solana wallets
 */
export class BrowserWalletAdapter implements WalletAdapter {
  mode = 'browser' as const;
  private walletProvider: any = null;

  get publicKey(): PublicKey | null {
    return this.walletProvider?.publicKey ?? null;
  }

  get connected(): boolean {
    return this.walletProvider?.isConnected ?? false;
  }

  async connect(): Promise<void> {
    // Check for Phantom
    if (typeof window !== 'undefined' && 'phantom' in window) {
      const provider = (window as any).phantom?.solana;
      if (provider?.isPhantom) {
        try {
          await provider.connect();
          this.walletProvider = provider;
          console.log('[Browser Wallet] Connected to Phantom:', this.publicKey?.toBase58());
          return;
        } catch (err) {
          console.error('[Browser Wallet] Phantom connection failed:', err);
        }
      }
    }

    // Check for Solflare
    if (typeof window !== 'undefined' && 'solflare' in window) {
      const provider = (window as any).solflare;
      try {
        await provider.connect();
        this.walletProvider = provider;
        console.log('[Browser Wallet] Connected to Solflare:', this.publicKey?.toBase58());
        return;
      } catch (err) {
        console.error('[Browser Wallet] Solflare connection failed:', err);
      }
    }

    throw new Error(
      'No Solana wallet found. Please install Phantom (https://phantom.app) or Solflare (https://solflare.com)'
    );
  }

  async disconnect(): Promise<void> {
    if (this.walletProvider) {
      await this.walletProvider.disconnect();
      this.walletProvider = null;
      console.log('[Browser Wallet] Disconnected');
    }
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    if (!this.walletProvider) {
      throw new Error('Wallet not connected');
    }
    return await this.walletProvider.signTransaction(transaction);
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    if (!this.walletProvider) {
      throw new Error('Wallet not connected');
    }
    return await this.walletProvider.signAllTransactions(transactions);
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this.walletProvider) {
      throw new Error('Wallet not connected');
    }
    const result = await this.walletProvider.signMessage(message);
    return result.signature;
  }
}
