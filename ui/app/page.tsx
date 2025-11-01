'use client';

import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { useWallet } from '@/lib/wallet/WalletProvider';
import { usePortfolio } from '@/lib/hooks/usePortfolio';
import { useTrade } from '@/lib/hooks/useTrade';
import { useMarkets } from '@/lib/hooks/useMarkets';
import { useBarista } from '@/lib/hooks/useBarista';
import { useTradeHistory } from '@/lib/hooks/useTradeHistory';
import { MarketSelector } from '@/components/trading/MarketSelector';
import { LightweightChart } from '@/components/trading/LightweightChart';
import { getTradingViewSymbol } from '@/lib/instruments/config';
import { getConfig } from '@/lib/config';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export default function TradePage() {
  const { connected, publicKey } = useWallet();
  const { client } = useBarista();
  const { positions, summary, isLoading, error: portfolioError, refresh: refreshPortfolio } = usePortfolio();
  const { executeTrade, isExecuting } = useTrade();
  const { markets } = useMarkets();
  const { trades, addTrade, totalRealizedPnl } = useTradeHistory();

  const [selectedSlab, setSelectedSlab] = useState<PublicKey | null>(null);
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [leverage, setLeverage] = useState('1');
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const [closingPosition, setClosingPosition] = useState<number | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [positionToClose, setPositionToClose] = useState<number | null>(null);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [binancePrice, setBinancePrice] = useState<number | null>(null);

  // Get selected market data
  const selectedMarket = markets.find((m) => m.slab.equals(selectedSlab || new PublicKey('11111111111111111111111111111111')));

  // Use Binance price if available, otherwise fall back to market mark price
  const currentPrice = binancePrice ?? selectedMarket?.markPrice ?? 0;

  const prevPriceRef = useRef<number | null>(null);

  // Memoize chart symbol using only the instrument pubkey string
  const instrumentKey = selectedMarket?.instrument.toBase58() || '';
  const chartSymbol = useMemo(() => {
    if (!instrumentKey) return '';
    return getTradingViewSymbol(new PublicKey(instrumentKey), getConfig().network);
  }, [instrumentKey]);

  // Reset Binance price when market changes
  useEffect(() => {
    setBinancePrice(null);
  }, [selectedSlab]);

  // Detect price changes and trigger flash animation
  useEffect(() => {
    if (currentPrice && prevPriceRef.current !== null) {
      if (currentPrice > prevPriceRef.current) {
        setPriceFlash('up');
        setTimeout(() => setPriceFlash(null), 500);
      } else if (currentPrice < prevPriceRef.current) {
        setPriceFlash('down');
        setTimeout(() => setPriceFlash(null), 500);
      }
    }
    if (currentPrice) {
      prevPriceRef.current = currentPrice;
    }
  }, [currentPrice]);

  const handleTrade = async () => {
    if (!selectedSlab) {
      setErrorMessage('Please select a market');
      setErrorDialogOpen(true);
      return;
    }

    if (!client || !publicKey) {
      setErrorMessage('Please connect your wallet');
      setErrorDialogOpen(true);
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
        setErrorMessage(`Failed to initialize trading account: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setErrorDialogOpen(true);
        return;
      }
    }

    const quantityBN = new BN(parseFloat(quantity) * 1e6); // Convert to 6 decimals
    const priceBN = price ? new BN(parseFloat(price) * 1e6) : undefined;
    const leverageNum = parseFloat(leverage);

    // Get selected market to access oracle
    const selectedMarket = markets.find(m => m.slab.equals(selectedSlab));

    const result = await executeTrade({
      slab: selectedSlab,
      side,
      orderType,
      quantity: quantityBN,
      price: priceBN,
      leverage: leverageNum,
      oracle: selectedMarket?.oracle, // Pass oracle from market data
    });

    if (result.success) {
      // Record trade in history
      addTrade({
        timestamp: Date.now(),
        signature: result.signature,
        side,
        market: selectedMarket?.symbol || 'Unknown',
        quantity: parseFloat(quantity),
        price: currentPrice,
        leverage: leverageNum,
      });

      // Clear form inputs
      setQuantity('');
      setPrice('');

      // Show success toast
      const leverageText = leverageNum > 1 ? ` ${leverageNum}x` : '';
      toast.success(`${side === 'buy' ? 'Buy' : 'Sell'} order executed`, {
        description: `${side === 'buy' ? 'Opened long' : 'Opened short'} ${(parseFloat(quantity)).toFixed(2)} @ $${currentPrice.toFixed(2)}${leverageText}`,
      });

      // Refresh portfolio to show updated positions
      await refreshPortfolio();
    }
  };

  const handleClosePosition = async (positionIndex: number) => {
    setPositionToClose(positionIndex);
    setCloseDialogOpen(true);
  };

  const confirmClosePosition = async () => {
    if (positionToClose === null) return;

    const pos = positions[positionToClose];
    if (!pos) return;

    setCloseDialogOpen(false);
    setClosingPosition(positionToClose);

    try {
      // Find the market/oracle for this position
      const market = markets.find(m => m.slab.equals(pos.slab));
      if (!market) {
        setErrorMessage('Market not found for this position');
        setErrorDialogOpen(true);
        return;
      }

      // Execute opposite trade to close position
      // If quantity is positive (long), sell to close. If negative (short), buy to close.
      const closeSide = pos.quantity.isNeg() ? 'buy' : 'sell';
      const closeQuantity = pos.quantity.abs();

      console.log('[ClosePosition] Closing with params:', {
        slab: pos.slab.toBase58(),
        side: closeSide,
        orderType: 'market',
        quantity: closeQuantity.toString(),
        leverage: 1,
        oracle: market.oracle?.toBase58(),
      });

      const result = await executeTrade({
        slab: pos.slab,
        side: closeSide,
        orderType: 'market',
        quantity: closeQuantity,
        leverage: 1, // Use 1x leverage like manual trades
        oracle: market.oracle,
      });

      if (result.success) {
        // Calculate PnL with Binance price if available
        const isSelectedSlab = selectedSlab && pos.slab.equals(selectedSlab);
        const pnl = isSelectedSlab && binancePrice
          ? ((binancePrice - (pos.avgEntryPrice.toNumber() / 1e6)) * (pos.quantity.toNumber() / 1e6))
          : (pos.unrealizedPnl.toNumber() / 1e6);

        // Record closing trade in history with PnL
        addTrade({
          timestamp: Date.now(),
          signature: result.signature,
          side: closeSide,
          market: pos.instrumentSymbol,
          quantity: closeQuantity.toNumber() / 1e6,
          price: isSelectedSlab && binancePrice ? binancePrice : (pos.markPrice.toNumber() / 1e6),
          leverage: 1,
          pnl,
        });

        toast.success('Position closed', {
          description: `Closed ${pos.instrumentSymbol} position · PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
        });

        // Refresh portfolio to show position closed
        await refreshPortfolio();
      }
    } finally {
      setClosingPosition(null);
      setPositionToClose(null);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <Header />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar - Market Info & Portfolio Stats */}
        <div className="border-b border-border bg-card/40 backdrop-blur-xl">
          <div className="px-3 py-2">
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
                    ${currentPrice.toFixed(2)}
                  </span>
                )}
              </div>

              {/* Portfolio Quick Stats */}
              {connected && !isLoading && (
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-xs text-white/50 font-medium uppercase tracking-wider">Portfolio Unrealized PnL</div>
                    <div className={`text-sm font-semibold ${summary.totalUnrealizedPnl.isNeg() ? 'text-red-400' : 'text-emerald-400'}`}>
                      ${(summary.totalUnrealizedPnl.toNumber() / 1e6).toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-white/50 font-medium uppercase tracking-wider">Realized PnL</div>
                    <div className={`text-sm font-semibold ${totalRealizedPnl < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      ${totalRealizedPnl.toFixed(2)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 flex w-full overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Chart */}
            <div className="border-b border-border bg-card p-3">
              {selectedMarket && chartSymbol ? (
                <LightweightChart
                  symbol={chartSymbol}
                  interval="15"
                  height={500}
                  updateIntervalSeconds={10}
                  onPriceUpdate={setBinancePrice}
                  positions={positions
                    .filter(pos => selectedSlab && pos.slab.equals(selectedSlab))
                    .map(pos => ({
                      entryPrice: pos.avgEntryPrice.toNumber() / 1e6,
                      quantity: pos.quantity.toNumber() / 1e6,
                    }))
                  }
                />
              ) : (
                <div className="h-[500px] flex items-center justify-center text-white/50 text-sm">
                  Select a market to view chart
                </div>
              )}
            </div>

            {/* Positions & History */}
            <div className="flex-1 bg-card border-t border-border overflow-hidden">
              <Tabs defaultValue="positions" className="flex flex-col h-full">
                <div className="px-3 py-2 border-b border-border/50 bg-card/50">
                  <TabsList className="grid w-64 grid-cols-2 bg-transparent p-0 h-7">
                    <TabsTrigger value="positions" className="text-xs data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                      Positions
                    </TabsTrigger>
                    <TabsTrigger
                      value="history"
                      className="text-xs data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                    >
                      History
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="positions" className="flex-1 m-0 px-3 py-2 overflow-y-auto">
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
                      <div className="grid grid-cols-7 gap-2 text-xs text-white/50 font-medium pb-2 border-b border-border/30 uppercase tracking-wider">
                        <div>Market</div>
                        <div className="text-right">Size</div>
                        <div className="text-right">Entry</div>
                        <div className="text-right">Mark</div>
                        <div className="text-right">PnL</div>
                        <div className="text-right">Lev</div>
                        <div className="text-right">Close</div>
                      </div>
                      {positions.map((pos, i) => {
                        // Use Binance price for positions matching the selected slab, otherwise use oracle price
                        const isSelectedSlab = selectedSlab && pos.slab.equals(selectedSlab);
                        const displayMarkPrice = isSelectedSlab && binancePrice
                          ? binancePrice
                          : (pos.markPrice.toNumber() / 1e6);

                        // Recalculate PnL with Binance price if applicable
                        const displayPnl = isSelectedSlab && binancePrice
                          ? ((binancePrice - (pos.avgEntryPrice.toNumber() / 1e6)) * (pos.quantity.toNumber() / 1e6))
                          : (pos.unrealizedPnl.toNumber() / 1e6);

                        // Calculate notional size (quantity × mark price)
                        const notionalSize = Math.abs((pos.quantity.toNumber() / 1e6) * displayMarkPrice);

                        return (
                          <div key={i} className="grid grid-cols-7 gap-2 text-sm py-2 border-b border-border/10 hover:bg-secondary/10 transition-colors">
                            <div className="font-medium text-white">{pos.instrumentSymbol}</div>
                            <div className={`text-right font-mono ${pos.quantity.isNeg() ? 'text-red-400' : 'text-emerald-400'}`}>
                              ${notionalSize.toFixed(2)}
                            </div>
                            <div className="text-right text-white font-mono">${(pos.avgEntryPrice.toNumber() / 1e6).toFixed(2)}</div>
                            <div className="text-right text-white font-mono">${displayMarkPrice.toFixed(2)}</div>
                            <div className={`text-right font-mono ${displayPnl < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                              ${displayPnl.toFixed(2)}
                            </div>
                            <div className="text-right text-white">{pos.leverage.toFixed(1)}x</div>
                            <div className="text-right">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleClosePosition(i)}
                                disabled={closingPosition === i || isExecuting}
                                className="h-7 text-xs px-2"
                              >
                                {closingPosition === i ? 'Closing...' : 'Close'}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="history" className="flex-1 m-0 px-3 py-2 overflow-y-auto">
                  {trades.length === 0 ? (
                    <div className="text-center py-6 text-white/50 text-sm">
                      No trade history yet
                    </div>
                  ) : (
                    <div>
                      <div className="grid grid-cols-6 gap-2 text-xs text-white/50 font-medium pb-2 border-b border-border/30 uppercase tracking-wider">
                        <div>Time</div>
                        <div>Market</div>
                        <div>Side</div>
                        <div className="text-right">Qty</div>
                        <div className="text-right">Price</div>
                        <div className="text-right">PnL</div>
                      </div>
                      <div className="space-y-0">
                        {trades.slice().reverse().map((trade, i) => {
                          const date = new Date(trade.timestamp);
                          const timeStr = date.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                          });

                          return (
                            <div key={i} className="grid grid-cols-6 gap-2 text-sm py-2 border-b border-border/10 hover:bg-secondary/10 transition-colors">
                              <div className="text-white/70 text-xs">{timeStr}</div>
                              <div className="text-white font-medium">{trade.market}</div>
                              <div className={trade.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                                {trade.side.toUpperCase()}
                              </div>
                              <div className="text-right text-white font-mono">{trade.quantity.toFixed(2)}</div>
                              <div className="text-right text-white font-mono">${trade.price.toFixed(2)}</div>
                              <div className={`text-right font-mono ${
                                trade.pnl === undefined
                                  ? 'text-white/50'
                                  : trade.pnl < 0
                                    ? 'text-red-400'
                                    : 'text-emerald-400'
                              }`}>
                                {trade.pnl !== undefined ? `$${trade.pnl.toFixed(2)}` : '-'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
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

              {/* Limit Order Note */}
              {orderType === 'limit' && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded px-2 py-1.5">
                  <p className="text-[10px] text-yellow-500/90 leading-tight">
                    Localnet Note: Limit orders execute immediately at your specified price (atomic fill)
                  </p>
                </div>
              )}

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
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-xs text-white/50 font-medium uppercase tracking-wider">Leverage</Label>
                  <span className="text-sm text-white font-semibold">{leverage}x</span>
                </div>
                <Slider
                  min={1}
                  max={10}
                  step={0.1}
                  value={[parseFloat(leverage)]}
                  onValueChange={(values) => setLeverage(values[0].toString())}
                  className="w-full"
                />
              </div>

              {/* Order Summary - always visible */}
              <div className="space-y-2 pt-2 border-t border-border/30">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/50">Entry Price</span>
                  <span className="text-xs text-white font-mono">
                    {selectedMarket ? (
                      `$${orderType === 'limit' && price ? parseFloat(price).toFixed(2) : currentPrice.toFixed(2)}`
                    ) : '-'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/50">Liquidation Price</span>
                  <span className="text-xs text-white font-mono">
                    {selectedMarket && quantity && parseFloat(quantity) > 0 ? (
                      `$${(() => {
                        const entryPrice = orderType === 'limit' && price ? parseFloat(price) : currentPrice;
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
                        const entryPrice = orderType === 'limit' && price ? parseFloat(price) : currentPrice;
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

      {/* Close Position Confirmation Dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-white">Close Position</DialogTitle>
          </DialogHeader>
          {positionToClose !== null && positions[positionToClose] && (() => {
            const pos = positions[positionToClose];
            // Use Binance price if this is the selected slab
            const isSelectedSlab = selectedSlab && pos.slab.equals(selectedSlab);
            const displayMarkPrice = isSelectedSlab && binancePrice
              ? binancePrice
              : (pos.markPrice.toNumber() / 1e6);
            const displayPnl = isSelectedSlab && binancePrice
              ? ((binancePrice - (pos.avgEntryPrice.toNumber() / 1e6)) * (pos.quantity.toNumber() / 1e6))
              : (pos.unrealizedPnl.toNumber() / 1e6);

            // Calculate notional size for dialog
            const notionalSize = Math.abs((pos.quantity.toNumber() / 1e6) * displayMarkPrice);

            return (
              <div className="space-y-3">
                <p className="text-sm text-white/70">
                  Are you sure you want to close this {pos.instrumentSymbol} position?
                </p>
                <div className="space-y-1 text-xs font-mono bg-secondary/20 p-3 rounded">
                  <div className="flex justify-between">
                    <span className="text-white/50">Size:</span>
                    <span className={pos.quantity.isNeg() ? 'text-red-400' : 'text-emerald-400'}>
                      ${notionalSize.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Entry:</span>
                    <span className="text-white">${(pos.avgEntryPrice.toNumber() / 1e6).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Mark:</span>
                    <span className="text-white">${displayMarkPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">PnL:</span>
                    <span className={displayPnl < 0 ? 'text-red-400' : 'text-emerald-400'}>
                      ${displayPnl.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCloseDialogOpen(false)}
              className="bg-secondary border-border text-white hover:bg-secondary/80"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmClosePosition}
              disabled={closingPosition !== null}
              className="bg-red-500 hover:bg-red-600"
            >
              {closingPosition !== null ? 'Closing...' : 'Close Position'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-white">Error</DialogTitle>
            <DialogDescription className="text-white/70">
              {errorMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setErrorDialogOpen(false)}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
