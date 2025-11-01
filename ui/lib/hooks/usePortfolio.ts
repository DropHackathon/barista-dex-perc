import { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { useBarista } from './useBarista';
import { useWallet } from '../wallet/WalletProvider';

export interface Position {
  slab: PublicKey;
  instrument: PublicKey;
  instrumentSymbol: string;
  quantity: BN;
  avgEntryPrice: BN;
  markPrice: BN;
  unrealizedPnl: BN;
  leverage: number;
}

export interface PortfolioSummary {
  equity: BN;
  initialMargin: BN;
  maintenanceMargin: BN;
  freeCollateral: BN;
  marginRatio: number;
  totalUnrealizedPnl: BN;
}

export interface PortfolioData {
  positions: Position[];
  summary: PortfolioSummary;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function usePortfolio(): PortfolioData {
  const { client, connected } = useBarista();
  const { publicKey } = useWallet();
  const [positions, setPositions] = useState<Position[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary>({
    equity: new BN(0),
    initialMargin: new BN(0),
    maintenanceMargin: new BN(0),
    freeCollateral: new BN(0),
    marginRatio: 0,
    totalUnrealizedPnl: new BN(0),
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = async () => {
    if (!client || !connected || !publicKey) {
      setPositions([]);
      setSummary({
        equity: new BN(0),
        initialMargin: new BN(0),
        maintenanceMargin: new BN(0),
        freeCollateral: new BN(0),
        marginRatio: 0,
        totalUnrealizedPnl: new BN(0),
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch portfolio account
      const portfolio = await client.getPortfolio(publicKey);

      if (!portfolio) {
        // Portfolio doesn't exist - this is expected for new users
        setError(new Error('Portfolio not found'));
        return;
      }

      // TODO: Implement position fetching
      const positionsData: any[] = [];

      // Calculate portfolio metrics
      const equity = portfolio.equity;
      let totalUnrealizedPnl = new BN(0);
      let initialMargin = new BN(0);
      let maintenanceMargin = new BN(0);

      const positionsWithMetrics: Position[] = [];

      for (const pos of positionsData) {
        // Calculate position metrics
        const pnl = pos.unrealizedPnl || new BN(0);
        totalUnrealizedPnl = totalUnrealizedPnl.add(pnl);

        // Get margin requirements (these would come from slab config)
        const notional = pos.quantity.mul(pos.markPrice).div(new BN(1e6));
        const im = notional.mul(new BN(10)).div(new BN(100)); // 10% IM
        const mm = notional.mul(new BN(5)).div(new BN(100)); // 5% MM

        initialMargin = initialMargin.add(im);
        maintenanceMargin = maintenanceMargin.add(mm);

        positionsWithMetrics.push({
          slab: pos.slab,
          instrument: pos.instrument,
          instrumentSymbol: pos.symbol || 'UNKNOWN',
          quantity: pos.quantity,
          avgEntryPrice: pos.avgEntryPrice,
          markPrice: pos.markPrice,
          unrealizedPnl: pnl,
          leverage: pos.leverage || 1,
        });
      }

      const totalEquity = equity.add(totalUnrealizedPnl);
      const freeCollateral = totalEquity.sub(initialMargin);
      const marginRatio = initialMargin.isZero()
        ? 0
        : totalEquity.mul(new BN(10000)).div(initialMargin).toNumber() / 100;

      // Only update state if values have changed to prevent flickering
      setPositions((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(positionsWithMetrics)) return prev;
        return positionsWithMetrics;
      });

      setSummary((prev) => {
        const newSummary = {
          equity: totalEquity,
          initialMargin,
          maintenanceMargin,
          freeCollateral,
          marginRatio,
          totalUnrealizedPnl,
        };

        // Compare BN values
        if (
          prev.equity.eq(newSummary.equity) &&
          prev.initialMargin.eq(newSummary.initialMargin) &&
          prev.maintenanceMargin.eq(newSummary.maintenanceMargin) &&
          prev.freeCollateral.eq(newSummary.freeCollateral) &&
          prev.marginRatio === newSummary.marginRatio &&
          prev.totalUnrealizedPnl.eq(newSummary.totalUnrealizedPnl)
        ) {
          return prev; // No change, return previous to prevent re-render
        }

        return newSummary;
      });
    } catch (err) {
      console.error('Error fetching portfolio:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-refresh on mount and when client changes
  useEffect(() => {
    refresh();

    // Set up polling interval (every 5 seconds)
    const interval = setInterval(refresh, 5000);

    return () => clearInterval(interval);
  }, [client, connected, publicKey]);

  return {
    positions,
    summary,
    isLoading,
    error,
    refresh,
  };
}
