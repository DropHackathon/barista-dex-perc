# Localnet Trading UI Implementation Plan

**Date**: 2025-10-28
**Status**: Planning
**Priority**: High - User-Facing Trading Interface

## Executive Summary

This document outlines the implementation plan for a **localnet-first trading UI** for Barista DEX that can be easily transitioned to production. The UI will support environment-variable-based authentication for localnet and seamlessly switch to browser wallet integration for mainnet.

---

## 1. Architecture Overview

### 1.1 Tech Stack

**Frontend Framework**: Next.js 14 (App Router)
- Server-side rendering for better performance
- API routes for backend logic (if needed)
- TypeScript for type safety
- Easy deployment to Vercel/Netlify

**UI Library**: shadcn/ui + Tailwind CSS
- Modern, accessible components
- Highly customizable
- Fast development

**Solana Integration**:
- `@solana/web3.js` - Core Solana SDK
- `@solana/wallet-adapter-react` - Wallet integration (production)
- `@barista-dex/sdk` - Barista DEX trading SDK

**State Management**: Zustand
- Lightweight, simple
- Better than Redux for small-medium apps
- Great TypeScript support

**Charts**: TradingView Lightweight Charts
- Professional-grade charting
- Free, open-source
- Used by major exchanges

### 1.2 Project Structure

```
trading-ui/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Home/Trading page
│   │   └── portfolio/
│   │       └── page.tsx       # Portfolio page
│   │
│   ├── components/            # React components
│   │   ├── ui/               # shadcn/ui components
│   │   ├── trading/
│   │   │   ├── OrderBook.tsx
│   │   │   ├── TradeForm.tsx
│   │   │   ├── PriceChart.tsx
│   │   │   └── PositionList.tsx
│   │   ├── portfolio/
│   │   │   ├── PortfolioSummary.tsx
│   │   │   ├── PositionTable.tsx
│   │   │   └── BalanceCard.tsx
│   │   └── layout/
│   │       ├── Header.tsx
│   │       ├── Sidebar.tsx
│   │       └── Footer.tsx
│   │
│   ├── lib/                   # Core utilities
│   │   ├── wallet/           # Wallet abstraction layer
│   │   │   ├── types.ts
│   │   │   ├── LocalnetWalletAdapter.ts
│   │   │   ├── BrowserWalletAdapter.ts
│   │   │   └── WalletProvider.tsx
│   │   │
│   │   ├── barista/          # Barista DEX integration
│   │   │   ├── client.ts     # RouterClient wrapper
│   │   │   ├── portfolio.ts  # Portfolio queries
│   │   │   ├── trading.ts    # Trading functions
│   │   │   └── market.ts     # Market data
│   │   │
│   │   ├── config.ts         # Environment configuration
│   │   └── utils.ts          # Helper functions
│   │
│   ├── hooks/                 # Custom React hooks
│   │   ├── useWallet.ts
│   │   ├── usePortfolio.ts
│   │   ├── useMarketData.ts
│   │   └── useTrades.ts
│   │
│   ├── store/                 # Zustand stores
│   │   ├── walletStore.ts
│   │   ├── portfolioStore.ts
│   │   └── marketStore.ts
│   │
│   └── types/                 # TypeScript types
│       ├── trading.ts
│       ├── portfolio.ts
│       └── market.ts
│
├── public/                    # Static assets
├── .env.local                 # Local environment variables
├── .env.production            # Production environment variables
├── next.config.js             # Next.js configuration
├── tailwind.config.ts         # Tailwind configuration
├── tsconfig.json              # TypeScript configuration
└── package.json               # Dependencies
```

---

## 2. Wallet Abstraction Layer

### 2.1 Core Interface

```typescript
// lib/wallet/types.ts

export type WalletMode = 'localnet' | 'browser';

export interface WalletAdapter {
  mode: WalletMode;
  publicKey: PublicKey | null;
  connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  signTransaction(transaction: Transaction): Promise<Transaction>;
  signAllTransactions(transactions: Transaction[]): Promise<Transaction[]>;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}

export interface WalletContextState extends WalletAdapter {
  connecting: boolean;
  error: Error | null;
}
```

### 2.2 Localnet Adapter (Environment Variable)

