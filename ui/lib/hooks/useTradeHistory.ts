import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../wallet/WalletProvider';
import BN from 'bn.js';

export interface Trade {
  timestamp: number;
  signature: string;
  side: 'buy' | 'sell';
  market: string;
  quantity: number; // in instrument units
  price: number; // in USD
  leverage: number;
  pnl?: number; // Only set when closing a position
}

const STORAGE_KEY = 'barista_trade_history';

export function useTradeHistory() {
  const { publicKey } = useWallet();
  const [trades, setTrades] = useState<Trade[]>([]);

  // Load trades from localStorage for the current wallet
  useEffect(() => {
    if (!publicKey) {
      setTrades([]);
      return;
    }

    const storageKey = `${STORAGE_KEY}_${publicKey.toBase58()}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setTrades(parsed);
      } catch (err) {
        console.error('Failed to parse trade history:', err);
        setTrades([]);
      }
    } else {
      setTrades([]);
    }
  }, [publicKey]);

  // Add a new trade
  const addTrade = useCallback((trade: Trade) => {
    if (!publicKey) return;

    const storageKey = `${STORAGE_KEY}_${publicKey.toBase58()}`;
    const newTrades = [...trades, trade];
    setTrades(newTrades);
    localStorage.setItem(storageKey, JSON.stringify(newTrades));
  }, [publicKey, trades]);

  // Calculate total realized PnL (sum of all PnL from closed trades)
  const totalRealizedPnl = trades.reduce((sum, trade) => {
    return sum + (trade.pnl || 0);
  }, 0);

  // Clear history
  const clearHistory = useCallback(() => {
    if (!publicKey) return;

    const storageKey = `${STORAGE_KEY}_${publicKey.toBase58()}`;
    setTrades([]);
    localStorage.removeItem(storageKey);
  }, [publicKey]);

  return {
    trades,
    addTrade,
    totalRealizedPnl,
    clearHistory,
  };
}
