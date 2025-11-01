'use client';

import { useEffect, useRef, memo } from 'react';

interface TradingViewChartProps {
  symbol: string;
  interval?: '1' | '5' | '15' | '30' | '60' | '240' | 'D' | 'W';
  theme?: 'light' | 'dark';
  height?: number;
}

export const TradingViewChart = memo(function TradingViewChart({
  symbol,
  interval = '15',
  theme = 'dark',
  height = 600,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const loadScript = () => {
      // Check if script already exists
      const existingScript = document.querySelector('script[src="https://s3.tradingview.com/tv.js"]');
      if (existingScript) {
        initWidget();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = initWidget;
      document.head.appendChild(script);
    };

    const initWidget = () => {
      if (!containerRef.current || typeof window.TradingView === 'undefined') {
        return;
      }

      // Clean up existing widget
      if (widgetRef.current) {
        containerRef.current.innerHTML = '';
      }

      widgetRef.current = new window.TradingView.widget({
        container_id: 'tradingview_chart',
        autosize: true,
        symbol: symbol,
        interval: interval,
        timezone: 'Etc/UTC',
        theme: theme,
        style: '1', // Candles
        locale: 'en',
        toolbar_bg: theme === 'dark' ? '#1a1a1a' : '#f1f3f6',
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff',
        gridColor: theme === 'dark' ? '#2a2a2a' : '#e1e3eb',
        studies: [
          'MASimple@tv-basicstudies',
          'Volume@tv-basicstudies',
        ],
        hide_side_toolbar: false,
        allow_symbol_change: false,
        details: false,
        hotlist: false,
        calendar: false,
      });
    };

    if (typeof window.TradingView === 'undefined') {
      loadScript();
    } else {
      initWidget();
    }

    return () => {
      if (widgetRef.current && containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [symbol, interval, theme]);

  return (
    <div className="w-full rounded-lg overflow-hidden border border-border bg-card" style={{ height: `${height}px` }}>
      <div id="tradingview_chart" ref={containerRef} className="h-full w-full" />
    </div>
  );
});