```typescript
// lib/wallet/LocalnetWalletAdapter.ts

import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { WalletAdapter } from './types';

export class LocalnetWalletAdapter implements WalletAdapter {
  mode = 'localnet' as const;
  private keypair: Keypair | null = null;

  get publicKey(): PublicKey | null {
    return this.keypair?.publicKey ?? null;
  }

  get connected(): boolean {
    return this.keypair !== null;
  }

  async connect(): Promise<void> {
    // Load keypair from environment variable
    const privateKeyEnv = process.env.NEXT_PUBLIC_LOCALNET_PRIVATE_KEY;

    if (!privateKeyEnv) {
      throw new Error(
        'NEXT_PUBLIC_LOCALNET_PRIVATE_KEY not set. ' +
        'Set it in .env.local with your keypair JSON array.'
      );
    }

    try {
      const secretKey = JSON.parse(privateKeyEnv);
      this.keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
      console.log('Connected to localnet wallet:', this.publicKey?.toBase58());
    } catch (err) {
      throw new Error(`Failed to parse localnet keypair: ${err}`);
    }
  }

  async disconnect(): Promise<void> {
    this.keypair = null;
  }

  async signTransaction(transaction: Transaction): Promise<Transaction> {
    if (!this.keypair) {
      throw new Error('Wallet not connected');
    }
    transaction.partialSign(this.keypair);
    return transaction;
  }

  async signAllTransactions(transactions: Transaction[]): Promise<Transaction[]> {
    if (!this.keypair) {
      throw new Error('Wallet not connected');
    }
    transactions.forEach(tx => tx.partialSign(this.keypair!));
    return transactions;
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this.keypair) {
      throw new Error('Wallet not connected');
    }
    // Simple signature without tweetnacl dependency
    return message; // For now, not critical for trading
  }
}
```

### 2.3 Browser Wallet Adapter (Phantom/Solflare)

```typescript
// lib/wallet/BrowserWalletAdapter.ts

import { PublicKey, Transaction } from '@solana/web3.js';
import { WalletAdapter } from './types';

export class BrowserWalletAdapter implements WalletAdapter {
  mode = 'browser' as const;
  private walletProvider: any = null;

  get publicKey(): PublicKey | null {
    return this.walletProvider?.publicKey ?? null;
  }

  get connected(): boolean {
    return this.walletProvider?.isConnected ?? false;
  }

  async connect(): Promise<void> {
    // Check for Phantom
    if ('phantom' in window) {
      const provider = (window as any).phantom?.solana;
      if (provider?.isPhantom) {
        try {
          await provider.connect();
          this.walletProvider = provider;
          console.log('Connected to Phantom:', this.publicKey?.toBase58());
          return;
        } catch (err) {
          console.error('Phantom connection failed:', err);
        }
      }
    }

    // Check for Solflare
    if ('solflare' in window) {
      const provider = (window as any).solflare;
      try {
        await provider.connect();
        this.walletProvider = provider;
        console.log('Connected to Solflare:', this.publicKey?.toBase58());
        return;
      } catch (err) {
        console.error('Solflare connection failed:', err);
      }
    }

    throw new Error('No Solana wallet found. Please install Phantom or Solflare.');
  }

  async disconnect(): Promise<void> {
    if (this.walletProvider) {
      await this.walletProvider.disconnect();
      this.walletProvider = null;
    }
  }

  async signTransaction(transaction: Transaction): Promise<Transaction> {
    if (!this.walletProvider) {
      throw new Error('Wallet not connected');
    }
    return await this.walletProvider.signTransaction(transaction);
  }

  async signAllTransactions(transactions: Transaction[]): Promise<Transaction[]> {
    if (!this.walletProvider) {
      throw new Error('Wallet not connected');
    }
    return await this.walletProvider.signAllTransactions(transactions);
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this.walletProvider) {
      throw new Error('Wallet not connected');
    }
    return await this.walletProvider.signMessage(message);
  }
}
```

### 2.4 Wallet Provider (Context)

