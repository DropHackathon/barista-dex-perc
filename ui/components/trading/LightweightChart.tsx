'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  Time,
  ColorType,
  LineStyle,
} from 'lightweight-charts';
import { fetchBinanceCandles, extractBinanceSymbol, mapIntervalToBinance } from '@/lib/chart/priceData';
import { Button } from '@/components/ui/button';

interface Position {
  entryPrice: number;
  quantity: number;
}

interface LightweightChartProps {
  symbol: string; // TradingView format: "BINANCE:SOLUSDT"
  interval?: '1' | '5' | '15' | '30' | '60' | '240' | 'D' | 'W';
  height?: number;
  updateIntervalSeconds?: number; // Real-time update interval (0 = disabled)
  onPriceUpdate?: (price: number) => void; // Callback when price updates from Binance
  positions?: Position[]; // Positions to mark on chart
}

type ChartType = 'candlestick' | 'line' | 'area';

export function LightweightChart({
  symbol,
  interval: initialInterval = '15',
  height = 500,
  updateIntervalSeconds = 10,
  onPriceUpdate,
  positions = [],
}: LightweightChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any[]>([]);
  const loadingRef = useRef(false);
  const dataLoadedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState(initialInterval);
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [showVolume, setShowVolume] = useState(true);
  const [showMA, setShowMA] = useState(false);

  // Refs to hold current values without triggering re-renders
  const intervalRef = useRef(interval);
  const chartTypeRef = useRef(chartType);
  const showVolumeRef = useRef(showVolume);
  const symbolRef = useRef(symbol);
  const updateIntervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const onPriceUpdateRef = useRef(onPriceUpdate);

  // Update refs when state changes
  useEffect(() => { intervalRef.current = interval; }, [interval]);
  useEffect(() => { chartTypeRef.current = chartType; }, [chartType]);
  useEffect(() => { showVolumeRef.current = showVolume; }, [showVolume]);
  useEffect(() => { symbolRef.current = symbol; }, [symbol]);
  useEffect(() => { onPriceUpdateRef.current = onPriceUpdate; }, [onPriceUpdate]);

  // Create chart once on mount
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height - 40,
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a1a' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2a2a2a' },
        horzLines: { color: '#2a2a2a' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#2a2a2a',
      },
      rightPriceScale: {
        borderColor: '#2a2a2a',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      handleScale: {
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      kineticScroll: {
        mouse: true,
        touch: true,
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#758696',
          width: 1,
          style: 3,
          labelBackgroundColor: '#4c525e',
        },
        horzLine: {
          color: '#758696',
          width: 1,
          style: 3,
          labelBackgroundColor: '#4c525e',
        },
      },
    });

    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [height]);

  // Load data when settings change
  useEffect(() => {
    if (!chartRef.current || !symbol) return;

    let cancelled = false;

    const loadData = async () => {
      if (loadingRef.current) return;

      loadingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const binanceSymbol = extractBinanceSymbol(symbol);
        const binanceInterval = mapIntervalToBinance(interval);
        const candles = await fetchBinanceCandles(binanceSymbol, binanceInterval, 500);

        if (cancelled) {
          loadingRef.current = false;
          return;
        }

        if (candles.length === 0) {
          setError('No data available');
          setIsLoading(false);
          loadingRef.current = false;
          return;
        }

        const chart = chartRef.current;
        if (!chart || cancelled) {
          loadingRef.current = false;
          return;
        }

        // Remove ALL old series
        seriesRef.current.forEach(series => {
          chart.removeSeries(series);
        });
        seriesRef.current = [];

        // Add appropriate series based on chart type
        let mainSeries: any;

        if (chartType === 'candlestick') {
          mainSeries = chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
          });

          const chartData: CandlestickData[] = candles.map(c => ({
            time: c.time as Time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }));

          mainSeries.setData(chartData);
        } else if (chartType === 'line') {
          mainSeries = chart.addLineSeries({
            color: '#2962FF',
            lineWidth: 2,
          });

          const lineData = candles.map(c => ({
            time: c.time as Time,
            value: c.close,
          }));

          mainSeries.setData(lineData);
        } else if (chartType === 'area') {
          mainSeries = chart.addAreaSeries({
            topColor: 'rgba(41, 98, 255, 0.4)',
            bottomColor: 'rgba(41, 98, 255, 0.0)',
            lineColor: '#2962FF',
            lineWidth: 2,
          });

          const areaData = candles.map(c => ({
            time: c.time as Time,
            value: c.close,
          }));

          mainSeries.setData(areaData);
        }

        seriesRef.current.push(mainSeries);

        // Add volume histogram if enabled
        if (showVolume && candles[0]?.volume) {
          const volumeSeries = chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: {
              type: 'volume',
            },
            priceScaleId: '',
          });

          volumeSeries.priceScale().applyOptions({
            scaleMargins: {
              top: 0.8,
              bottom: 0,
            },
          });

          const volumeData = candles.map(c => ({
            time: c.time as Time,
            value: c.volume || 0,
            color: c.close >= c.open ? '#26a69a80' : '#ef535080',
          }));

          volumeSeries.setData(volumeData);
          seriesRef.current.push(volumeSeries);
        }

        // Add moving average if enabled
        if (showMA && chartType !== 'area') {
          const maPeriod = 20;
          const maData: { time: Time; value: number }[] = [];

          // Calculate simple moving average inline
          for (let i = maPeriod - 1; i < candles.length; i++) {
            let sum = 0;
            for (let j = 0; j < maPeriod; j++) {
              sum += candles[i - j].close;
            }
            maData.push({
              time: candles[i].time as Time,
              value: sum / maPeriod,
            });
          }

          const maSeries = chart.addLineSeries({
            color: '#f0b90b',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          });

          maSeries.setData(maData);
          seriesRef.current.push(maSeries);
        }

        // Fit content to view
        chart.timeScale().fitContent();

        // Add price lines for positions
        positions.forEach((position) => {
          if (mainSeries && position.entryPrice) {
            mainSeries.createPriceLine({
              price: position.entryPrice,
              color: position.quantity > 0 ? '#26a69a' : '#ef5350', // Green for long, red for short
              lineWidth: 2,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: position.quantity > 0 ? 'Long Entry' : 'Short Entry',
            });
          }
        });

        // Call onPriceUpdate with the latest close price
        if (onPriceUpdateRef.current && candles.length > 0) {
          const latestPrice = candles[candles.length - 1].close;
          onPriceUpdateRef.current(latestPrice);
        }

        setIsLoading(false);
        dataLoadedRef.current = true;
        loadingRef.current = false;
      } catch (err) {
        if (cancelled) {
          loadingRef.current = false;
          return;
        }
        console.error('[Chart] Error loading chart data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load chart data');
        setIsLoading(false);
        loadingRef.current = false;
      }
    };

    loadData();

    return () => {
      cancelled = true;
      loadingRef.current = false;
    };
  }, [symbol, interval, chartType, showVolume, showMA]);

  // Real-time updates - polls Binance every N seconds to update the latest candle
  useEffect(() => {
    if (updateIntervalSeconds === 0) return;

    // Clear any existing interval
    if (updateIntervalIdRef.current) {
      window.clearInterval(updateIntervalIdRef.current);
      updateIntervalIdRef.current = null;
    }

    const updateLatestCandle = async () => {
      if (!chartRef.current || !seriesRef.current[0]) return;

      try {
        const binanceSymbol = 'SOLUSDT'; // Hardcoded to SOL
        const binanceInterval = mapIntervalToBinance(intervalRef.current);
        const candles = await fetchBinanceCandles(binanceSymbol, binanceInterval, 1);

        if (candles.length === 0) return;

        const latestCandle = candles[0];
        const mainSeries = seriesRef.current[0];

        // Update the main series using current chartType from ref
        if (chartTypeRef.current === 'candlestick') {
          mainSeries.update({
            time: latestCandle.time as Time,
            open: latestCandle.open,
            high: latestCandle.high,
            low: latestCandle.low,
            close: latestCandle.close,
          });
        } else if (chartTypeRef.current === 'line' || chartTypeRef.current === 'area') {
          mainSeries.update({
            time: latestCandle.time as Time,
            value: latestCandle.close,
          });
        }

        // Update volume if enabled
        if (showVolumeRef.current && seriesRef.current[1]) {
          const volumeSeries = seriesRef.current[1];
          volumeSeries.update({
            time: latestCandle.time as Time,
            value: latestCandle.volume || 0,
            color: latestCandle.close >= latestCandle.open ? '#26a69a80' : '#ef535080',
          });
        }

        // Call onPriceUpdate callback with the latest close price
        if (onPriceUpdateRef.current) {
          onPriceUpdateRef.current(latestCandle.close);
        }
      } catch (err) {
        // Silently fail
      }
    };

    // Use window.setInterval to avoid Next.js polyfill issues
    updateIntervalIdRef.current = window.setInterval(updateLatestCandle, updateIntervalSeconds * 1000);

    return () => {
      if (updateIntervalIdRef.current) {
        window.clearInterval(updateIntervalIdRef.current);
        updateIntervalIdRef.current = null;
      }
    };
  }, [updateIntervalSeconds]);

  const intervals: { value: string; label: string }[] = [
    { value: '1', label: '1m' },
    { value: '5', label: '5m' },
    { value: '15', label: '15m' },
    { value: '30', label: '30m' },
    { value: '60', label: '1h' },
    { value: '240', label: '4h' },
    { value: 'D', label: '1D' },
  ];

  return (
    <div className="relative w-full" style={{ height: `${height}px` }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 pb-2 border-b border-border/50 mb-2">
        {/* Chart Type */}
        <div className="flex items-center gap-1 border-r border-border/50 pr-2">
          <Button
            size="sm"
            variant={chartType === 'candlestick' ? 'default' : 'ghost'}
            className="h-7 px-2 text-xs"
            onClick={() => setChartType('candlestick')}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M6 6v12M6 6h4v12H6M14 3v18M14 3h4v18h-4" strokeWidth="2"/>
            </svg>
          </Button>
          <Button
            size="sm"
            variant={chartType === 'line' ? 'default' : 'ghost'}
            className="h-7 px-2 text-xs"
            onClick={() => setChartType('line')}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M3 17l6-6 4 4 8-8" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </Button>
          <Button
            size="sm"
            variant={chartType === 'area' ? 'default' : 'ghost'}
            className="h-7 px-2 text-xs"
            onClick={() => setChartType('area')}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M3 17l6-6 4 4 8-8v14H3z" strokeWidth="2" strokeLinecap="round" fill="currentColor" fillOpacity="0.2"/>
            </svg>
          </Button>
        </div>

        {/* Intervals */}
        <div className="flex items-center gap-1 border-r border-border/50 pr-2">
          {intervals.map(int => (
            <Button
              key={int.value}
              size="sm"
              variant={interval === int.value ? 'default' : 'ghost'}
              className="h-7 px-2 text-xs"
              onClick={() => setInterval(int.value as any)}
            >
              {int.label}
            </Button>
          ))}
        </div>

        {/* Indicators */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={showVolume ? 'default' : 'ghost'}
            className="h-7 px-2 text-xs"
            onClick={() => setShowVolume(!showVolume)}
          >
            Volume
          </Button>
          <Button
            size="sm"
            variant={showMA ? 'default' : 'ghost'}
            className="h-7 px-2 text-xs"
            onClick={() => setShowMA(!showMA)}
          >
            MA(20)
          </Button>
        </div>

        {/* Fullscreen/Reset */}
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => chartRef.current?.timeScale().fitContent()}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M3 12h18M12 3v18" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </Button>
        </div>
      </div>

      {/* Loading/Error Overlays */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/50 backdrop-blur-sm z-10">
          <div className="text-white/50 text-sm">Loading chart data...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/50 backdrop-blur-sm z-10">
          <div className="text-red-400 text-sm">{error}</div>
        </div>
      )}

      {/* Chart Container */}
      <div
        ref={chartContainerRef}
        className="w-full rounded-lg overflow-hidden"
        style={{ height: `${height - 40}px` }}
      />
    </div>
  );
}
