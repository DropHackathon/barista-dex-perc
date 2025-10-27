"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlabClient = void 0;
const web3_js_1 = require("@solana/web3.js");
const bn_js_1 = __importDefault(require("bn.js"));
const slab_1 = require("../types/slab");
const serialization_1 = require("../utils/serialization");
/**
 * Client for interacting with the Barista DEX Slab program
 */
class SlabClient {
    /**
     * Create a new SlabClient
     * @param connection Solana connection
     * @param programId Slab program ID
     * @param wallet Optional wallet keypair for signing transactions
     */
    constructor(connection, programId, wallet) {
        this.connection = connection;
        this.programId = programId;
        this.wallet = wallet;
    }
    // ============================================================================
    // PDA Derivation Methods
    // ============================================================================
    /**
     * Derive Slab PDA
     * @param lpOwner LP owner's public key
     * @param instrument Instrument (perp market) public key
     * @returns [PDA, bump]
     */
    deriveSlabPDA(lpOwner, instrument) {
        return web3_js_1.PublicKey.findProgramAddressSync([
            Buffer.from('slab'),
            lpOwner.toBuffer(),
            instrument.toBuffer(),
        ], this.programId);
    }
    /**
     * Derive Fill Receipt PDA
     * @param slab Slab public key
     * @param seqno Sequence number
     * @returns [PDA, bump]
     */
    deriveFillReceiptPDA(slab, seqno) {
        const seqnoBuffer = Buffer.alloc(4);
        seqnoBuffer.writeUInt32LE(seqno);
        return web3_js_1.PublicKey.findProgramAddressSync([
            Buffer.from('receipt'),
            slab.toBuffer(),
            seqnoBuffer,
        ], this.programId);
    }
    // ============================================================================
    // Account Fetching Methods
    // ============================================================================
    /**
     * Fetch Slab state account data
     * @param slab Slab public key
     * @returns Slab state data
     */
    async getSlabState(slab) {
        const accountInfo = await this.connection.getAccountInfo(slab);
        if (!accountInfo) {
            return null;
        }
        return this.deserializeSlabState(accountInfo.data);
    }
    /**
     * Fetch Fill Receipt account data
     * @param slab Slab public key
     * @param seqno Sequence number
     * @returns Fill receipt data
     */
    async getFillReceipt(slab, seqno) {
        const [receiptPDA] = this.deriveFillReceiptPDA(slab, seqno);
        const accountInfo = await this.connection.getAccountInfo(receiptPDA);
        if (!accountInfo) {
            return null;
        }
        return this.deserializeFillReceipt(accountInfo.data);
    }
    // ============================================================================
    // Instruction Builders
    // ============================================================================
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
    buildInitializeSlabInstruction(lpOwner, routerId, instrument, markPx, takerFeeBps, contractSize, payer) {
        const [slabPDA, bump] = this.deriveSlabPDA(lpOwner, instrument);
        // Data layout: lp_owner (32) + router_id (32) + instrument (32) + mark_px (8) + taker_fee_bps (8) + contract_size (8) + bump (1) = 121 bytes
        const data = (0, serialization_1.createInstructionData)(slab_1.SlabInstruction.Initialize, (0, serialization_1.serializePubkey)(lpOwner), (0, serialization_1.serializePubkey)(routerId), (0, serialization_1.serializePubkey)(instrument), (0, serialization_1.serializeI64)(markPx), (0, serialization_1.serializeI64)(takerFeeBps), (0, serialization_1.serializeI64)(contractSize), Buffer.from([bump]));
        return new web3_js_1.TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: slabPDA, isSigner: false, isWritable: true },
                { pubkey: payer, isSigner: true, isWritable: true },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data,
        });
    }
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
    buildCommitFillInstruction(slab, expectedSeqno, side, qty, limitPx, routerSigner) {
        // Get the next sequence number for receipt
        const [receiptPDA] = this.deriveFillReceiptPDA(slab, expectedSeqno);
        // Data layout: expected_seqno (4) + side (1) + qty (8) + limit_px (8) = 21 bytes
        const sideBuffer = Buffer.from([side === slab_1.OrderSide.Bid ? 0 : 1]);
        const data = (0, serialization_1.createInstructionData)(slab_1.SlabInstruction.CommitFill, (0, serialization_1.serializeU32)(expectedSeqno), sideBuffer, (0, serialization_1.serializeI64)(qty), (0, serialization_1.serializeI64)(limitPx));
        return new web3_js_1.TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: slab, isSigner: false, isWritable: true },
                { pubkey: receiptPDA, isSigner: false, isWritable: true },
                { pubkey: routerSigner, isSigner: true, isWritable: false },
            ],
            data,
        });
    }
    // ============================================================================
    // Higher-Level Methods (Stub implementations for future expansion)
    // ============================================================================
    /**
     * Get order book snapshot (stub - v0 doesn't have full order book)
     * @param slab Slab public key
     * @returns Order book snapshot
     */
    async getOrderBook(slab) {
        // In v0, we only have atomic fills, no persistent order book
        // This is a stub for future expansion
        const slabState = await this.getSlabState(slab);
        if (!slabState) {
            throw new Error('Slab not found');
        }
        return {
            bids: [],
            asks: [],
            lastUpdate: new bn_js_1.default(Date.now() / 1000),
        };
    }
    /**
     * Get recent trades (stub - requires indexing)
     * @param slab Slab public key
     * @param limit Number of trades to fetch
     * @returns Recent trades
     */
    async getRecentTrades(slab, limit = 20) {
        // This requires indexing fill receipts
        // Stub for future expansion
        return [];
    }
    /**
     * Get open orders for a user (stub - v0 doesn't have persistent orders)
     * @param slab Slab public key
     * @param user User's public key
     * @returns Open orders
     */
    async getOpenOrders(slab, user) {
        // v0 only has atomic fills, no persistent orders
        // Stub for future expansion
        return [];
    }
    /**
     * Get instruments in a slab (v0: returns 1, future: up to 32)
     * @param slabAddress Slab public key
     * @returns Array of instrument info
     */
    async getInstruments(slabAddress) {
        const state = await this.getSlabState(slabAddress);
        if (!state) {
            throw new Error('Slab not found');
        }
        // v0: Return single instrument
        return [{
                index: 0,
                pubkey: state.instrument,
                markPx: state.markPx,
                contractSize: state.contractSize,
                takerFeeBps: state.takerFeeBps,
            }];
        // Future: Parse multiple instruments from slab state when architecture supports it
    }
    /**
     * Get best bid/ask prices from slab
     * Note: In v0, this reads from mark price. Future versions will read from QuoteCache.
     * @param slabAddress Slab public key
     * @returns Best bid/ask prices
     */
    async getBestPrices(slabAddress) {
        const state = await this.getSlabState(slabAddress);
        if (!state) {
            throw new Error('Slab not found');
        }
        // v0: Use mark price as both bid and ask (atomic fills at limit price)
        // Future: Read QuoteCache from slab account at byte offset
        const markPrice = state.markPx;
        // Estimate spread as 1 tick (for display purposes)
        const tick = new bn_js_1.default(1000000); // $1 tick
        const bidPrice = markPrice.sub(tick.divn(2));
        const askPrice = markPrice.add(tick.divn(2));
        const bid = { price: bidPrice, size: new bn_js_1.default(0) };
        const ask = { price: askPrice, size: new bn_js_1.default(0) };
        const spread = askPrice.sub(bidPrice);
        // Calculate spread in basis points (spread / mid * 10000)
        const mid = bidPrice.add(askPrice).divn(2);
        const spreadBps = mid.isZero() ? new bn_js_1.default(0) : spread.mul(new bn_js_1.default(10000)).div(mid);
        return {
            bid,
            ask,
            spread,
            spreadBps,
        };
    }
    // ============================================================================
    // Deserialization Methods
    // ============================================================================
    deserializeSlabState(data) {
        let offset = 0;
        // NOTE: Native Solana programs (pinocchio) do NOT have discriminators
        // Unlike Anchor programs which start with 8-byte discriminator
        // SlabHeader layout (from programs/common/src/header.rs):
        // magic: [u8; 8]
        // version: u32
        // seqno: u32
        // program_id: Pubkey (32 bytes)
        // lp_owner: Pubkey (32 bytes)
        // router_id: Pubkey (32 bytes)
        // instrument: Pubkey (32 bytes)
        // contract_size: i64
        // tick: i64
        // lot: i64
        // mark_px: i64
        // taker_fee_bps: i64
        // bump: u8 (in offsets, not in header directly)
        // Skip magic (8 bytes)
        offset += 8;
        // version: u32
        offset += 4;
        // seqno: u32
        const seqno = data.readUInt32LE(offset);
        offset += 4;
        // program_id: Pubkey (32 bytes) - skip
        offset += 32;
        // lp_owner: Pubkey (32 bytes)
        const lpOwner = (0, serialization_1.deserializePubkey)(data, offset);
        offset += 32;
        // router_id: Pubkey (32 bytes)
        const routerId = (0, serialization_1.deserializePubkey)(data, offset);
        offset += 32;
        // instrument: Pubkey (32 bytes)
        const instrument = (0, serialization_1.deserializePubkey)(data, offset);
        offset += 32;
        // contract_size: i64
        const contractSize = (0, serialization_1.deserializeI64)(data, offset);
        offset += 8;
        // tick: i64 - skip
        offset += 8;
        // lot: i64 - skip
        offset += 8;
        // mark_px: i64
        const markPx = (0, serialization_1.deserializeI64)(data, offset);
        offset += 8;
        // taker_fee_bps: i64
        const takerFeeBps = (0, serialization_1.deserializeI64)(data, offset);
        offset += 8;
        // Note: bump is stored in SlabHeader but we derive it from seeds
        // For now, we'll set it to 0 as it's not critical for display
        const bump = 0;
        return {
            lpOwner,
            routerId,
            instrument,
            markPx,
            takerFeeBps,
            contractSize,
            seqno,
            bump,
        };
    }
    deserializeFillReceipt(data) {
        let offset = 0;
        // NOTE: Native Solana programs (pinocchio) do NOT have discriminators
        const slab = (0, serialization_1.deserializePubkey)(data, offset);
        offset += 32;
        const seqno = data.readUInt32LE(offset);
        offset += 4;
        const sideValue = data.readUInt8(offset);
        const side = sideValue === 0 ? slab_1.OrderSide.Bid : slab_1.OrderSide.Ask;
        offset += 1;
        const qty = (0, serialization_1.deserializeI64)(data, offset);
        offset += 8;
        const fillPx = (0, serialization_1.deserializeI64)(data, offset);
        offset += 8;
        const timestamp = (0, serialization_1.deserializeU64)(data, offset);
        return {
            slab,
            seqno,
            side,
            qty,
            fillPx,
            timestamp,
        };
    }
}
exports.SlabClient = SlabClient;