```typescript
// lib/wallet/WalletProvider.tsx

'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { LocalnetWalletAdapter } from './LocalnetWalletAdapter';
import { BrowserWalletAdapter } from './BrowserWalletAdapter';
import { WalletAdapter, WalletContextState, WalletMode } from './types';

const WalletContext = createContext<WalletContextState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [adapter, setAdapter] = useState<WalletAdapter | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Determine wallet mode from environment
  const walletMode: WalletMode =
    process.env.NEXT_PUBLIC_WALLET_MODE === 'localnet' ? 'localnet' : 'browser';

  // Initialize adapter on mount
  useEffect(() => {
    const initAdapter = walletMode === 'localnet'
      ? new LocalnetWalletAdapter()
      : new BrowserWalletAdapter();
    setAdapter(initAdapter);
  }, [walletMode]);

  const connect = async () => {
    if (!adapter) return;

    setConnecting(true);
    setError(null);

    try {
      await adapter.connect();
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!adapter) return;

    try {
      await adapter.disconnect();
    } catch (err) {
      setError(err as Error);
    }
  };

  const value: WalletContextState = {
    mode: adapter?.mode ?? 'browser',
    publicKey: adapter?.publicKey ?? null,
    connected: adapter?.connected ?? false,
    connecting,
    error,
    connect,
    disconnect,
    signTransaction: adapter?.signTransaction.bind(adapter) ?? (async () => { throw new Error('No adapter'); }),
    signAllTransactions: adapter?.signAllTransactions.bind(adapter) ?? (async () => { throw new Error('No adapter'); }),
    signMessage: adapter?.signMessage.bind(adapter) ?? (async () => { throw new Error('No adapter'); }),
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}
```

---

## 3. Environment Configuration

### 3.1 Localnet Configuration (.env.local)

```bash
# .env.local (for localnet development)

# Wallet Configuration
NEXT_PUBLIC_WALLET_MODE=localnet
NEXT_PUBLIC_LOCALNET_PRIVATE_KEY=[123,45,67,...]  # Your keypair JSON array

# Network Configuration
NEXT_PUBLIC_NETWORK=localnet
NEXT_PUBLIC_RPC_URL=http://localhost:8899

# Program IDs (localnet)
NEXT_PUBLIC_ROUTER_PROGRAM_ID=CWW4ZQKNu1iaCyvLG2ah3rCDvZ9BBidjhYDiv55Xu22m
NEXT_PUBLIC_SLAB_PROGRAM_ID=9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin

# Feature Flags
NEXT_PUBLIC_SHOW_DEBUG_INFO=true
NEXT_PUBLIC_AUTO_CONNECT=true
```

### 3.2 Production Configuration (.env.production)

```bash
# .env.production (for mainnet/devnet)

# Wallet Configuration
NEXT_PUBLIC_WALLET_MODE=browser
# No private key in production!

# Network Configuration
NEXT_PUBLIC_NETWORK=mainnet-beta
NEXT_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com

# Program IDs (mainnet)
NEXT_PUBLIC_ROUTER_PROGRAM_ID=<MAINNET_ROUTER_PROGRAM_ID>
NEXT_PUBLIC_SLAB_PROGRAM_ID=<MAINNET_SLAB_PROGRAM_ID>

# Feature Flags
NEXT_PUBLIC_SHOW_DEBUG_INFO=false
NEXT_PUBLIC_AUTO_CONNECT=false
```

### 3.3 Config Helper

```typescript
// lib/config.ts

import { PublicKey } from '@solana/web3.js';

export interface AppConfig {
  walletMode: 'localnet' | 'browser';
  network: 'mainnet-beta' | 'devnet' | 'localnet';
  rpcUrl: string;
  routerProgramId: PublicKey;
  slabProgramId: PublicKey;
  showDebugInfo: boolean;
  autoConnect: boolean;
}

export function getConfig(): AppConfig {
  const walletMode = process.env.NEXT_PUBLIC_WALLET_MODE === 'localnet'
    ? 'localnet'
    : 'browser';

  const network = (process.env.NEXT_PUBLIC_NETWORK ?? 'mainnet-beta') as AppConfig['network'];

  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? (() => {
    switch (network) {
      case 'mainnet-beta':
        return 'https://api.mainnet-beta.solana.com';
      case 'devnet':
        return 'https://api.devnet.solana.com';
      case 'localnet':
        return 'http://localhost:8899';
      default:
        throw new Error(`Unknown network: ${network}`);
    }
  })();

  return {
    walletMode,
    network,
    rpcUrl,
    routerProgramId: new PublicKey(
      process.env.NEXT_PUBLIC_ROUTER_PROGRAM_ID!
    ),
    slabProgramId: new PublicKey(
      process.env.NEXT_PUBLIC_SLAB_PROGRAM_ID!
    ),
    showDebugInfo: process.env.NEXT_PUBLIC_SHOW_DEBUG_INFO === 'true',
    autoConnect: process.env.NEXT_PUBLIC_AUTO_CONNECT === 'true',
  };
}
```

