import { useState, useEffect, useRef } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { BaristaClient } from '../BaristaClient';
import { useBarista } from './useBarista';
import { getConfig } from '../config';
import { getInstrumentMetadata } from '../instruments/config';

export interface Market {
  slab: PublicKey;
  instrument: PublicKey;
  symbol: string;
  markPrice: number;
  takerFeeBps: number;
  contractSize: number;
}

export function useMarkets() {
  const { client, connected } = useBarista();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isFirstFetch = useRef(true);

  useEffect(() => {
    if (!client) {
      return;
    }

    const fetchMarkets = async () => {
      // Only show loading on first fetch
      if (isFirstFetch.current) {
        setIsLoading(true);
      }
      setError(null);

      try {
        // Fetch all slabs from the blockchain (works without wallet)
        const slabs = await client.getAllSlabs();

        const marketsData: Market[] = (await Promise.all(
          slabs.map(async (slab) => {
            // Fetch slab state
            const slabState = await client.getSlabState(slab);

            if (!slabState) {
              return null;
            }

            // Filter out uninitialized/inactive slabs
            // Inactive slabs have instrument = SystemProgram (11111111111111111111111111111111)
            const SYSTEM_PROGRAM = '11111111111111111111111111111111';
            if (slabState.instrument.toBase58() === SYSTEM_PROGRAM) {
              return null;
            }

            // Fetch instruments (v0: returns 1, future: up to 32)
            const instruments = await client.getInstruments(slab);
            const instrument = instruments[0];

            // Try to fetch live oracle price (localnet), fallback to slab mark price
            const oraclePrice = await client.getOraclePrice(slabState.instrument);
            const markPrice = oraclePrice ?? (slabState.markPx.toNumber() / 1_000_000);

            // Get instrument metadata (symbol, display name, etc.)
            const config = getConfig();
            const metadata = getInstrumentMetadata(slabState.instrument, config.network);

            return {
              slab,
              instrument: slabState.instrument,
              symbol: metadata.symbol,
              markPrice,
              takerFeeBps: slabState.takerFeeBps.toNumber() / 10_000, // Convert from 1e6 scale to bps
              contractSize: slabState.contractSize.toNumber() / 1_000_000, // Convert from 1e6 scale
            };
          })
        )).filter((m): m is Market => m !== null); // Filter out null values

        setMarkets(marketsData);
        isFirstFetch.current = false;
      } catch (err) {
        console.error('Error fetching markets:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    // Fetch markets immediately
    fetchMarkets();

    // Poll for price updates every 10 seconds
    const interval = setInterval(() => {
      fetchMarkets();
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, [client]);

  return { markets, isLoading, error };
}
