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

      // Fetch positions from portfolio exposures
      const positionsData: any[] = [];

      if (portfolio.exposures && portfolio.exposures.length > 0) {
        // Get registry to map indices to actual slab/instrument pubkeys
        const registry = await client.router?.getRegistry();

        if (registry) {
          for (const exposure of portfolio.exposures) {
            // Skip zero positions
            if (exposure.positionQty.isZero()) continue;

            // Get slab from registry
            const slabEntry = registry.slabs[exposure.slabIndex];
            if (!slabEntry || !slabEntry.active) continue;

            const slabId = slabEntry.slabId;

            // Fetch slab state to get instruments
            const slabState = await client.getSlabState(slabId);
            if (!slabState) continue;

            // Get instrument pubkey - for now assume single instrument at index 0
            const instrument = slabState.instrument;

            // Get config
            const config = await import('../config').then(m => m.getConfig());

            // Get mark price from oracle (localnet) or slab
            let markPrice = slabState.markPx;
            if (config.network === 'localnet' && slabEntry.oracleId) {
              try {
                const oracleAccountInfo = await client.connection.getAccountInfo(slabEntry.oracleId);
                if (oracleAccountInfo && oracleAccountInfo.data.length >= 128) {
                  const priceOffset = 80;
                  markPrice = new BN(oracleAccountInfo.data.readBigInt64LE(priceOffset).toString());
                }
              } catch (err) {
                // Fallback to slab mark price
              }
            }

            // Fetch PositionDetails PDA for entry price, margin, and leverage
            let entryPrice = new BN(0);
            let marginHeld = new BN(0);
            let storedLeverage = 1;
            try {
              const portfolioAddress = await client.router?.derivePortfolioAddress(publicKey);
              if (portfolioAddress && client.router) {
                const [positionDetailsPda] = client.router.derivePositionDetailsPDA(
                  portfolioAddress,
                  exposure.slabIndex,
                  exposure.instrumentIndex
                );

                const positionDetailsAccount = await client.connection.getAccountInfo(positionDetailsPda);
                if (positionDetailsAccount && positionDetailsAccount.data.length >= 136) {
                  const data = positionDetailsAccount.data;
                  const entryPriceOffset = 48;
                  const marginHeldOffset = 112;
                  const leverageOffset = 128;

                  entryPrice = new BN(data.readBigInt64LE(entryPriceOffset).toString());
                  marginHeld = new BN(data.readBigInt64LE(marginHeldOffset).toString());
                  storedLeverage = data.readUInt8(leverageOffset); // Read leverage from PDA
                }
              }
            } catch (err) {
              // Position details not found - likely a new position
            }

            // Calculate aggregate leverage: (quantity × 10_000) / margin_held
            // This gives the effective leverage across all trades
            const notionalLamports = exposure.positionQty.abs().mul(new BN(10_000));
            let leverage = storedLeverage; // fallback
            if (marginHeld.gt(new BN(0))) {
              leverage = notionalLamports.mul(new BN(100)).div(marginHeld).toNumber() / 100;
              console.log('[DEBUG] Leverage calc:', {
                quantity: exposure.positionQty.toString(),
                notional: notionalLamports.toString(),
                marginHeld: marginHeld.toString(),
                storedLeverage,
                calculatedLeverage: leverage
              });
            }

            // Calculate unrealized PnL (including leverage multiplier)
            // PnL = price_diff × quantity × leverage
            let unrealizedPnl = new BN(0);
            if (!markPrice.isZero() && !entryPrice.isZero()) {
              const priceDiff = markPrice.sub(entryPrice);
              unrealizedPnl = exposure.positionQty.mul(priceDiff).mul(new BN(leverage)).div(new BN(1_000_000));
            }

            // Get instrument metadata
            const metadata = await import('../instruments/config').then(m =>
              m.getInstrumentMetadata(instrument, config.network)
            );

            positionsData.push({
              slab: slabId,
              instrument,
              symbol: metadata.symbol,
              quantity: exposure.positionQty,
              avgEntryPrice: entryPrice,
              markPrice,
              unrealizedPnl,
              leverage,
            });
          }
        }
      }

      // Calculate portfolio metrics
      const equity = portfolio.equity;
      let totalUnrealizedPnl = new BN(0);
      let initialMargin = new BN(0);
      let maintenanceMargin = new BN(0);

      const positionsWithMetrics: Position[] = [];

      for (const pos of positionsData) {
        // Calculate positions metrics
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

      const freeCollateral = equity.sub(initialMargin);
      const marginRatio = initialMargin.isZero()
        ? 0
        : equity.mul(new BN(10000)).div(initialMargin).toNumber() / 100;

      // Only update state if values have changed to prevent flickering
      setPositions((prev) => {
        // Check if positions are the same (compare only core position fields, not derived values like mark price or PnL)
        if (prev.length !== positionsWithMetrics.length) return positionsWithMetrics;

        const same = prev.every((p, i) => {
          const n = positionsWithMetrics[i];
          return (
            p.slab.equals(n.slab) &&
            p.instrument.equals(n.instrument) &&
            p.instrumentSymbol === n.instrumentSymbol &&
            p.quantity.eq(n.quantity) &&
            p.avgEntryPrice.eq(n.avgEntryPrice) &&
            p.leverage === n.leverage
            // Don't compare markPrice or unrealizedPnl - they change frequently from price updates
          );
        });

        // If core position hasn't changed, update only the derived fields without triggering re-render
        if (same) {
          // Mutate the previous positions array in place to update mark price and PnL
          prev.forEach((p, i) => {
            p.markPrice = positionsWithMetrics[i].markPrice;
            p.unrealizedPnl = positionsWithMetrics[i].unrealizedPnl;
          });
          return prev;
        }

        return positionsWithMetrics;
      });

      setSummary((prev) => {
        const newSummary = {
          equity, // Raw portfolio equity balance (no unrealized PnL added)
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