---

## 4. Trading Interface Components

### 4.1 Trade Form

```typescript
// components/trading/TradeForm.tsx

'use client';

import { useState } from 'react';
import { useWallet } from '@/lib/wallet/WalletProvider';
import { useTrade } from '@/hooks/useTrade';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function TradeForm() {
  const { connected, connect } = useWallet();
  const { executeTrade, loading } = useTrade();

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [leverage, setLeverage] = useState('1');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!connected) {
      await connect();
      return;
    }

    await executeTrade({
      side,
      quantity: parseFloat(quantity),
      price: orderType === 'limit' ? parseFloat(price) : undefined,
      leverage: parseFloat(leverage),
    });
  };

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg border p-6">
      <Tabs value={side} onValueChange={(v) => setSide(v as 'buy' | 'sell')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="buy">Buy</TabsTrigger>
          <TabsTrigger value="sell">Sell</TabsTrigger>
        </TabsList>
      </Tabs>

      <Tabs value={orderType} onValueChange={(v) => setOrderType(v as any)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="market">Market</TabsTrigger>
          <TabsTrigger value="limit">Limit</TabsTrigger>
        </TabsList>
      </Tabs>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </div>

        {orderType === 'limit' && (
          <div className="space-y-2">
            <Label htmlFor="price">Price</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="leverage">Leverage</Label>
          <Input
            id="leverage"
            type="number"
            step="0.1"
            min="1"
            max="10"
            placeholder="1"
            value={leverage}
            onChange={(e) => setLeverage(e.target.value)}
          />
        </div>

        <Button
          type="submit"
          className={`w-full ${side === 'buy' ? 'bg-green-600' : 'bg-red-600'}`}
          disabled={loading}
        >
          {loading ? 'Executing...' : `${side.toUpperCase()} ${quantity || '0'}`}
        </Button>
      </form>
    </div>
  );
}
```

### 4.2 Position List (With Instrument Netting)

