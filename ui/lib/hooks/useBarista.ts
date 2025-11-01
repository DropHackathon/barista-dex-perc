import { useMemo } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { BaristaClient } from '../BaristaClient';
import { useWallet } from '../wallet/WalletProvider';
import { getConfig } from '../config';

export function useBarista() {
  const { adapter, connected, publicKey } = useWallet();

  // Memoize config to prevent recreating it on every render
  const config = useMemo(() => getConfig(), []);

  const client = useMemo(() => {
    const connection = new Connection(config.rpcUrl, 'confirmed');

    // Create wallet adapter object if connected
    const walletAdapter = connected && publicKey && adapter && adapter.signTransaction && adapter.signAllTransactions
      ? {
          publicKey: publicKey,
          signTransaction: adapter.signTransaction.bind(adapter),
          signAllTransactions: adapter.signAllTransactions.bind(adapter),
        }
      : undefined;

    // Create client with or without wallet
    // Read-only operations (like fetching markets) work without wallet
    return new BaristaClient(
      connection,
      publicKey || null,
      config.routerProgramId,
      config.slabProgramId,
      walletAdapter,
      config.oracleProgramId
    );
  }, [connected, publicKey, adapter, config]);

  return { client, connected };
}
