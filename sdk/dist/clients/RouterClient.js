"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouterClient = void 0;
const web3_js_1 = require("@solana/web3.js");
const bn_js_1 = __importDefault(require("bn.js"));
const bs58_1 = __importDefault(require("bs58"));
const router_1 = require("../types/router");
const serialization_1 = require("../utils/serialization");
const constants_1 = require("../constants");
/**
 * Client for interacting with the Barista DEX Router program
 */
class RouterClient {
    /**
     * Create a new RouterClient
     * @param connection Solana connection
     * @param programId Router program ID
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
     * Derive Portfolio PDA for a user
     * @param user User's public key
     * @returns [PDA, bump]
     */
    derivePortfolioPDA(user) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('portfolio'), user.toBuffer()], this.programId);
    }
    /**
     * Derive Vault PDA for a token mint
     * @param mint Token mint public key
     * @returns [PDA, bump]
     */
    deriveVaultPDA(mint) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('vault'), mint.toBuffer()], this.programId);
    }
    /**
     * Derive Registry PDA
     * PDA seeds: ["registry"]
     * @returns [PDA, bump]
     */
    deriveRegistryPDA() {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('registry')], this.programId);
    }
    /**
     * Derive Authority PDA
     * @returns [PDA, bump]
     */
    deriveAuthorityPDA() {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('authority')], this.programId);
    }
    /**
     * Derive PositionDetails PDA for a specific position
     * PDA seeds: ["position", portfolio_pda, slab_index (u16 LE), instrument_index (u16 LE)]
     * @param portfolioPda Portfolio PDA address
     * @param slabIndex Slab index in registry (u16)
     * @param instrumentIndex Instrument index in slab (u16)
     * @returns [PDA, bump]
     */
    derivePositionDetailsPDA(portfolioPda, slabIndex, instrumentIndex) {
        const slabIndexBuffer = Buffer.alloc(2);
        slabIndexBuffer.writeUInt16LE(slabIndex);
        const instrumentIndexBuffer = Buffer.alloc(2);
        instrumentIndexBuffer.writeUInt16LE(instrumentIndex);
        return web3_js_1.PublicKey.findProgramAddressSync([
            Buffer.from('position'),
            portfolioPda.toBuffer(),
            slabIndexBuffer,
            instrumentIndexBuffer,
        ], this.programId);
    }
    /**
     * Derive Receipt PDA for a slab fill
     * @param slab Slab market public key
     * @param user User's public key
     * @returns [PDA, bump]
     */
    deriveReceiptPDA(slab, user) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('receipt'), slab.toBuffer(), user.toBuffer()], this.programId);
    }
    /**
     * Create ephemeral receipt account for trade execution
     * Receipts are temporary accounts that the slab writes fill data to
     * They're created per-transaction and can be discarded after
     * @param payer Payer for the account creation
     * @param owner Program ID that will own the receipt (slab program)
     * @returns [instruction to create receipt, receipt keypair]
     */
    async createReceiptAccount(payer, owner) {
        // FillReceipt size: 48 bytes (u32 + u32 + i64*5)
        const RECEIPT_SIZE = 48;
        const lamports = await this.connection.getMinimumBalanceForRentExemption(RECEIPT_SIZE);
        // Create ephemeral keypair for receipt
        const receiptKeypair = web3_js_1.Keypair.generate();
        // Create account owned by slab program (so slab can write to it)
        const createIx = web3_js_1.SystemProgram.createAccount({
            fromPubkey: payer,
            newAccountPubkey: receiptKeypair.publicKey,
            lamports,
            space: RECEIPT_SIZE,
            programId: owner, // Must be owned by slab program for it to write
        });
        return [createIx, receiptKeypair];
    }
    // ============================================================================
    // Account Fetching Methods
    // ============================================================================
    /**
     * Fetch Portfolio account data
     * NOTE: Portfolio uses create_with_seed (NOT PDA)
     * @param user User's public key
     * @returns Portfolio data
     */
    async getPortfolio(user) {
        const portfolioAddress = await this.derivePortfolioAddress(user);
        const accountInfo = await this.connection.getAccountInfo(portfolioAddress);
        if (!accountInfo) {
            return null;
        }
        try {
            return this.deserializePortfolio(accountInfo.data);
        }
        catch (error) {
            console.error('DEBUG: Deserialization error:', error);
            return null;
        }
    }
    /**
     * Fetch Registry account data
     * @returns Registry data
     */
    async getRegistry() {
        const [registryPDA] = this.deriveRegistryPDA();
        const accountInfo = await this.connection.getAccountInfo(registryPDA);
        if (!accountInfo) {
            return null;
        }
        return this.deserializeRegistry(accountInfo.data);
    }
    /**
     * Get oracle account for a specific slab
     * Reads the SlabRegistry to find the registered oracle for this slab
     * @param slabMarket Slab market public key
     * @returns Oracle public key, or null if slab not found in registry
     */
    async getOracleForSlab(slabMarket) {
        const registry = await this.getRegistry();
        if (!registry) {
            throw new Error('Registry account not found');
        }
        // Search for slab in registry
        const slabEntry = registry.slabs.find((entry) => entry.slabId.equals(slabMarket) && entry.active);
        if (!slabEntry) {
            return null; // Slab not registered
        }
        return slabEntry.oracleId;
    }
    /**
     * Fetch DLP owner (lp_owner) from slab header
     * Required for v0.5 PnL settlement - DLP Portfolio acts as counterparty
     * @param slabMarket Slab market public key
     * @returns DLP owner public key (lp_owner field from slab header)
     */
    async getDlpOwnerForSlab(slabMarket) {
        const accountInfo = await this.connection.getAccountInfo(slabMarket);
        if (!accountInfo) {
            return null; // Slab account not found
        }
        // SlabHeader layout (from programs/common/src/header.rs):
        // - magic: [u8; 8] = offset 0-7
        // - version: u32 = offset 8-11
        // - seqno: u32 = offset 12-15
        // - program_id: Pubkey = offset 16-47
        // - lp_owner: Pubkey = offset 48-79
        if (accountInfo.data.length < 80) {
            throw new Error('Invalid slab account data');
        }
        const lpOwnerBytes = accountInfo.data.slice(48, 80);
        return new web3_js_1.PublicKey(lpOwnerBytes);
    }
    /**
     * Fetch Vault account data
     * @param mint Token mint public key
     * @returns Vault data
     */
    async getVault(mint) {
        const [vaultPDA] = this.deriveVaultPDA(mint);
        const accountInfo = await this.connection.getAccountInfo(vaultPDA);
        if (!accountInfo) {
            return null;
        }
        return this.deserializeVault(accountInfo.data);
    }
    /**
     * Get all registered slabs from on-chain accounts
     * Note: In v0, this requires scanning for slab accounts by owner (slab program).
     * Future: Registry will maintain a list of registered slabs.
     * @param slabProgramId Slab program ID to scan for
     * @returns Array of slab info
     */
    async getAllSlabs(slabProgramId) {
        // Get all accounts owned by the slab program
        // Filter by magic bytes "PERP10\0\0" at offset 0 to identify slab accounts
        // This is more robust than dataSize filtering - works even if slab size changes
        const magicBytes = Buffer.from('PERP10\0\0', 'utf-8');
        const accounts = await this.connection.getProgramAccounts(slabProgramId, {
            filters: [
                {
                    memcmp: {
                        offset: 0,
                        bytes: bs58_1.default.encode(magicBytes), // Solana RPC expects base58 encoding
                    },
                },
            ],
        });
        const slabs = [];
        for (const { pubkey, account } of accounts) {
            try {
                // Parse slab state (simplified for v0)
                // Assuming SlabState layout: magic(8) + version(4) + seqno(4) + program_id(32) + lp_owner(32) + router_id(32) + instrument(32) + ...
                let offset = 0;
                // Skip magic (8 bytes)
                offset += 8;
                // Skip version (4 bytes)
                offset += 4;
                // Read seqno (4 bytes)
                const seqno = account.data.readUInt32LE(offset);
                offset += 4;
                // Skip program_id (32 bytes)
                offset += 32;
                // Read lp_owner (32 bytes)
                const lpOwner = new web3_js_1.PublicKey(account.data.slice(offset, offset + 32));
                offset += 32;
                // Skip router_id (32 bytes)
                offset += 32;
                // Read instrument (32 bytes)
                const instrument = new web3_js_1.PublicKey(account.data.slice(offset, offset + 32));
                offset += 32;
                // Read contract_size (8 bytes, i64)
                const contractSize = new bn_js_1.default(account.data.readBigInt64LE(offset).toString());
                offset += 8;
                // Skip tick (8 bytes)
                offset += 8;
                // Skip lot (8 bytes)
                offset += 8;
                // Read mark_px (8 bytes, i64)
                const markPx = new bn_js_1.default(account.data.readBigInt64LE(offset).toString());
                offset += 8;
                // Read taker_fee_bps (8 bytes, i64)
                const takerFeeBps = new bn_js_1.default(account.data.readBigInt64LE(offset).toString());
                slabs.push({
                    address: pubkey,
                    lpOwner,
                    instrument,
                    markPx,
                    takerFeeBps,
                    contractSize,
                    seqno,
                });
            }
            catch (err) {
                // Skip invalid accounts
                continue;
            }
        }
        return slabs;
    }
    /**
     * Find slabs trading a specific instrument
     * @param instrumentId Instrument public key
     * @param slabProgramId Slab program ID to scan
     * @returns Array of slab addresses
     */
    async getSlabsForInstrument(instrumentId, slabProgramId) {
        const allSlabs = await this.getAllSlabs(slabProgramId);
        return allSlabs
            .filter(s => s.instrument.equals(instrumentId))
            .map(s => s.address);
    }
    // ============================================================================
    // Leverage & Margin Validation Helpers
    // ============================================================================
    /**
     * NEW MODEL: quantity represents margin/equity committed, leverage multiplies it
     *
     * Calculate actual position size from margin committed
     *
     * @param marginCommitted Equity user wants to commit (quantity * price in CLI)
     * @param leverage Leverage multiplier (1 = spot, 2-10 = margin). Default: 1 (spot)
     * @returns Actual position notional value
     *
     * Examples:
     * - quantity=100, price=10 -> margin_committed = 1000
     * - Spot (1x): position = 1000 (buy 1000 worth)
     * - 5x leverage: position = 5000 (buy 5000 worth with 1000 margin)
     * - 10x leverage: position = 10000 (buy 10000 worth with 1000 margin)
     */
    calculatePositionSize(marginCommitted, leverage = 1) {
        return marginCommitted.mul(new bn_js_1.default(leverage));
    }
    /**
     * Calculate actual quantity (contracts) to trade based on margin and leverage
     *
     * @param quantityInput User's input quantity (represents margin to commit)
     * @param price Price per unit (1e6 scale)
     * @param leverage Leverage multiplier. Default: 1 (spot)
     * @returns Actual quantity to execute on-chain
     *
     * Examples:
     * - Input: qty=100, price=10 USDC, leverage=5x
     * - Margin committed: 100 * 10 = 1000 USDC
     * - Position size: 1000 * 5 = 5000 USDC
     * - Actual quantity: 5000 / 10 = 500 contracts
     */
    calculateActualQuantity(quantityInput, price, leverage = 1) {
        // quantityInput represents margin to commit
        // Actual position = margin * leverage
        // Example: 100 units margin at 5x = 500 units position = 500/price contracts
        // Simplified: actualQuantity = quantityInput * leverage
        return quantityInput.mul(new bn_js_1.default(leverage));
    }
    /**
     * Validate if user has sufficient equity for a leveraged trade
     *
     * @param user User's public key
     * @param quantityInput User's input quantity (margin to commit, NOT position size)
     * @param price Price per unit (1e6 scale)
     * @param leverage Leverage multiplier (1 = spot, 2-10 = margin). Default: 1 (spot)
     * @returns Validation result
     *
     * @throws Error if portfolio doesn't exist or cannot be fetched
     */
    async validateLeveragedPosition(user, quantityInput, price, leverage = 1) {
        // Validate leverage range
        if (leverage < 1 || leverage > 10) {
            throw new Error('Leverage must be between 1x and 10x');
        }
        // Get portfolio equity
        const portfolio = await this.getPortfolio(user);
        // If portfolio doesn't exist, it will be auto-created with 0 equity
        // Validation will fail (valid = false) but we return the calculation results
        // Convert equity from lamports to 1e6 scale (units) for consistency
        // 1 SOL = 1e9 lamports = 1e6 units, so divide by 1000
        const equityLamports = portfolio ? new bn_js_1.default(portfolio.equity.toString()) : new bn_js_1.default(0);
        const availableEquity = equityLamports.div(new bn_js_1.default(1000));
        // quantityInput represents margin to commit (in units, NOT USD value)
        // 1 unit = 1 contract = 1 underlying asset (e.g., 1 SOL)
        // Margin committed = quantityInput (price is irrelevant)
        const marginCommitted = quantityInput;
        // Calculate actual position: margin * leverage
        const actualQuantity = this.calculateActualQuantity(quantityInput, price, leverage);
        // Position size in value terms (for display): actualQuantity * price / 1e6
        const positionSize = actualQuantity.mul(price).div(new bn_js_1.default(1000000));
        // Check if equity >= margin committed
        const valid = availableEquity.gte(marginCommitted);
        return {
            valid,
            availableEquity,
            marginCommitted,
            actualQuantity,
            positionSize,
            leverage,
            mode: leverage === 1 ? 'spot' : 'margin',
        };
    }
    /**
     * Calculate maximum quantity input for available equity
     *
     * @param user User's public key
     * @param price Price per unit (1e6 scale)
     * @param leverage Leverage multiplier (1 = spot, 2-10 = margin). Default: 1 (spot)
     * @returns Maximum quantity user can input (will be leveraged automatically)
     *
     * Examples:
     * - equity = 1000 USDC, price = 10 USDC, leverage = 1x -> max_input = 100
     * - equity = 1000 USDC, price = 10 USDC, leverage = 5x -> max_input = 100 (still!)
     *   (Because input represents margin, actual position will be 500 contracts)
     */
    async calculateMaxQuantityInput(user, price, leverage = 1) {
        // Validate leverage range
        if (leverage < 1 || leverage > 10) {
            throw new Error('Leverage must be between 1x and 10x');
        }
        // Get portfolio equity
        const portfolio = await this.getPortfolio(user);
        if (!portfolio) {
            // Portfolio doesn't exist yet - return 0 (will be auto-created on first trade)
            return new bn_js_1.default(0);
        }
        const availableEquity = new bn_js_1.default(portfolio.equity.toString());
        // max_quantity_input = equity / price * 1e6
        // Note: leverage doesn't affect this - it just multiplies the actual position
        return availableEquity.mul(new bn_js_1.default(1000000)).div(price);
    }
    /**
     * Get market price from slab (uses mark price)
     *
     * @param slabMarket Slab market address
     * @param slabProgramId Slab program ID
     * @returns Mark price (1e6 scale)
     */
    async getMarketPrice(slabMarket, slabProgramId) {
        const accountInfo = await this.connection.getAccountInfo(slabMarket);
        if (!accountInfo) {
            throw new Error(`Slab market not found: ${slabMarket.toBase58()}`);
        }
        // Parse slab state to get markPx
        // Layout: discriminator(8) + version(4) + seqno(4) + program_id(32) + lp_owner(32) +
        //         router_id(32) + instrument(32) + contract_size(8) + tick(8) + lot(8) + mark_px(8)
        let offset = 8 + 4 + 4 + 32 + 32 + 32 + 32 + 8 + 8 + 8; // = 176
        const markPx = new bn_js_1.default(accountInfo.data.readBigInt64LE(offset).toString());
        return markPx;
    }
    // ============================================================================
    // Smart Routing Methods
    // ============================================================================
    /**
     * Parse QuoteCache from slab account data
     * QuoteCache is located at offset 256 (after SlabHeader)
     *
     * @param data Slab account data buffer
     * @param offset Offset to QuoteCache (default 256)
     * @returns Parsed QuoteCache with best bid/ask levels
     */
    parseQuoteCache(data, offset = 256) {
        let pos = offset;
        // Read seqno_snapshot (u32)
        const seqnoSnapshot = data.readUInt32LE(pos);
        pos += 4;
        pos += 4; // Skip padding
        // Read best_bids[4] - each level is 16 bytes (px: i64, avail_qty: i64)
        const bestBids = [];
        for (let i = 0; i < 4; i++) {
            const px = new bn_js_1.default(data.readBigInt64LE(pos).toString());
            pos += 8;
            const availQty = new bn_js_1.default(data.readBigInt64LE(pos).toString());
            pos += 8;
            // Only include levels with non-zero price or quantity
            if (!px.isZero() || !availQty.isZero()) {
                bestBids.push({ price: px, availableQty: availQty });
            }
        }
        // Read best_asks[4] - each level is 16 bytes (px: i64, avail_qty: i64)
        const bestAsks = [];
        for (let i = 0; i < 4; i++) {
            const px = new bn_js_1.default(data.readBigInt64LE(pos).toString());
            pos += 8;
            const availQty = new bn_js_1.default(data.readBigInt64LE(pos).toString());
            pos += 8;
            // Only include levels with non-zero price or quantity
            if (!px.isZero() || !availQty.isZero()) {
                bestAsks.push({ price: px, availableQty: availQty });
            }
        }
        return {
            seqnoSnapshot,
            bestBids,
            bestAsks,
        };
    }
    /**
     * Get detailed quotes from a slab (includes QuoteCache with best bid/ask levels)
     * Used for smart routing and price discovery
     *
     * @param slabMarket Slab market address
     * @returns Slab quotes with instrument, mark price, and quote cache
     */
    async getSlabQuotes(slabMarket) {
        const accountInfo = await this.connection.getAccountInfo(slabMarket);
        if (!accountInfo) {
            throw new Error(`Slab market not found: ${slabMarket.toBase58()}`);
        }
        // Parse SlabHeader fields
        // instrument: Pubkey at offset 80 (after magic, version, seqno, program_id, lp_owner, router_id)
        const instrument = new web3_js_1.PublicKey(accountInfo.data.slice(80, 112));
        // mark_px: i64 at offset 176 (after instrument, contract_size, tick, lot)
        const markPrice = new bn_js_1.default(accountInfo.data.readBigInt64LE(176).toString());
        // Parse QuoteCache at offset 256 (after SlabHeader which is 256 bytes)
        const cache = this.parseQuoteCache(accountInfo.data, 256);
        return {
            slab: slabMarket,
            instrument,
            markPrice,
            cache,
        };
    }
    /**
     * Find the best slab for a trade using smart routing
     * Compares prices across all slabs trading the same instrument
     *
     * @param instrumentId Instrument public key to trade
     * @param side 'buy' or 'sell'
     * @param quantity Desired quantity (for liquidity checking)
     * @param slabProgramId Slab program ID
     * @returns Best slab with price and available liquidity
     */
    async findBestSlabForTrade(instrumentId, side, quantity, slabProgramId) {
        // 1. Get all slabs trading this instrument
        const slabAddresses = await this.getSlabsForInstrument(instrumentId, slabProgramId);
        if (slabAddresses.length === 0) {
            throw new Error(`No slabs found for instrument ${instrumentId.toBase58()}`);
        }
        // 2. Fetch quotes from all slabs in parallel
        const slabQuotesPromises = slabAddresses.map(async (slab) => {
            try {
                return await this.getSlabQuotes(slab);
            }
            catch (err) {
                // Skip slabs that fail to fetch
                return null;
            }
        });
        const slabQuotes = await Promise.all(slabQuotesPromises);
        // Filter out nulls (failed fetches)
        const validQuotes = slabQuotes.filter((q) => q !== null);
        if (validQuotes.length === 0) {
            throw new Error('Failed to fetch quotes from any slab');
        }
        // 3. Find best price across all slabs
        let bestSlab = null;
        let bestPrice = null;
        let bestAvailQty = null;
        let totalLiquidityAtLevel = new bn_js_1.default(0);
        for (const quotes of validQuotes) {
            // Select appropriate side (buy looks at asks, sell looks at bids)
            const levels = side === 'buy' ? quotes.cache.bestAsks : quotes.cache.bestBids;
            if (levels.length === 0)
                continue; // No liquidity
            const topLevel = levels[0]; // Best price is always first
            if (topLevel.availableQty.isZero())
                continue; // No quantity available
            // For buy: lower price is better (cheaper)
            // For sell: higher price is better (more revenue)
            const isBetter = !bestPrice ||
                (side === 'buy'
                    ? topLevel.price.lt(bestPrice)
                    : topLevel.price.gt(bestPrice));
            if (isBetter) {
                bestSlab = quotes.slab;
                bestPrice = topLevel.price;
                bestAvailQty = topLevel.availableQty;
                // Calculate total liquidity at this price level across all slabs
                totalLiquidityAtLevel = validQuotes
                    .filter(q => {
                    const lvl = side === 'buy' ? q.cache.bestAsks[0] : q.cache.bestBids[0];
                    return lvl && lvl.price.eq(topLevel.price);
                })
                    .reduce((sum, q) => {
                    const lvl = side === 'buy' ? q.cache.bestAsks[0] : q.cache.bestBids[0];
                    return sum.add(lvl.availableQty);
                }, new bn_js_1.default(0));
            }
        }
        if (!bestSlab || !bestPrice || !bestAvailQty) {
            throw new Error('No liquidity available across any slabs');
        }
        // 4. Check if sufficient liquidity exists
        if (bestAvailQty.lt(quantity)) {
            throw new Error(`Insufficient liquidity: requested ${quantity.toString()}, available ${bestAvailQty.toString()} at best price`);
        }
        return {
            slab: bestSlab,
            price: bestPrice,
            availableQty: bestAvailQty,
            totalLiquidity: totalLiquidityAtLevel,
        };
    }
    // ============================================================================
    // Instruction Builders
    // ============================================================================
    /**
     * Build Initialize instruction for SlabRegistry
     * Initializes the global registry account with governance authority
     * @param payer Public key paying for account creation
     * @param governance Governance authority public key
     * @returns TransactionInstruction
     */
    buildInitializeInstruction(payer, governance) {
        const [registryPDA] = this.deriveRegistryPDA();
        const data = (0, serialization_1.createInstructionData)(router_1.RouterInstruction.Initialize, (0, serialization_1.serializePubkey)(governance));
        return new web3_js_1.TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: registryPDA, isSigner: false, isWritable: true },
                { pubkey: payer, isSigner: true, isWritable: true },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data,
        });
    }
    /**
     * Build instructions to initialize SlabRegistry
     * The router program creates the registry PDA account via CPI during initialization
     * @param payer Public key paying for account creation and rent
     * @param governance Governance authority public key (defaults to payer)
     * @returns Single instruction to initialize registry (program creates PDA internally)
     */
    async buildInitializeRegistryInstructions(payer, governance) {
        const governanceKey = governance || payer;
        // The Initialize instruction creates the registry PDA account via CPI
        // No need for separate createAccount instruction
        const initializeIx = this.buildInitializeInstruction(payer, governanceKey);
        return [initializeIx];
    }
    /**
     * Derive registry address (PDA)
     * The registry account is a PDA with seed "registry"
     * @returns Registry PDA address
     */
    deriveRegistryAddress() {
        const [registryPDA] = this.deriveRegistryPDA();
        return registryPDA;
    }
    /**
     * Check if SlabRegistry is initialized
     * @returns true if registry exists and is initialized
     */
    async isRegistryInitialized() {
        const registryAddress = this.deriveRegistryAddress();
        const accountInfo = await this.connection.getAccountInfo(registryAddress);
        return accountInfo !== null && accountInfo.owner.equals(this.programId);
    }
    /**
     * Build Deposit instruction (SOL only)
     * Deposits SOL from user's wallet to their portfolio account
     * @param amount Amount of lamports to deposit (u64)
     * @param user User's public key
     * @returns TransactionInstruction
     */
    async buildDepositInstruction(amount, user) {
        const portfolioAddress = await this.derivePortfolioAddress(user);
        const data = (0, serialization_1.createInstructionData)(router_1.RouterInstruction.Deposit, (0, serialization_1.serializeU64)(amount));
        return new web3_js_1.TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: portfolioAddress, isSigner: false, isWritable: true },
                { pubkey: user, isSigner: true, isWritable: true },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data,
        });
    }
    /**
     * Build Withdraw instruction (SOL only)
     * Withdraws SOL from portfolio account to user's wallet
     * @param amount Amount of lamports to withdraw (u64)
     * @param user User's public key
     * @returns TransactionInstruction
     */
    async buildWithdrawInstruction(amount, user) {
        const portfolioAddress = await this.derivePortfolioAddress(user);
        const [registryPDA] = this.deriveRegistryPDA();
        const data = (0, serialization_1.createInstructionData)(router_1.RouterInstruction.Withdraw, (0, serialization_1.serializeU64)(amount));
        return new web3_js_1.TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: portfolioAddress, isSigner: false, isWritable: true },
                { pubkey: user, isSigner: true, isWritable: true },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: registryPDA, isSigner: false, isWritable: false },
            ],
            data,
        });
    }
    /**
     * Derive portfolio account address using create_with_seed
     * NOTE: Portfolio uses create_with_seed (NOT PDA) to bypass 10KB CPI limit
     * @param user User's public key
     * @returns Portfolio address
     */
    async derivePortfolioAddress(user) {
        return await web3_js_1.PublicKey.createWithSeed(user, 'portfolio', this.programId);
    }
    /**
     * Initialize a portfolio account for a user
     * Creates the portfolio account and initializes it in a single transaction
     * NOTE: Portfolio uses create_with_seed (NOT PDA) to bypass 10KB CPI limit
     * @param user User's public key (must be signer)
     * @param portfolioSize Size of portfolio account in bytes (default: 133008 = Portfolio::LEN)
     * @returns Array of instructions [createAccountInstruction, initializeInstruction]
     */
    async buildInitializePortfolioInstructions(user, portfolioSize = constants_1.PORTFOLIO_SIZE // Portfolio::LEN (exact size from programs/router/src/state/portfolio.rs)
    ) {
        // Derive portfolio address using create_with_seed
        const portfolioAddress = await this.derivePortfolioAddress(user);
        // Get rent exemption amount
        const rentExemption = await this.connection.getMinimumBalanceForRentExemption(portfolioSize);
        // Instruction 1: Create account with seed
        const createAccountIx = web3_js_1.SystemProgram.createAccountWithSeed({
            fromPubkey: user,
            newAccountPubkey: portfolioAddress,
            basePubkey: user,
            seed: 'portfolio',
            lamports: rentExemption,
            space: portfolioSize,
            programId: this.programId,
        });
        // Instruction 2: Initialize portfolio
        // Data format: [discriminator (1 byte), user_pubkey (32 bytes)]
        const instructionData = Buffer.alloc(33);
        instructionData.writeUInt8(router_1.RouterInstruction.InitializePortfolio, 0);
        user.toBuffer().copy(instructionData, 1);
        const initializeIx = new web3_js_1.TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: portfolioAddress, isSigner: false, isWritable: true },
                { pubkey: user, isSigner: true, isWritable: true },
            ],
            data: instructionData,
        });
        return [createAccountIx, initializeIx];
    }
    /**
     * Ensure portfolio exists, creating it if necessary
     * Returns instructions to prepend to transaction if portfolio doesn't exist
     * @param user User's public key
     * @returns Array of instructions (empty if portfolio exists, initialization instructions if not)
     */
    async ensurePortfolioInstructions(user) {
        const portfolioAddress = await this.derivePortfolioAddress(user);
        const accountInfo = await this.connection.getAccountInfo(portfolioAddress);
        // Portfolio already exists
        if (accountInfo && accountInfo.owner.equals(this.programId)) {
            return [];
        }
        // Portfolio doesn't exist, return initialization instructions
        return await this.buildInitializePortfolioInstructions(user);
    }
    /**
     * Build InitializePortfolio instruction (DEPRECATED - use buildInitializePortfolioInstructions)
     * @deprecated This method incorrectly uses PDA. Use buildInitializePortfolioInstructions instead.
     * @param user User's public key
     * @returns TransactionInstruction
     */
    buildInitializePortfolioInstruction(user) {
        const [portfolioPDA] = this.derivePortfolioPDA(user);
        const [registryPDA] = this.deriveRegistryPDA();
        const data = (0, serialization_1.createInstructionData)(router_1.RouterInstruction.InitializePortfolio);
        return new web3_js_1.TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: portfolioPDA, isSigner: false, isWritable: true },
                { pubkey: registryPDA, isSigner: false, isWritable: true },
                { pubkey: user, isSigner: true, isWritable: true },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: web3_js_1.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
            ],
            data,
        });
    }
    /**
     * Build ExecuteCrossSlab instruction (v0.5 with PnL settlement)
     * Routes a trade across slab markets with real SOL settlement against DLP
     * @param user User's public key
     * @param splits Array of slab splits (each includes oracle and dlpOwner)
     * @param orderType Market (0) or Limit (1) order
     * @returns {instruction, receiptSetup, receiptKeypair} - execution instruction, receipt creation instruction, and receipt keypair
     */
    async buildExecuteCrossSlabInstruction(user, splits, orderType = router_1.ExecutionType.Limit, leverage = 1) {
        // v0.5: Single slab only (cross-slab routing disabled)
        if (splits.length !== 1) {
            throw new Error('v0.5 only supports single slab execution (cross-slab routing disabled)');
        }
        const userPortfolioAddress = await this.derivePortfolioAddress(user);
        const [registryPDA] = this.deriveRegistryPDA();
        const [authorityPDA] = this.deriveAuthorityPDA();
        // Derive DLP Portfolio from lp_owner field in slab
        // Note: splits[0].dlpOwner must be provided by caller (fetched from slab header)
        if (!splits[0].dlpOwner) {
            throw new Error('DLP owner (lp_owner) must be provided in slab split');
        }
        const dlpPortfolioAddress = await this.derivePortfolioAddress(splits[0].dlpOwner);
        // Serialize instruction data:
        // - num_splits (u8)
        // - order_type (u8)
        // - leverage (u8) - 1-10x leverage
        // - For each split: side (u8) + qty (i64) + limit_px (i64)
        // Validate leverage
        if (leverage < 1 || leverage > 10) {
            throw new Error('Leverage must be between 1x and 10x');
        }
        const numSplits = Buffer.from([splits.length]);
        const orderTypeBuffer = Buffer.from([orderType]);
        const leverageBuffer = Buffer.from([leverage]);
        const splitBuffers = splits.map((split) => {
            const qtyBuffer = (0, serialization_1.serializeI64)(split.qty);
            return Buffer.concat([
                Buffer.from([split.side]),
                qtyBuffer,
                (0, serialization_1.serializeI64)(split.limitPx),
            ]);
        });
        const data = (0, serialization_1.createInstructionData)(router_1.RouterInstruction.ExecuteCrossSlab, numSplits, orderTypeBuffer, leverageBuffer, ...splitBuffers);
        // Build account list (v0.5 layout with PositionDetails):
        // 0. user_portfolio (writable)
        // 1. user (signer)
        // 2. dlp_portfolio (writable) - counterparty
        // 3. registry (writable)
        // 4. router_authority (PDA)
        // 5. system_program (for SOL transfers)
        // 6. slab_program (for CPI to slab)
        // 7..7+n. slab_accounts (writable)
        // 7+n..7+2n. receipt_accounts (writable)
        // 7+2n..7+3n. oracle_accounts (readonly)
        // 7+3n..7+4n. position_details_accounts (writable)
        // Get slab program ID (needed for CPI and receipt creation)
        const slabAccountInfo = await this.connection.getAccountInfo(splits[0].slabMarket);
        if (!slabAccountInfo) {
            throw new Error(`Slab account not found: ${splits[0].slabMarket.toBase58()}`);
        }
        const slabProgramId = slabAccountInfo.owner;
        const keys = [
            { pubkey: userPortfolioAddress, isSigner: false, isWritable: true },
            { pubkey: user, isSigner: true, isWritable: true }, // Writable: pays for PositionDetails PDA rent
            { pubkey: dlpPortfolioAddress, isSigner: false, isWritable: true },
            { pubkey: registryPDA, isSigner: false, isWritable: true },
            { pubkey: authorityPDA, isSigner: false, isWritable: false },
            { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: slabProgramId, isSigner: false, isWritable: false },
        ];
        // Add slab accounts
        for (const split of splits) {
            keys.push({ pubkey: split.slabMarket, isSigner: false, isWritable: true });
        }
        // Create ephemeral receipt account (owned by slab program so it can write to it)
        const [receiptSetup, receiptKeypair] = await this.createReceiptAccount(user, slabProgramId);
        // Add receipt account (writable, will be written by slab)
        keys.push({ pubkey: receiptKeypair.publicKey, isSigner: false, isWritable: true });
        // Add oracle accounts
        for (const split of splits) {
            keys.push({ pubkey: split.oracle, isSigner: false, isWritable: false });
        }
        // Add PositionDetails accounts (one per split)
        // For v0.5: We need to derive PositionDetails PDA for each position
        // The challenge: slab_index depends on registry lookup, which we don't have client-side
        // Solution: For v0.5 single-slab, fetch registry and lookup slab_index
        const registry = await this.getRegistry();
        if (!registry) {
            throw new Error('Registry not found');
        }
        for (const split of splits) {
            // Find slab index in registry
            let slabIndex = -1;
            for (let i = 0; i < registry.slabCount; i++) {
                if (registry.slabs[i].slabId.equals(split.slabMarket)) {
                    slabIndex = i;
                    break;
                }
            }
            // If slab not found, use index 0 (will be auto-registered by router)
            // The router auto-registers unknown slabs during execution
            if (slabIndex === -1) {
                slabIndex = registry.slabCount; // Next available index
            }
            const instrumentIndex = 0; // v0: single instrument per slab
            const [positionDetailsPDA] = this.derivePositionDetailsPDA(userPortfolioAddress, slabIndex, instrumentIndex);
            keys.push({ pubkey: positionDetailsPDA, isSigner: false, isWritable: true });
        }
        const instruction = new web3_js_1.TransactionInstruction({
            programId: this.programId,
            keys,
            data,
        });
        return { instruction, receiptSetup, receiptKeypair };
    }
    /**
     * Build LiquidateUser instruction
     * @param params Liquidation parameters
     * @returns TransactionInstruction
     */
    buildLiquidateUserInstruction(params) {
        const [portfolioPDA] = this.derivePortfolioPDA(params.portfolio // Note: portfolio is the target user's portfolio pubkey
        );
        const data = (0, serialization_1.createInstructionData)(router_1.RouterInstruction.LiquidateUser, (0, serialization_1.serializeBool)(params.isPreliq), (0, serialization_1.serializeU64)(params.currentTs));
        // Build dynamic account list
        const keys = [
            { pubkey: portfolioPDA, isSigner: false, isWritable: true },
            { pubkey: this.wallet?.publicKey || web3_js_1.PublicKey.default, isSigner: true, isWritable: false },
        ];
        // Add oracle accounts
        for (const oracle of params.oracles) {
            keys.push({ pubkey: oracle, isSigner: false, isWritable: false });
        }
        // Add slab accounts
        for (const slab of params.slabs) {
            keys.push({ pubkey: slab, isSigner: false, isWritable: true });
        }
        return new web3_js_1.TransactionInstruction({
            programId: this.programId,
            keys,
            data,
        });
    }
    /**
     * Build BurnLpShares instruction
     * @param params Burn LP shares parameters
     * @returns TransactionInstruction
     */
    buildBurnLpSharesInstruction(params) {
        const [portfolioPDA] = this.derivePortfolioPDA(params.user);
        const data = (0, serialization_1.createInstructionData)(router_1.RouterInstruction.BurnLpShares, (0, serialization_1.serializePubkey)(params.marketId), (0, serialization_1.serializeU64)(params.sharesToBurn), (0, serialization_1.serializeI64)(params.currentSharePrice), (0, serialization_1.serializeU64)(params.currentTs), (0, serialization_1.serializeU64)(params.maxStalenessSeconds));
        return new web3_js_1.TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: portfolioPDA, isSigner: false, isWritable: true },
                { pubkey: params.user, isSigner: true, isWritable: false },
                { pubkey: params.marketId, isSigner: false, isWritable: true },
            ],
            data,
        });
    }
    /**
     * Build CancelLpOrders instruction
     * @param params Cancel LP orders parameters
     * @returns TransactionInstruction
     */
    buildCancelLpOrdersInstruction(params) {
        const [portfolioPDA] = this.derivePortfolioPDA(params.user);
        // Limit to 16 orders
        if (params.orderIds.length > 16) {
            throw new Error('Cannot cancel more than 16 orders at once');
        }
        // Serialize: num_orders (u8) + order_ids + freed_quote + freed_base
        const numOrders = Buffer.from([params.orderIds.length]);
        const orderIdBuffers = params.orderIds.map((id) => (0, serialization_1.serializeU64)(id));
        const data = (0, serialization_1.createInstructionData)(router_1.RouterInstruction.CancelLpOrders, (0, serialization_1.serializePubkey)(params.marketId), numOrders, ...orderIdBuffers, (0, serialization_1.serializeU128)(params.freedQuote), (0, serialization_1.serializeU128)(params.freedBase));
        return new web3_js_1.TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: portfolioPDA, isSigner: false, isWritable: true },
                { pubkey: params.user, isSigner: true, isWritable: false },
                { pubkey: params.marketId, isSigner: false, isWritable: true },
            ],
            data,
        });
    }
    // ============================================================================
    // Deserialization Methods
    // ============================================================================
    /**
     * Deserialize Portfolio account data
     *
     * CRITICAL: This must match the exact on-chain layout!
     * Layout reference: programs/router/src/state/portfolio.rs
     *
     * @param data Raw account data from Solana
     * @returns Deserialized Portfolio object
     */
    deserializePortfolio(data) {
        let offset = 0;
        // NOTE: Native Solana programs (pinocchio) do NOT have discriminators
        // Unlike Anchor programs which start with 8-byte discriminator
        // This is a native program, so we start at offset 0
        // ===== Identity Fields =====
        // router_id: Pubkey (32 bytes)
        const routerId = (0, serialization_1.deserializePubkey)(data, offset);
        offset += 32;
        // user: Pubkey (32 bytes)
        const user = (0, serialization_1.deserializePubkey)(data, offset);
        offset += 32;
        // ===== Cross-Margin State =====
        // equity: i128 (16 bytes)
        const equity = (0, serialization_1.deserializeI128)(data, offset);
        offset += 16;
        // im: u128 (16 bytes)
        const im = (0, serialization_1.deserializeU128)(data, offset);
        offset += 16;
        // mm: u128 (16 bytes)
        const mm = (0, serialization_1.deserializeU128)(data, offset);
        offset += 16;
        // free_collateral: i128 (16 bytes)
        const freeCollateral = (0, serialization_1.deserializeI128)(data, offset);
        offset += 16;
        // last_mark_ts: u64 (8 bytes)
        const lastMarkTs = (0, serialization_1.deserializeU64)(data, offset);
        offset += 8;
        // exposure_count: u16 (2 bytes)
        const exposureCount = data.readUInt16LE(offset);
        offset += 2;
        // bump: u8 (1 byte)
        const bump = data.readUInt8(offset);
        offset += 1;
        // _padding: [u8; 5]
        offset += 5;
        // ===== Liquidation Tracking =====
        // health: i128 (16 bytes)
        const health = (0, serialization_1.deserializeI128)(data, offset);
        offset += 16;
        // last_liquidation_ts: u64 (8 bytes)
        const lastLiquidationTs = (0, serialization_1.deserializeU64)(data, offset);
        offset += 8;
        // cooldown_seconds: u64 (8 bytes)
        const cooldownSeconds = (0, serialization_1.deserializeU64)(data, offset);
        offset += 8;
        // _padding2: [u8; 8]
        offset += 8;
        // ===== PnL Vesting State =====
        // principal: i128 (16 bytes)
        const principal = (0, serialization_1.deserializeI128)(data, offset);
        offset += 16;
        // pnl: i128 (16 bytes)
        const pnl = (0, serialization_1.deserializeI128)(data, offset);
        offset += 16;
        // vested_pnl: i128 (16 bytes)
        const vestedPnl = (0, serialization_1.deserializeI128)(data, offset);
        offset += 16;
        // last_slot: u64 (8 bytes)
        const lastSlot = (0, serialization_1.deserializeU64)(data, offset);
        offset += 8;
        // pnl_index_checkpoint: i128 (16 bytes)
        const pnlIndexCheckpoint = (0, serialization_1.deserializeI128)(data, offset);
        offset += 16;
        // _padding4: [u8; 8]
        offset += 8;
        // ===== Exposures Array =====
        // exposures: [(u16, u16, i64); MAX_SLABS * MAX_INSTRUMENTS]
        const exposures = [];
        const maxExposures = constants_1.MAX_SLABS * constants_1.MAX_INSTRUMENTS;
        for (let i = 0; i < maxExposures; i++) {
            // slab_index: u16 (2 bytes)
            const slabIndex = data.readUInt16LE(offset);
            offset += 2;
            // instrument_index: u16 (2 bytes)
            const instrumentIndex = data.readUInt16LE(offset);
            offset += 2;
            // PADDING: 4 bytes (for i64 alignment in repr(C) tuple)
            offset += 4;
            // position_qty: i64 (8 bytes)
            const qtyBytes = data.slice(offset, offset + 8);
            const positionQty = (0, serialization_1.deserializeI64)(data, offset);
            offset += 8;
            // Only include non-zero positions
            if (!positionQty.isZero()) {
                exposures.push({
                    slabIndex,
                    instrumentIndex,
                    positionQty,
                });
            }
        }
        // ===== LP Buckets Array =====
        // lp_buckets: [LpBucket; MAX_LP_BUCKETS]
        const lpBuckets = [];
        for (let i = 0; i < constants_1.MAX_LP_BUCKETS; i++) {
            // venue: VenueId (40 bytes total)
            // market_id: Pubkey (32 bytes)
            const marketId = (0, serialization_1.deserializePubkey)(data, offset);
            offset += 32;
            // venue_kind: VenueKind (1 byte)
            const venueKind = data.readUInt8(offset);
            offset += 1;
            // _padding: [u8; 7]
            offset += 7;
            const venue = {
                marketId,
                venueKind,
            };
            // amm: Option<AmmLp>
            // Option discriminator (1 byte): 0 = None, 1 = Some
            const hasAmm = data.readUInt8(offset) === 1;
            offset += 1;
            let amm = null;
            if (hasAmm) {
                // lp_shares: u64 (8 bytes)
                const lpShares = (0, serialization_1.deserializeU64)(data, offset);
                offset += 8;
                // share_price_cached: i64 (8 bytes)
                const sharePriceCached = (0, serialization_1.deserializeI64)(data, offset);
                offset += 8;
                // last_update_ts: u64 (8 bytes)
                const lastUpdateTs = (0, serialization_1.deserializeU64)(data, offset);
                offset += 8;
                // _padding: [u8; 8]
                offset += 8;
                amm = {
                    lpShares,
                    sharePriceCached,
                    lastUpdateTs,
                };
            }
            else {
                // Skip AmmLp size (8 + 8 + 8 + 8 = 32 bytes)
                offset += 32;
            }
            // slab: Option<SlabLp>
            const hasSlab = data.readUInt8(offset) === 1;
            offset += 1;
            let slab = null;
            if (hasSlab) {
                // reserved_quote: u128 (16 bytes)
                const reservedQuote = (0, serialization_1.deserializeU128)(data, offset);
                offset += 16;
                // reserved_base: u128 (16 bytes)
                const reservedBase = (0, serialization_1.deserializeU128)(data, offset);
                offset += 16;
                // open_order_count: u16 (2 bytes)
                const openOrderCount = data.readUInt16LE(offset);
                offset += 2;
                // _padding: [u8; 6]
                offset += 6;
                // open_order_ids: [u64; MAX_OPEN_ORDERS]
                const openOrderIds = [];
                for (let j = 0; j < constants_1.MAX_OPEN_ORDERS; j++) {
                    const orderId = (0, serialization_1.deserializeU64)(data, offset);
                    offset += 8;
                    if (!orderId.isZero()) {
                        openOrderIds.push(orderId);
                    }
                }
                slab = {
                    reservedQuote,
                    reservedBase,
                    openOrderCount,
                    openOrderIds,
                };
            }
            else {
                // Skip SlabLp size (16 + 16 + 2 + 6 + (8 * MAX_OPEN_ORDERS) bytes)
                offset += 16 + 16 + 2 + 6 + (8 * constants_1.MAX_OPEN_ORDERS);
            }
            // im: u128 (16 bytes)
            const lpIm = (0, serialization_1.deserializeU128)(data, offset);
            offset += 16;
            // mm: u128 (16 bytes)
            const lpMm = (0, serialization_1.deserializeU128)(data, offset);
            offset += 16;
            // active: bool (1 byte)
            const active = data.readUInt8(offset) === 1;
            offset += 1;
            // _padding: [u8; 7]
            offset += 7;
            // Only include active buckets
            if (active && (!lpIm.isZero() || !lpMm.isZero() || amm !== null || slab !== null)) {
                lpBuckets.push({
                    venue,
                    amm,
                    slab,
                    im: lpIm,
                    mm: lpMm,
                    active,
                });
            }
        }
        // lp_bucket_count: u16 (2 bytes)
        // Note: This is at the end of the struct, after all lp_buckets
        // We don't strictly need it since we filter by active flag above
        // but we can read it for validation
        // offset += 2; // Commented out - we derive this from active buckets
        // _padding3: [u8; 6]
        // offset += 6;
        return {
            routerId,
            user,
            equity,
            im,
            mm,
            freeCollateral,
            lastMarkTs,
            exposureCount,
            bump,
            health,
            lastLiquidationTs,
            cooldownSeconds,
            principal,
            pnl,
            vestedPnl,
            lastSlot,
            pnlIndexCheckpoint,
            exposures,
            lpBuckets,
        };
    }
    deserializeRegistry(data) {
        let offset = 0;
        // NOTE: Native Solana programs (pinocchio) do NOT have discriminators
        // Router ID (32 bytes)
        const routerId = (0, serialization_1.deserializePubkey)(data, offset);
        offset += 32;
        // Governance (32 bytes)
        const governance = (0, serialization_1.deserializePubkey)(data, offset);
        offset += 32;
        // Slab count (u16 = 2 bytes)
        const slabCount = data.readUInt16LE(offset);
        offset += 2;
        // Bump (u8 = 1 byte)
        const bump = data.readUInt8(offset);
        offset += 1;
        // Padding (5 bytes)
        offset += 5;
        // Liquidation parameters
        const imr = (0, serialization_1.deserializeU64)(data, offset);
        offset += 8;
        const mmr = (0, serialization_1.deserializeU64)(data, offset);
        offset += 8;
        const liqBandBps = (0, serialization_1.deserializeU64)(data, offset);
        offset += 8;
        const preliqBuffer = (0, serialization_1.deserializeI64)(data, offset); // i128 stored as i64 for simplicity
        offset += 16; // Skip full i128
        const preliqBandBps = (0, serialization_1.deserializeU64)(data, offset);
        offset += 8;
        const routerCapPerSlab = (0, serialization_1.deserializeU64)(data, offset);
        offset += 8;
        const minEquityToQuote = (0, serialization_1.deserializeI64)(data, offset); // i128 stored as i64 for simplicity
        offset += 16; // Skip full i128
        const oracleToleranceBps = (0, serialization_1.deserializeU64)(data, offset);
        offset += 8;
        // Padding2 (8 bytes)
        offset += 8;
        // Skip complex nested structs (insurance, pnl vesting, warmup, etc.)
        // The slabs array starts at offset 680 (verified by searching for slab pubkey in account data)
        // This accounts for all intermediate structs with proper alignment
        offset = 680;
        // Now we're at the slabs array
        // SlabEntry struct size:
        // - slab_id (Pubkey): 32 bytes
        // - version_hash ([u8; 32]): 32 bytes
        // - oracle_id (Pubkey): 32 bytes
        // - imr (u64): 8 bytes
        // - mmr (u64): 8 bytes
        // - maker_fee_cap (u64): 8 bytes
        // - taker_fee_cap (u64): 8 bytes
        // - latency_sla_ms (u64): 8 bytes
        // - max_exposure (u128): 16 bytes
        // - registered_ts (u64): 8 bytes
        // - active (bool): 1 byte
        // - _padding ([u8; 7]): 7 bytes
        // Total: 168 bytes per entry
        const slabs = [];
        const SLAB_ENTRY_SIZE = 168;
        for (let i = 0; i < slabCount && i < 256; i++) {
            const entryOffset = offset + (i * SLAB_ENTRY_SIZE);
            const slabId = (0, serialization_1.deserializePubkey)(data, entryOffset);
            const versionHash = data.slice(entryOffset + 32, entryOffset + 64);
            const oracleId = (0, serialization_1.deserializePubkey)(data, entryOffset + 64);
            // Skip other fields for now, just read active flag
            const active = data.readUInt8(entryOffset + 160) === 1;
            slabs.push({
                slabId,
                versionHash,
                oracleId,
                imr: new bn_js_1.default(0), // TODO: Deserialize if needed
                mmr: new bn_js_1.default(0),
                makerFeeCap: new bn_js_1.default(0),
                takerFeeCap: new bn_js_1.default(0),
                latencySlaMs: new bn_js_1.default(0),
                maxExposure: new bn_js_1.default(0),
                registeredTs: new bn_js_1.default(0),
                active,
            });
        }
        return {
            routerId,
            governance,
            slabCount,
            bump,
            imr,
            mmr,
            liqBandBps,
            preliqBuffer: new bn_js_1.default(preliqBuffer.toString()),
            preliqBandBps,
            routerCapPerSlab,
            minEquityToQuote: new bn_js_1.default(minEquityToQuote.toString()),
            oracleToleranceBps,
            slabs,
        };
    }
    deserializeVault(data) {
        let offset = 0;
        // NOTE: Native Solana programs (pinocchio) do NOT have discriminators
        // Vault layout (programs/router/src/state/vault.rs):
        // router_id: Pubkey (32 bytes)
        // mint: Pubkey (32 bytes)
        // token_account: Pubkey (32 bytes)
        // balance: u128 (16 bytes)
        // total_pledged: u128 (16 bytes)
        // bump: u8 (1 byte)
        // _padding: [u8; 7] (7 bytes)
        const routerId = (0, serialization_1.deserializePubkey)(data, offset);
        offset += 32;
        const mint = (0, serialization_1.deserializePubkey)(data, offset);
        offset += 32;
        const tokenAccount = (0, serialization_1.deserializePubkey)(data, offset);
        offset += 32;
        const balance = (0, serialization_1.deserializeU128)(data, offset);
        offset += 16;
        const totalPledged = (0, serialization_1.deserializeU128)(data, offset);
        offset += 16;
        const bump = data.readUInt8(offset);
        return {
            routerId,
            mint,
            tokenAccount,
            balance,
            totalPledged,
            bump,
        };
    }
    // ============================================================================
    // Convenience Methods for Trading (v0 - Atomic Fills)
    // ============================================================================
    /**
     * Build a buy instruction with oracle validation
     * Oracle is automatically fetched from SlabRegistry if not provided
     * @param user User's public key
     * @param slabMarket Slab market to trade on
     * @param quantity Quantity to buy (1e6 scale)
     * @param limitPrice Maximum price willing to pay (1e6 scale)
     * @param oracle (Optional) Oracle price feed public key - auto-fetched if omitted
     * @param orderType Market or Limit order (default: Limit for v0 compatibility)
     * @returns {instruction, receiptSetup, receiptKeypair} - execution instruction, receipt creation instruction, and receipt keypair
     */
    async buildBuyInstruction(user, slabMarket, quantity, limitPrice, oracle, orderType = router_1.ExecutionType.Limit, leverage = 1) {
        // Auto-fetch oracle if not provided
        const oracleAccount = oracle || await this.getOracleForSlab(slabMarket);
        if (!oracleAccount) {
            throw new Error(`Oracle not found for slab ${slabMarket.toBase58()}. Slab may not be registered.`);
        }
        // For market orders, fetch oracle price and use it with slippage buffer
        let actualLimitPrice = limitPrice;
        if (orderType === router_1.ExecutionType.Market) {
            // Fetch current oracle price
            const oracleAccountInfo = await this.connection.getAccountInfo(oracleAccount);
            if (!oracleAccountInfo) {
                throw new Error(`Oracle account not found: ${oracleAccount.toBase58()}`);
            }
            // Parse oracle price (supports both Percolator and Pyth formats)
            const priceData = oracleAccountInfo.data;
            let oraclePrice;
            if (priceData.length === 128) {
                // Percolator oracle format (localnet/testing)
                // Price is i64 at offset 80 (after magic:8, version:1, bump:1, padding:6, authority:32, instrument:32)
                const oraclePriceLow = priceData.readBigInt64LE(80);
                oraclePrice = new bn_js_1.default(oraclePriceLow.toString());
            }
            else if (priceData.length >= 216) {
                // Pyth oracle format (mainnet)
                // Price is at offset 208-216
                const oraclePriceLow = priceData.readBigInt64LE(208);
                oraclePrice = new bn_js_1.default(oraclePriceLow.toString());
            }
            else {
                throw new Error(`Invalid oracle account data: expected length 128 (Percolator) or >=216 (Pyth), got ${priceData.length}`);
            }
            // For market buy: set limit to oracle + 0.5% slippage buffer
            // This ensures the order passes the slippage check in the router
            const slippageBps = new bn_js_1.default(50); // 0.5% = 50 bps
            const slippageAmount = oraclePrice.mul(slippageBps).div(new bn_js_1.default(10000));
            actualLimitPrice = oraclePrice.add(slippageAmount);
        }
        // v0.5: Fetch DLP owner from slab for PnL settlement
        const dlpOwner = await this.getDlpOwnerForSlab(slabMarket);
        if (!dlpOwner) {
            throw new Error(`Failed to fetch DLP owner for slab ${slabMarket.toBase58()}`);
        }
        const split = {
            slabMarket,
            side: 0, // Buy
            qty: quantity,
            limitPx: actualLimitPrice,
            oracle: oracleAccount,
            dlpOwner, // Required for v0.5 PnL settlement
        };
        return await this.buildExecuteCrossSlabInstruction(user, [split], orderType, leverage);
    }
    /**
     * Build a sell instruction with oracle validation
     * Oracle is automatically fetched from SlabRegistry if not provided
     * @param user User's public key
     * @param slabMarket Slab market to trade on
     * @param quantity Quantity to sell (1e6 scale)
     * @param limitPrice Minimum price willing to accept (1e6 scale)
     * @param oracle (Optional) Oracle price feed public key - auto-fetched if omitted
     * @param orderType Market or Limit order (default: Limit for v0 compatibility)
     * @returns {instruction, receiptSetup, receiptKeypair} - execution instruction, receipt creation instruction, and receipt keypair
     */
    async buildSellInstruction(user, slabMarket, quantity, limitPrice, oracle, orderType = router_1.ExecutionType.Limit, leverage = 1) {
        // Auto-fetch oracle if not provided
        const oracleAccount = oracle || await this.getOracleForSlab(slabMarket);
        if (!oracleAccount) {
            throw new Error(`Oracle not found for slab ${slabMarket.toBase58()}. Slab may not be registered.`);
        }
        // For market orders, fetch oracle price and use it with slippage buffer
        let actualLimitPrice = limitPrice;
        if (orderType === router_1.ExecutionType.Market) {
            // Fetch current oracle price
            const oracleAccountInfo = await this.connection.getAccountInfo(oracleAccount);
            if (!oracleAccountInfo) {
                throw new Error(`Oracle account not found: ${oracleAccount.toBase58()}`);
            }
            // Parse oracle price (supports both Percolator and Pyth formats)
            const priceData = oracleAccountInfo.data;
            let oraclePrice;
            if (priceData.length === 128) {
                // Percolator oracle format (localnet/testing)
                // Price is i64 at offset 80 (after magic:8, version:1, bump:1, padding:6, authority:32, instrument:32)
                const oraclePriceLow = priceData.readBigInt64LE(80);
                oraclePrice = new bn_js_1.default(oraclePriceLow.toString());
            }
            else if (priceData.length >= 216) {
                // Pyth oracle format (mainnet)
                // Price is at offset 208-216
                const oraclePriceLow = priceData.readBigInt64LE(208);
                oraclePrice = new bn_js_1.default(oraclePriceLow.toString());
            }
            else {
                throw new Error(`Invalid oracle account data: expected length 128 (Percolator) or >=216 (Pyth), got ${priceData.length}`);
            }
            // For market sell: set limit to oracle - 0.5% slippage buffer
            // This ensures the order passes the slippage check in the router
            const slippageBps = new bn_js_1.default(50); // 0.5% = 50 bps
            const slippageAmount = oraclePrice.mul(slippageBps).div(new bn_js_1.default(10000));
            actualLimitPrice = oraclePrice.sub(slippageAmount);
        }
        // v0.5: Fetch DLP owner from slab for PnL settlement
        const dlpOwner = await this.getDlpOwnerForSlab(slabMarket);
        if (!dlpOwner) {
            throw new Error(`Failed to fetch DLP owner for slab ${slabMarket.toBase58()}`);
        }
        const split = {
            slabMarket,
            side: 1, // Sell
            qty: quantity,
            limitPx: actualLimitPrice, // Uses oracle price for market orders
            oracle: oracleAccount,
            dlpOwner, // Required for v0.5 PnL settlement
        };
        return await this.buildExecuteCrossSlabInstruction(user, [split], orderType, leverage);
    }
}
exports.RouterClient = RouterClient;