```typescript
// components/trading/PositionList.tsx

'use client';

import { usePortfolio } from '@/hooks/usePortfolio';
import { formatAmount } from '@/lib/utils';

export function PositionList() {
  const { positions, loading } = usePortfolio();

  if (loading) {
    return <div>Loading positions...</div>;
  }

  if (!positions || positions.length === 0) {
    return <div className="text-muted-foreground">No open positions</div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Positions</h3>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b text-sm text-muted-foreground">
              <th className="text-left p-2">Market</th>
              <th className="text-right p-2">Size</th>
              <th className="text-right p-2">Entry</th>
              <th className="text-right p-2">Mark</th>
              <th className="text-right p-2">PnL</th>
              <th className="text-right p-2">Lev</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos, idx) => (
              <tr key={idx} className="border-b">
                <td className="p-2 font-mono text-sm">
                  {pos.marketSymbol || `${pos.instrumentAddress.slice(0, 4)}...${pos.instrumentAddress.slice(-4)}`}
                </td>
                <td className={`text-right p-2 ${pos.netSize > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {pos.netSize > 0 ? '+' : ''}{formatAmount(pos.netSize)}
                </td>
                <td className="text-right p-2">
                  ${formatAmount(pos.avgEntryPrice)}
                </td>
                <td className="text-right p-2">
                  ${formatAmount(pos.markPrice)}
                </td>
                <td className={`text-right p-2 ${pos.unrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {pos.unrealizedPnl >= 0 ? '+' : ''}${formatAmount(pos.unrealizedPnl)}
                </td>
                <td className="text-right p-2">
                  {pos.effectiveLeverage.toFixed(2)}x
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### 4.3 Portfolio Summary

```typescript
// components/portfolio/PortfolioSummary.tsx

'use client';

import { usePortfolio } from '@/hooks/usePortfolio';
import { formatAmount } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function PortfolioSummary() {
  const { portfolio, loading } = usePortfolio();

  if (loading) {
    return <div>Loading portfolio...</div>;
  }

  if (!portfolio) {
    return <div>No portfolio data</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Equity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatAmount(portfolio.equity)} SOL
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Margin Used</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatAmount(portfolio.im)} SOL
          </div>
          <p className="text-xs text-muted-foreground">
            {((portfolio.im / portfolio.equity) * 100).toFixed(1)}% of equity
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Unrealized PnL</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${portfolio.unrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {portfolio.unrealizedPnl >= 0 ? '+' : ''}{formatAmount(portfolio.unrealizedPnl)} SOL
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {((portfolio.health / portfolio.equity) * 100).toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground">
            {portfolio.health > portfolio.mm ? 'Healthy' : 'At Risk'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 5. Custom Hooks

### 5.1 usePortfolio Hook

```typescript
// hooks/usePortfolio.ts

'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/lib/wallet/WalletProvider';
import { Connection } from '@solana/web3.js';
import { RouterClient } from '@barista-dex/sdk';
import { getConfig } from '@/lib/config';

export interface NettedPosition {
  instrumentAddress: string;
  marketSymbol?: string;
  netSize: number;
  avgEntryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  effectiveLeverage: number;
  underlyingPositions: number; // Count of slab positions
}

export interface Portfolio {
  equity: number;
  im: number;
  mm: number;
  health: number;
  unrealizedPnl: number;
}

export function usePortfolio() {
  const { publicKey, connected } = useWallet();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [positions, setPositions] = useState<NettedPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      setPortfolio(null);
      setPositions([]);
      return;
    }

    const fetchPortfolio = async () => {
      setLoading(true);
      setError(null);

      try {
        const config = getConfig();
        const connection = new Connection(config.rpcUrl, 'confirmed');
        const client = new RouterClient(
          connection,
          config.routerProgramId,
        );

        // Fetch portfolio account
        const portfolioData = await client.getPortfolio(publicKey);

        if (!portfolioData) {
          throw new Error('Portfolio not found');
        }

        // Convert to UI-friendly format
        setPortfolio({
          equity: portfolioData.equity.toNumber() / 1e9, // lamports to SOL
          im: portfolioData.im.toNumber() / 1e9,
          mm: portfolioData.mm.toNumber() / 1e9,
          health: portfolioData.health.toNumber() / 1e9,
          unrealizedPnl: 0, // TODO: Calculate from positions
        });

        // Fetch and net positions by instrument
        // (This would use the same logic we implemented in CLI)
        const nettedPositions = await fetchNettedPositions(
          client,
          publicKey,
          portfolioData
        );
        setPositions(nettedPositions);

      } catch (err) {
        setError(err as Error);
        console.error('Failed to fetch portfolio:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolio();

    // Refresh every 10 seconds
    const interval = setInterval(fetchPortfolio, 10000);
    return () => clearInterval(interval);
  }, [connected, publicKey]);

  return { portfolio, positions, loading, error };
}

async function fetchNettedPositions(
  client: RouterClient,
  userAddress: PublicKey,
  portfolio: any
): Promise<NettedPosition[]> {
  // TODO: Implement instrument-based netting
  // This is the same logic we added to CLI portfolio command
  return [];
}
```

### 5.2 useTrade Hook

```typescript
// hooks/useTrade.ts

'use client';

import { useState } from 'react';
import { useWallet } from '@/lib/wallet/WalletProvider';
import { Connection, Transaction } from '@solana/web3.js';
import { RouterClient } from '@barista-dex/sdk';
import { getConfig } from '@/lib/config';
import BN from 'bn.js';

interface TradeParams {
  side: 'buy' | 'sell';
  quantity: number;
  price?: number;
  leverage?: number;
}

export function useTrade() {
  const { publicKey, signTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const executeTrade = async (params: TradeParams) => {
    if (!publicKey) {
      throw new Error('Wallet not connected');
    }

    setLoading(true);
    setError(null);

    try {
      const config = getConfig();
      const connection = new Connection(config.rpcUrl, 'confirmed');
      const client = new RouterClient(connection, config.routerProgramId);

      // Convert to SDK format
      const quantity = new BN(params.quantity * 1e6); // Scale to 1e6
      const price = params.price ? new BN(params.price * 1e6) : undefined;
      const leverage = params.leverage ?? 1;

      // Get best slab for this instrument
      // For now, use first available slab (TODO: smart routing)
      const slabs = await client.getActiveSlabs();
      if (slabs.length === 0) {
        throw new Error('No active slabs found');
      }
      const slab = slabs[0];

      // Build trade instruction
      const buildFn = params.side === 'buy'
        ? client.buildBuyInstruction.bind(client)
        : client.buildSellInstruction.bind(client);

      const { instruction, receiptSetup, receiptKeypair } = await buildFn(
        publicKey,
        slab,
        quantity,
        price ?? new BN(0), // Market order uses oracle price
        undefined, // oracle - will be auto-fetched
        price ? 'limit' : 'market',
        leverage
      );

      // Build transaction
      const tx = new Transaction();
      tx.add(receiptSetup);
      tx.add(instruction);

      // Sign and send
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signed = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize());

      await connection.confirmTransaction(signature, 'confirmed');

      console.log('Trade executed:', signature);
      return signature;

    } catch (err) {
      setError(err as Error);
      console.error('Trade failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { executeTrade, loading, error };
}
```

---

## 6. Implementation Timeline

### Week 1: Project Setup & Wallet Layer
- [ ] Initialize Next.js project with TypeScript
- [ ] Install dependencies (shadcn/ui, Tailwind, Solana SDK)
- [ ] Implement wallet abstraction layer
  - [ ] LocalnetWalletAdapter
  - [ ] BrowserWalletAdapter
  - [ ] WalletProvider context
- [ ] Setup environment configuration
- [ ] Test wallet connection on localnet

### Week 2: Core Trading Features
- [ ] Implement Barista SDK integration
- [ ] Create custom hooks (usePortfolio, useTrade)
- [ ] Build TradeForm component
- [ ] Build PositionList component (with netting)
- [ ] Test trade execution on localnet

### Week 3: Portfolio & Market Data
- [ ] Implement PortfolioSummary component
- [ ] Add market data fetching
- [ ] Add price chart (TradingView)
- [ ] Add order book display
- [ ] Real-time updates via polling

### Week 4: Polish & Testing
- [ ] Add error handling and loading states
- [ ] Add transaction history
- [ ] Add notifications/toasts
- [ ] Responsive design for mobile
- [ ] End-to-end testing on localnet
- [ ] Documentation

---

## 7. Deployment Strategy

### 7.1 Localnet (Development)

```bash
# Start localnet
solana-test-validator --reset

# Deploy programs
cd /path/to/barista-dex
anchor build && anchor deploy

# Set environment
cp .env.local.example .env.local
# Edit .env.local with your localnet keypair

# Run UI
cd trading-ui
npm run dev
# Visit http://localhost:3000
```

### 7.2 Production (Mainnet/Devnet)

```bash
# Build for production
npm run build

# Deploy to Vercel (recommended)
vercel deploy

# Or deploy to any Node.js host
npm start
```

**Environment Variables** (set in Vercel dashboard):
- `NEXT_PUBLIC_WALLET_MODE=browser`
- `NEXT_PUBLIC_NETWORK=mainnet-beta`
- `NEXT_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com`
- `NEXT_PUBLIC_ROUTER_PROGRAM_ID=<MAINNET_ID>`
- `NEXT_PUBLIC_SLAB_PROGRAM_ID=<MAINNET_ID>`

---

## 8. Security Considerations

### 8.1 Localnet

- **Private Key in Env**: Safe for localnet ONLY
- **Never commit `.env.local`** to git
- **Use test keypairs** with no real funds

### 8.2 Production

- **No private keys in code or env**
- **Browser wallet only** for signing
- **Validate all user inputs** before building transactions
- **Rate limiting** on RPC calls (use paid RPC if needed)
- **HTTPS only** for production deployments

---

## 9. Next Steps

1. **Review this plan** - Adjust based on team feedback
2. **Create trading-ui directory** - Initialize Next.js project
3. **Start with Week 1 tasks** - Wallet abstraction first
4. **Iterate quickly** - Get localnet working ASAP
5. **Gather feedback** - Test with real users on localnet

---

## 10. Success Criteria

- [ ] Auto-connects to localnet wallet on page load
- [ ] Can execute market and limit orders
- [ ] Displays portfolio with netted positions by instrument
- [ ] Shows real-time PnL updates
- [ ] Switch to browser wallet by changing one env var
- [ ] Zero code changes needed for mainnet deployment

---

**Document Version**: 1.0
**Last Updated**: 2025-10-28
**Author**: Claude (Barista DEX Development Agent)
**Status**: Ready for Implementation
