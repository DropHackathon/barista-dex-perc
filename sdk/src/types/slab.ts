import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

/**
 * Slab instruction discriminators
 */
export enum SlabInstruction {
  Initialize = 0,
  CommitFill = 1,
}

/**
 * Order side
 */
export enum OrderSide {
  Bid = 0,
  Ask = 1,
}

/**
 * Order type
 */
export enum OrderType {
  Limit = 0,
  PostOnly = 1,
  ImmediateOrCancel = 2,
  FillOrKill = 3,
}

/**
 * Order book level
 */
export interface BookLevel {
  price: BN;
  size: BN;
  numOrders: number;
}

/**
 * Order book snapshot
 */
export interface OrderBook {
  bids: BookLevel[];
  asks: BookLevel[];
  lastUpdate: BN;
}

/**
 * Order placement parameters
 */
export interface PlaceOrderParams {
  user: PublicKey;
  side: OrderSide;
  orderType: OrderType;
  price: BN;
  size: BN;
  clientOrderId?: BN;
}

/**
 * Order cancellation parameters
 */
export interface CancelOrderParams {
  user: PublicKey;
  orderId: BN;
}

/**
 * Open order information
 */
export interface OpenOrder {
  orderId: BN;
  user: PublicKey;
  side: OrderSide;
  price: BN;
  size: BN;
  filled: BN;
  timestamp: BN;
}

/**
 * Trade information
 */
export interface Trade {
  maker: PublicKey;
  taker: PublicKey;
  price: BN;
  size: BN;
  timestamp: BN;
  isBuyerMaker: boolean;
}

/**
 * Quote level - single price level in QuoteCache
 */
export interface QuoteLevel {
  /** Price (1e6 scale) */
  price: BN;
  /** Available quantity at this level (1e6 scale) */
  availableQty: BN;
}

/**
 * Quote cache - router-readable best bid/ask levels from slab
 * Each slab maintains top 4 bid and ask levels for fast price discovery
 */
export interface QuoteCache {
  /** Snapshot of slab seqno when cache was last updated */
  seqnoSnapshot: number;
  /** Best 4 bid levels (sorted descending by price) */
  bestBids: QuoteLevel[];
  /** Best 4 ask levels (sorted ascending by price) */
  bestAsks: QuoteLevel[];
}

/**
 * Slab quotes with full market data
 * Returned by getSlabQuotes() for smart routing
 */
export interface SlabQuotes {
  /** Slab market address */
  slab: PublicKey;
  /** Instrument being traded on this slab */
  instrument: PublicKey;
  /** Mark price from oracle (1e6 scale) */
  markPrice: BN;
  /** Quote cache with best bid/ask levels */
  cache: QuoteCache;
}
