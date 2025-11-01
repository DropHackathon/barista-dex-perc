import { useState, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { useBarista } from './useBarista';

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';

export interface TradeParams {
  slab: PublicKey;
  side: OrderSide;
  orderType: OrderType;
  quantity: BN;
  price?: BN;
  leverage?: number;
}

export interface TradeResult {
  signature: string;
  success: boolean;
  error?: string;
}

export interface UseTrade {
  executeTrade: (params: TradeParams) => Promise<TradeResult>;
  isExecuting: boolean;
  lastError: Error | null;
}

export function useTrade(): UseTrade {
  const { client, connected } = useBarista();
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);

  const executeTrade = useCallback(
    async (params: TradeParams): Promise<TradeResult> => {
      if (!client || !connected) {
        const error = new Error('Wallet not connected');
        setLastError(error);
        return {
          signature: '',
          success: false,
          error: error.message,
        };
      }

      setIsExecuting(true);
      setLastError(null);

      try {
        let signature: string;

        if (params.orderType === 'market') {
          // Market order
          if (params.side === 'buy') {
            signature = await client.marketBuy(
              params.slab,
              params.quantity,
              params.leverage
            );
          } else {
            signature = await client.marketSell(
              params.slab,
              params.quantity,
              params.leverage
            );
          }
        } else {
          // Limit order
          if (!params.price) {
            throw new Error('Price required for limit orders');
          }

          if (params.side === 'buy') {
            signature = await client.limitBuy(
              params.slab,
              params.quantity,
              params.price,
              params.leverage
            );
          } else {
            signature = await client.limitSell(
              params.slab,
              params.quantity,
              params.price,
              params.leverage
            );
          }
        }

        console.log(`Trade executed: ${signature}`);

        return {
          signature,
          success: true,
        };
      } catch (err) {
        console.error('Trade execution failed:', err);
        const error = err instanceof Error ? err : new Error('Unknown error');
        setLastError(error);

        return {
          signature: '',
          success: false,
          error: error.message,
        };
      } finally {
        setIsExecuting(false);
      }
    },
    [client, connected]
  );

  return {
    executeTrade,
    isExecuting,
    lastError,
  };
}
