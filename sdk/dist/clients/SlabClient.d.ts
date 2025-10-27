import { Connection, PublicKey, TransactionInstruction, Keypair } from '@solana/web3.js';
import BN from 'bn.js';
import { OrderSide, OrderBook, OpenOrder, Trade } from '../types/slab';
import { InstrumentInfo, BestPrices } from '../types/discovery';
/**
 * Slab state structure
 */
export interface SlabState {
    lpOwner: PublicKey;
    routerId: PublicKey;
    instrument: PublicKey;
    markPx: BN;
    takerFeeBps: BN;
    contractSize: BN;
    seqno: number;
    bump: number;
}
/**
 * Fill receipt structure
 */
export interface FillReceipt {
    slab: PublicKey;
    seqno: number;
    side: OrderSide;
    qty: BN;
    fillPx: BN;
    timestamp: BN;
}
/**
 * Client for interacting with the Barista DEX Slab program
 */
export declare class SlabClient {
    private connection;
    private programId;
    private wallet?;
    /**
     * Create a new SlabClient
     * @param connection Solana connection
     * @param programId Slab program ID
     * @param wallet Optional wallet keypair for signing transactions
     */
    constructor(connection: Connection, programId: PublicKey, wallet?: Keypair | undefined);
    /**
     * Derive Slab PDA
     * @param lpOwner LP owner's public key
     * @param instrument Instrument (perp market) public key
     * @returns [PDA, bump]
     */
    deriveSlabPDA(lpOwner: PublicKey, instrument: PublicKey): [PublicKey, number];
    /**
     * Derive Fill Receipt PDA
     * @param slab Slab public key
     * @param seqno Sequence number
     * @returns [PDA, bump]
     */
    deriveFillReceiptPDA(slab: PublicKey, seqno: number): [PublicKey, number];
    /**
     * Fetch Slab state account data
     * @param slab Slab public key
     * @returns Slab state data
     */
    getSlabState(slab: PublicKey): Promise<SlabState | null>;
    /**
     * Fetch Fill Receipt account data
     * @param slab Slab public key
     * @param seqno Sequence number
     * @returns Fill receipt data
     */
    getFillReceipt(slab: PublicKey, seqno: number): Promise<FillReceipt | null>;
    /**
     * Build Initialize Slab instruction
     * @param lpOwner LP owner's public key
     * @param routerId Router program ID
     * @param instrument Instrument (perp market) public key
     * @param markPx Initial mark price (1e6 scale)
     * @param takerFeeBps Taker fee in basis points (1e6 scale)
     * @param contractSize Contract size (1e6 scale)
     * @param payer Payer and authority
     * @returns TransactionInstruction
     */
    buildInitializeSlabInstruction(lpOwner: PublicKey, routerId: PublicKey, instrument: PublicKey, markPx: BN, takerFeeBps: BN, contractSize: BN, payer: PublicKey): TransactionInstruction;
    /**
     * Build CommitFill instruction (v0 - atomic fill)
     * @param slab Slab public key
     * @param expectedSeqno Expected slab sequence number (TOCTOU protection)
     * @param side Order side (Buy or Sell)
     * @param qty Quantity to fill (1e6 scale)
     * @param limitPx Limit price (1e6 scale)
     * @param routerSigner Router signer
     * @returns TransactionInstruction
     */
    buildCommitFillInstruction(slab: PublicKey, expectedSeqno: number, side: OrderSide, qty: BN, limitPx: BN, routerSigner: PublicKey): TransactionInstruction;
    /**
     * Get order book snapshot (stub - v0 doesn't have full order book)
     * @param slab Slab public key
     * @returns Order book snapshot
     */
    getOrderBook(slab: PublicKey): Promise<OrderBook>;
    /**
     * Get recent trades (stub - requires indexing)
     * @param slab Slab public key
     * @param limit Number of trades to fetch
     * @returns Recent trades
     */
    getRecentTrades(slab: PublicKey, limit?: number): Promise<Trade[]>;
    /**
     * Get open orders for a user (stub - v0 doesn't have persistent orders)
     * @param slab Slab public key
     * @param user User's public key
     * @returns Open orders
     */
    getOpenOrders(slab: PublicKey, user: PublicKey): Promise<OpenOrder[]>;
    /**
     * Get instruments in a slab (v0: returns 1, future: up to 32)
     * @param slabAddress Slab public key
     * @returns Array of instrument info
     */
    getInstruments(slabAddress: PublicKey): Promise<InstrumentInfo[]>;
    /**
     * Get best bid/ask prices from slab
     * Note: In v0, this reads from mark price. Future versions will read from QuoteCache.
     * @param slabAddress Slab public key
     * @returns Best bid/ask prices
     */
    getBestPrices(slabAddress: PublicKey): Promise<BestPrices>;
    private deserializeSlabState;
    private deserializeFillReceipt;
}
