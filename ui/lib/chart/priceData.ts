import { UTCTimestamp } from 'lightweight-charts';

export interface CandleData {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * Fetch historical candlestick data from Binance
 * @param symbol - Binance symbol (e.g., "SOLUSDT", "BTCUSDT")
 * @param interval - Candlestick interval (e.g., "15m", "1h", "1d")
 * @param limit - Number of candles to fetch (max 1000)
 */
export async function fetchBinanceCandles(
  symbol: string,
  interval: string = '15m',
  limit: number = 500
): Promise<CandleData[]> {
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Binance kline format: [openTime, open, high, low, close, volume, closeTime, ...]
    return data.map((candle: any[]) => ({
      time: Math.floor(candle[0] / 1000) as UTCTimestamp, // Convert ms to seconds
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
    }));
  } catch (error) {
    console.error('Error fetching Binance candles:', error);
    return [];
  }
}

/**
 * Map TradingView symbol to Binance symbol
 * E.g., "BINANCE:SOLUSDT" -> "SOLUSDT"
 */
export function extractBinanceSymbol(tvSymbol: string): string {
  // Remove exchange prefix if present
  const parts = tvSymbol.split(':');
  return parts.length > 1 ? parts[1] : tvSymbol;
}

/**
 * Map interval string to Binance format
 */
export function mapIntervalToBinance(interval: string): string {
  const mapping: Record<string, string> = {
    '1': '1m',
    '5': '5m',
    '15': '15m',
    '30': '30m',
    '60': '1h',
    '240': '4h',
    'D': '1d',
    'W': '1w',
  };
  return mapping[interval] || '15m';
}
