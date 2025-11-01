'use client';

import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useWallet } from '@/lib/wallet/WalletProvider';
import { usePortfolio } from '@/lib/hooks/usePortfolio';
import { useTrade } from '@/lib/hooks/useTrade';
import { useMarkets } from '@/lib/hooks/useMarkets';
import { useBarista } from '@/lib/hooks/useBarista';
import { formatAmount, formatSol } from '@/lib/utils';
import { MarketSelector } from '@/components/trading/MarketSelector';
import { LightweightChart } from '@/components/trading/LightweightChart';
import { getTradingViewSymbol } from '@/lib/instruments/config';
import { getConfig } from '@/lib/config';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export default function TradePage() {
  const { connected, publicKey } = useWallet();
  const { client } = useBarista();
  const { positions, summary, isLoading, error: portfolioError } = usePortfolio();
  const { executeTrade, isExecuting } = useTrade();
  const { markets } = useMarkets();

  const [selectedSlab, setSelectedSlab] = useState<PublicKey | null>(null);
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [leverage, setLeverage] = useState('1');
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);

  // Get selected market data
  const selectedMarket = markets.find((m) => m.slab.equals(selectedSlab || new PublicKey('11111111111111111111111111111111')));

  const prevPriceRef = useRef<number | null>(null);

  // Memoize chart symbol using only the instrument pubkey string
  const instrumentKey = selectedMarket?.instrument.toBase58() || '';
  const chartSymbol = useMemo(() => {
    if (!instrumentKey) return '';
    return getTradingViewSymbol(new PublicKey(instrumentKey), getConfig().network);
  }, [instrumentKey]);

  // Detect price changes and trigger flash animation
  useEffect(() => {
    if (selectedMarket && prevPriceRef.current !== null) {
      if (selectedMarket.markPrice > prevPriceRef.current) {
        setPriceFlash('up');
        setTimeout(() => setPriceFlash(null), 500);
      } else if (selectedMarket.markPrice < prevPriceRef.current) {
        setPriceFlash('down');
        setTimeout(() => setPriceFlash(null), 500);
      }
    }
    if (selectedMarket) {
      prevPriceRef.current = selectedMarket.markPrice;
    }
  }, [selectedMarket?.markPrice]);

  const handleTrade = async () => {
    if (!selectedSlab) {
      alert('Please select a market');
      return;
    }

    if (!client || !publicKey) {
      alert('Please connect your wallet');
      return;
    }

    // Auto-initialize portfolio if it doesn't exist
    if (portfolioError && portfolioError.message.includes('Portfolio not found')) {
      try {
        console.log('[Trade] Portfolio not found, auto-depositing 10 SOL...');
        const depositAmount = new BN(10 * 1e9); // 10 SOL
        await client.deposit(depositAmount);
        console.log('[Trade] Portfolio initialized with 10 SOL');
        // Wait a moment for portfolio to be created
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('[Trade] Failed to initialize portfolio:', error);
        alert(`Failed to initialize trading account: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
      }
    }

    const quantityBN = new BN(parseFloat(quantity) * 1e6); // Convert to 6 decimals
    const priceBN = price ? new BN(parseFloat(price) * 1e6) : undefined;
    const leverageNum = parseFloat(leverage);

    const result = await executeTrade({
      slab: selectedSlab,
      side,
      orderType,
      quantity: quantityBN,
      price: priceBN,
      leverage: leverageNum,
    });

    if (result.success) {
      alert(`Trade executed! Signature: ${result.signature}`);
      setQuantity('');
      setPrice('');
    } else {
      alert(`Trade failed: ${result.error}`);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1 flex flex-col">
        {/* Top Bar - Market Info & Portfolio Stats */}
        <div className="border-b border-border bg-card/40 backdrop-blur-xl">
          <div className="max-w-screen-2xl mx-auto px-3 py-2">
            <div className="flex items-center justify-between">
              {/* Market Selector & Price */}
              <div className="flex items-center gap-3">
                <div className="w-44">
                  <MarketSelector value={selectedSlab} onChange={setSelectedSlab} />
                </div>
                {selectedMarket && (
                  <span
                    className={`text-xl font-semibold font-mono tabular-nums min-w-[120px] transition-colors duration-500 ${
                      priceFlash === 'up'
                        ? 'text-emerald-400'
                        : priceFlash === 'down'
                        ? 'text-red-400'
                        : 'text-white'
                    }`}
                  >
                    ${selectedMarket.markPrice.toFixed(2)}
                  </span>
                )}
              </div>

              {/* Portfolio Quick Stats */}
              {connected && !isLoading && (
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-white/50 font-medium uppercase tracking-wider">Portfolio PnL</div>
                    <div className={`text-sm font-semibold ${summary.totalUnrealizedPnl.isNeg() ? 'text-red-400' : 'text-emerald-400'}`}>
                      {Number(formatSol(summary.totalUnrealizedPnl)).toFixed(3)} SOL
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 flex max-w-screen-2xl mx-auto w-full">
          <div className="flex-1 flex flex-col min-w-0">
            {/* Chart */}
            <div className="border-b border-border bg-card p-3">
              {selectedMarket && chartSymbol ? (
                <LightweightChart
                  symbol={chartSymbol}
                  interval="15"
                  height={500}
                  updateIntervalSeconds={10}
                />
              ) : (
                <div className="h-[500px] flex items-center justify-center text-white/50 text-sm">
                  Select a market to view chart
                </div>
              )}
            </div>

            {/* Positions */}
            <div className="flex-1 bg-card border-t border-border overflow-auto">
              <div className="px-3 py-2 border-b border-border/50 bg-card/50">
                <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Positions</h3>
              </div>
              <div className="px-3 py-2">
                {!connected ? (
                  <div className="text-center py-6 text-white/50 text-sm">
                    Connect wallet to view positions
                  </div>
                ) : isLoading ? (
                  <div className="text-center py-6 text-white/50 text-sm">
                    Loading positions...
                  </div>
                ) : positions.length === 0 ? (
                  <div className="text-center py-6 text-white/50 text-sm">
                    No open positions
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-6 gap-2 text-xs text-white/50 font-medium pb-2 border-b border-border/30 uppercase tracking-wider">
                      <div>Market</div>
                      <div className="text-right">Size</div>
                      <div className="text-right">Entry</div>
                      <div className="text-right">Mark</div>
                      <div className="text-right">PnL</div>
                      <div className="text-right">Lev</div>
                    </div>
                    {positions.map((pos, i) => (
                      <div key={i} className="grid grid-cols-6 gap-2 text-sm py-2 border-b border-border/10 hover:bg-secondary/10 transition-colors">
                        <div className="font-medium text-white">{pos.instrumentSymbol}</div>
                        <div className={`text-right font-mono ${pos.quantity.isNeg() ? 'text-red-400' : 'text-emerald-400'}`}>
                          {formatAmount(pos.quantity, 6)}
                        </div>
                        <div className="text-right text-white font-mono">{formatAmount(pos.avgEntryPrice, 6)}</div>
                        <div className="text-right text-white font-mono">{formatAmount(pos.markPrice, 6)}</div>
                        <div className={`text-right font-mono ${pos.unrealizedPnl.isNeg() ? 'text-red-400' : 'text-emerald-400'}`}>
                          {formatSol(pos.unrealizedPnl)}
                        </div>
                        <div className="text-right text-white">{pos.leverage.toFixed(1)}x</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Trade Form */}
          <div className="w-[280px] border-l border-border bg-card flex flex-col">
            <div className="px-3 py-2 border-b border-border/50 bg-card/50">
              <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Trade</h3>
            </div>
            <div className="p-3 space-y-3 flex-1">
              {/* Buy/Sell Tabs */}
              <Tabs value={side} onValueChange={(v) => setSide(v as 'buy' | 'sell')}>
                <TabsList className="grid w-full grid-cols-2 bg-secondary p-0.5 rounded h-8">
                  <TabsTrigger
                    value="buy"
                    className="data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-400 rounded-sm text-xs"
                  >
                    Buy
                  </TabsTrigger>
                  <TabsTrigger
                    value="sell"
                    className="data-[state=active]:bg-red-500/15 data-[state=active]:text-red-400 rounded-sm text-xs"
                  >
                    Sell
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Market/Limit Tabs */}
              <Tabs value={orderType} onValueChange={(v) => setOrderType(v as 'market' | 'limit')}>
                <TabsList className="grid w-full grid-cols-2 bg-secondary p-0.5 rounded h-8">
                  <TabsTrigger value="market" className="rounded-sm text-xs">Market</TabsTrigger>
                  <TabsTrigger value="limit" className="rounded-sm text-xs">Limit</TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Quantity */}
              <div className="space-y-1.5">
                <Label htmlFor="quantity" className="text-xs text-white/50 font-medium uppercase tracking-wider">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="bg-input border-border text-white h-9 rounded font-mono text-sm"
                />
              </div>

              {/* Price (Limit Only) */}
              {orderType === 'limit' && (
                <div className="space-y-1.5">
                  <Label htmlFor="price" className="text-xs text-white/50 font-medium uppercase tracking-wider">Price</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="bg-input border-border text-white h-9 rounded font-mono text-sm"
                  />
                </div>
              )}

              {/* Leverage */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label htmlFor="leverage" className="text-xs text-white/50 font-medium uppercase tracking-wider">Leverage</Label>
                  <span className="text-sm text-white font-semibold">{leverage}x</span>
                </div>
                <Input
                  id="leverage"
                  type="number"
                  step="0.1"
                  min="1"
                  max="10"
                  value={leverage}
                  onChange={(e) => setLeverage(e.target.value)}
                  className="bg-input border-border text-foreground h-8 rounded font-mono text-xs"
                />
              </div>

              {/* Order Summary - always visible */}
              <div className="space-y-2 pt-2 border-t border-border/30">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/50">Entry Price</span>
                  <span className="text-xs text-white font-mono">
                    {selectedMarket ? (
                      `$${orderType === 'limit' && price ? parseFloat(price).toFixed(2) : selectedMarket.markPrice.toFixed(2)}`
                    ) : '-'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/50">Liquidation Price</span>
                  <span className="text-xs text-white font-mono">
                    {selectedMarket && quantity && parseFloat(quantity) > 0 ? (
                      `$${(() => {
                        const entryPrice = orderType === 'limit' && price ? parseFloat(price) : selectedMarket.markPrice;
                        const lev = parseFloat(leverage) || 1;
                        const liquidationDistance = entryPrice / lev;
                        const liqPrice = side === 'buy'
                          ? entryPrice - liquidationDistance
                          : entryPrice + liquidationDistance;
                        return liqPrice.toFixed(2);
                      })()}`
                    ) : '-'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/50">Slippage</span>
                  <span className="text-xs text-white font-mono">
                    {quantity && parseFloat(quantity) > 0 ? (orderType === 'market' ? '±0.5%' : '0.0%') : '-'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/50">Total Fees</span>
                  <span className="text-xs text-white font-mono">
                    {selectedMarket && quantity && parseFloat(quantity) > 0 ? (
                      `$${(() => {
                        const qty = parseFloat(quantity) || 0;
                        const entryPrice = orderType === 'limit' && price ? parseFloat(price) : selectedMarket.markPrice;
                        const notionalValue = qty * entryPrice;
                        const feeRate = 0.001; // 0.1% taker fee
                        const fee = notionalValue * feeRate;
                        return fee.toFixed(4);
                      })()}`
                    ) : '-'}
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                className={`w-full h-9 text-xs font-semibold rounded transition-all mt-auto ${
                  side === 'buy'
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-500/20'
                    : 'bg-red-500 hover:bg-red-600 text-white shadow-sm shadow-red-500/20'
                }`}
                disabled={!connected || !selectedSlab || isExecuting}
                onClick={handleTrade}
              >
                {!connected
                  ? 'Connect Wallet'
                  : !selectedSlab
                  ? 'Select Market'
                  : isExecuting
                  ? 'Executing...'
                  : `${side === 'buy' ? 'Buy' : 'Sell'} ${quantity || '0'}`}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
