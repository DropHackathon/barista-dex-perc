'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { LocalnetWalletAdapter } from './LocalnetWalletAdapter';
import { BrowserWalletAdapter } from './BrowserWalletAdapter';
import { WalletAdapter, WalletContextState } from './types';
import { getConfig } from '../config';

const WalletContext = createContext<(WalletContextState & { adapter: WalletAdapter | null }) | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [adapter, setAdapter] = useState<WalletAdapter | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initialize adapter on mount
  useEffect(() => {
    const config = getConfig();
    const initAdapter = config.walletMode === 'localnet'
      ? new LocalnetWalletAdapter()
      : new BrowserWalletAdapter();

    setAdapter(initAdapter);

    // Auto-connect if enabled
    if (config.autoConnect && config.walletMode === 'localnet') {
      // Auto-connect for localnet mode
      initAdapter.connect().catch(err => {
        console.error('Auto-connect failed:', err);
        setError(err);
      });
    }
  }, []);

  const connect = useCallback(async () => {
    if (!adapter) return;

    setConnecting(true);
    setError(null);

    try {
      await adapter.connect();
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [adapter]);

  const disconnect = useCallback(async () => {
    if (!adapter) return;

    try {
      await adapter.disconnect();
      setError(null);
    } catch (err) {
      setError(err as Error);
    }
  }, [adapter]);

  const value: WalletContextState & { adapter: WalletAdapter | null } = {
    adapter,
    mode: adapter?.mode ?? 'browser',
    publicKey: adapter?.publicKey ?? null,
    connected: adapter?.connected ?? false,
    connecting,
    error,
    connect,
    disconnect,
    signTransaction: adapter?.signTransaction.bind(adapter) ?? (async () => {
      throw new Error('No wallet adapter initialized');
    }),
    signAllTransactions: adapter?.signAllTransactions.bind(adapter) ?? (async () => {
      throw new Error('No wallet adapter initialized');
    }),
    signMessage: adapter?.signMessage?.bind(adapter),
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}
