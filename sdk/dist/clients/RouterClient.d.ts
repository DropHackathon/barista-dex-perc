import { Connection, PublicKey, TransactionInstruction, Keypair } from '@solana/web3.js';
import BN from 'bn.js';
import { Portfolio, Registry, Vault, SlabSplit, ExecutionType, LiquidationParams, BurnLpSharesParams, CancelLpOrdersParams } from '../types/router';
import { SlabInfo } from '../types/discovery';
import { SlabQuotes } from '../types/slab';
/**
 * Client for interacting with the Barista DEX Router program
 */
export declare class RouterClient {
    private connection;
    private programId;
    private wallet?;
    /**
     * Create a new RouterClient
     * @param connection Solana connection
     * @param programId Router program ID
     * @param wallet Optional wallet keypair for signing transactions
     */
    constructor(connection: Connection, programId: PublicKey, wallet?: Keypair | undefined);
    /**
     * Derive Portfolio PDA for a user
     * @param user User's public key
     * @returns [PDA, bump]
     */
    derivePortfolioPDA(user: PublicKey): [PublicKey, number];
    /**
     * Derive Vault PDA for a token mint
     * @param mint Token mint public key
     * @returns [PDA, bump]
     */
    deriveVaultPDA(mint: PublicKey): [PublicKey, number];
    /**
     * Derive Registry PDA
     * PDA seeds: ["registry"]
     * @returns [PDA, bump]
     */
    deriveRegistryPDA(): [PublicKey, number];
    /**
     * Derive Authority PDA
     * @returns [PDA, bump]
     */
    deriveAuthorityPDA(): [PublicKey, number];
    /**
     * Derive PositionDetails PDA for a specific position
     * PDA seeds: ["position", portfolio_pda, slab_index (u16 LE), instrument_index (u16 LE)]
     * @param portfolioPda Portfolio PDA address
     * @param slabIndex Slab index in registry (u16)
     * @param instrumentIndex Instrument index in slab (u16)
     * @returns [PDA, bump]
     */
    derivePositionDetailsPDA(portfolioPda: PublicKey, slabIndex: number, instrumentIndex: number): [PublicKey, number];
    /**
     * Derive Receipt PDA for a slab fill
     * @param slab Slab market public key
     * @param user User's public key
     * @returns [PDA, bump]
     */
    deriveReceiptPDA(slab: PublicKey, user: PublicKey): [PublicKey, number];
    /**
     * Create ephemeral receipt account for trade execution
     * Receipts are temporary accounts that the slab writes fill data to
     * They're created per-transaction and can be discarded after
     * @param payer Payer for the account creation
     * @param owner Program ID that will own the receipt (slab program)
     * @returns [instruction to create receipt, receipt keypair]
     */
    createReceiptAccount(payer: PublicKey, owner: PublicKey): Promise<[TransactionInstruction, Keypair]>;
    /**
     * Fetch Portfolio account data
     * NOTE: Portfolio uses create_with_seed (NOT PDA)
     * @param user User's public key
     * @returns Portfolio data
     */
    getPortfolio(user: PublicKey): Promise<Portfolio | null>;
    /**
     * Fetch Registry account data
     * @returns Registry data
     */
    getRegistry(): Promise<Registry | null>;
    /**
     * Get oracle account for a specific slab
     * Reads the SlabRegistry to find the registered oracle for this slab
     * @param slabMarket Slab market public key
     * @returns Oracle public key, or null if slab not found in registry
     */
    getOracleForSlab(slabMarket: PublicKey): Promise<PublicKey | null>;
    /**
     * Fetch DLP owner (lp_owner) from slab header
     * Required for v0.5 PnL settlement - DLP Portfolio acts as counterparty
     * @param slabMarket Slab market public key
     * @returns DLP owner public key (lp_owner field from slab header)
     */
    getDlpOwnerForSlab(slabMarket: PublicKey): Promise<PublicKey | null>;
    /**
     * Fetch Vault account data
     * @param mint Token mint public key
     * @returns Vault data
     */
    getVault(mint: PublicKey): Promise<Vault | null>;
    /**
     * Get all registered slabs from on-chain accounts
     * Note: In v0, this requires scanning for slab accounts by owner (slab program).
     * Future: Registry will maintain a list of registered slabs.
     * @param slabProgramId Slab program ID to scan for
     * @returns Array of slab info
     */
    getAllSlabs(slabProgramId: PublicKey): Promise<SlabInfo[]>;
    /**
     * Find slabs trading a specific instrument
     * @param instrumentId Instrument public key
     * @param slabProgramId Slab program ID to scan
     * @returns Array of slab addresses
     */
    getSlabsForInstrument(instrumentId: PublicKey, slabProgramId: PublicKey): Promise<PublicKey[]>;
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
    calculatePositionSize(marginCommitted: BN, leverage?: number): BN;
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
    calculateActualQuantity(quantityInput: BN, price: BN, leverage?: number): BN;
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
    validateLeveragedPosition(user: PublicKey, quantityInput: BN, price: BN, leverage?: number): Promise<{
        valid: boolean;
        availableEquity: BN;
        marginCommitted: BN;
        actualQuantity: BN;
        positionSize: BN;
        leverage: number;
        mode: 'spot' | 'margin';
    }>;
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
    calculateMaxQuantityInput(user: PublicKey, price: BN, leverage?: number): Promise<BN>;
    /**
     * Get market price from slab (uses mark price)
     *
     * @param slabMarket Slab market address
     * @param slabProgramId Slab program ID
     * @returns Mark price (1e6 scale)
     */
    getMarketPrice(slabMarket: PublicKey, slabProgramId: PublicKey): Promise<BN>;
    /**
     * Parse QuoteCache from slab account data
     * QuoteCache is located at offset 256 (after SlabHeader)
     *
     * @param data Slab account data buffer
     * @param offset Offset to QuoteCache (default 256)
     * @returns Parsed QuoteCache with best bid/ask levels
     */
    private parseQuoteCache;
    /**
     * Get detailed quotes from a slab (includes QuoteCache with best bid/ask levels)
     * Used for smart routing and price discovery
     *
     * @param slabMarket Slab market address
     * @returns Slab quotes with instrument, mark price, and quote cache
     */
    getSlabQuotes(slabMarket: PublicKey): Promise<SlabQuotes>;
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
    findBestSlabForTrade(instrumentId: PublicKey, side: 'buy' | 'sell', quantity: BN, slabProgramId: PublicKey): Promise<{
        slab: PublicKey;
        price: BN;
        availableQty: BN;
        totalLiquidity: BN;
    }>;
    /**
     * Build Initialize instruction for SlabRegistry
     * Initializes the global registry account with governance authority
     * @param payer Public key paying for account creation
     * @param governance Governance authority public key
     * @returns TransactionInstruction
     */
    buildInitializeInstruction(payer: PublicKey, governance: PublicKey): TransactionInstruction;
    /**
     * Build instructions to initialize SlabRegistry
     * The router program creates the registry PDA account via CPI during initialization
     * @param payer Public key paying for account creation and rent
     * @param governance Governance authority public key (defaults to payer)
     * @returns Single instruction to initialize registry (program creates PDA internally)
     */
    buildInitializeRegistryInstructions(payer: PublicKey, governance?: PublicKey): Promise<TransactionInstruction[]>;
    /**
     * Derive registry address (PDA)
     * The registry account is a PDA with seed "registry"
     * @returns Registry PDA address
     */
    deriveRegistryAddress(): PublicKey;
    /**
     * Check if SlabRegistry is initialized
     * @returns true if registry exists and is initialized
     */
    isRegistryInitialized(): Promise<boolean>;
    /**
     * Build Deposit instruction (SOL only)
     * Deposits SOL from user's wallet to their portfolio account
     * @param amount Amount of lamports to deposit (u64)
     * @param user User's public key
     * @returns TransactionInstruction
     */
    buildDepositInstruction(amount: BN, user: PublicKey): Promise<TransactionInstruction>;
    /**
     * Build Withdraw instruction (SOL only)
     * Withdraws SOL from portfolio account to user's wallet
     * @param amount Amount of lamports to withdraw (u64)
     * @param user User's public key
     * @returns TransactionInstruction
     */
    buildWithdrawInstruction(amount: BN, user: PublicKey): Promise<TransactionInstruction>;
    /**
     * Derive portfolio account address using create_with_seed
     * NOTE: Portfolio uses create_with_seed (NOT PDA) to bypass 10KB CPI limit
     * @param user User's public key
     * @returns Portfolio address
     */
    derivePortfolioAddress(user: PublicKey): Promise<PublicKey>;
    /**
     * Initialize a portfolio account for a user
     * Creates the portfolio account and initializes it in a single transaction
     * NOTE: Portfolio uses create_with_seed (NOT PDA) to bypass 10KB CPI limit
     * @param user User's public key (must be signer)
     * @param portfolioSize Size of portfolio account in bytes (default: 133008 = Portfolio::LEN)
     * @returns Array of instructions [createAccountInstruction, initializeInstruction]
     */
    buildInitializePortfolioInstructions(user: PublicKey, portfolioSize?: number): Promise<TransactionInstruction[]>;
    /**
     * Ensure portfolio exists, creating it if necessary
     * Returns instructions to prepend to transaction if portfolio doesn't exist
     * @param user User's public key
     * @returns Array of instructions (empty if portfolio exists, initialization instructions if not)
     */
    ensurePortfolioInstructions(user: PublicKey): Promise<TransactionInstruction[]>;
    /**
     * Build InitializePortfolio instruction (DEPRECATED - use buildInitializePortfolioInstructions)
     * @deprecated This method incorrectly uses PDA. Use buildInitializePortfolioInstructions instead.
     * @param user User's public key
     * @returns TransactionInstruction
     */
    buildInitializePortfolioInstruction(user: PublicKey): TransactionInstruction;
    /**
     * Build ExecuteCrossSlab instruction (v0.5 with PnL settlement)
     * Routes a trade across slab markets with real SOL settlement against DLP
     * @param user User's public key
     * @param splits Array of slab splits (each includes oracle and dlpOwner)
     * @param orderType Market (0) or Limit (1) order
     * @returns {instruction, receiptSetup, receiptKeypair} - execution instruction, receipt creation instruction, and receipt keypair
     */
    buildExecuteCrossSlabInstruction(user: PublicKey, splits: SlabSplit[], orderType?: ExecutionType, leverage?: number): Promise<{
        instruction: TransactionInstruction;
        receiptSetup: TransactionInstruction;
        receiptKeypair: Keypair;
    }>;
    /**
     * Build LiquidateUser instruction
     * @param params Liquidation parameters
     * @returns TransactionInstruction
     */
    buildLiquidateUserInstruction(params: LiquidationParams): TransactionInstruction;
    /**
     * Build BurnLpShares instruction
     * @param params Burn LP shares parameters
     * @returns TransactionInstruction
     */
    buildBurnLpSharesInstruction(params: BurnLpSharesParams): TransactionInstruction;
    /**
     * Build CancelLpOrders instruction
     * @param params Cancel LP orders parameters
     * @returns TransactionInstruction
     */
    buildCancelLpOrdersInstruction(params: CancelLpOrdersParams): TransactionInstruction;
    /**
     * Deserialize Portfolio account data
     *
     * CRITICAL: This must match the exact on-chain layout!
     * Layout reference: programs/router/src/state/portfolio.rs
     *
     * @param data Raw account data from Solana
     * @returns Deserialized Portfolio object
     */
    private deserializePortfolio;
    private deserializeRegistry;
    private deserializeVault;
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
    buildBuyInstruction(user: PublicKey, slabMarket: PublicKey, quantity: BN, limitPrice: BN, oracle?: PublicKey, orderType?: ExecutionType, leverage?: number): Promise<{
        instruction: TransactionInstruction;
        receiptSetup: TransactionInstruction;
        receiptKeypair: Keypair;
    }>;
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
    buildSellInstruction(user: PublicKey, slabMarket: PublicKey, quantity: BN, limitPrice: BN, oracle?: PublicKey, orderType?: ExecutionType, leverage?: number): Promise<{
        instruction: TransactionInstruction;
        receiptSetup: TransactionInstruction;
        receiptKeypair: Keypair;
    }>;
    /**
     * Execute a market buy order
     * @param slab Slab market to trade on
     * @param quantity Quantity to buy (in instrument units, 6 decimals)
     * @param leverage Leverage multiplier (1-10x), defaults to 1
     * @param oracle Optional oracle public key (auto-fetched if not provided)
     * @returns Transaction signature
     */
    marketBuy(slab: PublicKey, quantity: BN, leverage?: number, oracle?: PublicKey): Promise<string>;
    /**
     * Execute a market sell order
     * @param slab Slab market to trade on
     * @param quantity Quantity to sell (in instrument units, 6 decimals)
     * @param leverage Leverage multiplier (1-10x), defaults to 1
     * @param oracle Optional oracle public key (auto-fetched if not provided)
     * @returns Transaction signature
     */
    marketSell(slab: PublicKey, quantity: BN, leverage?: number, oracle?: PublicKey): Promise<string>;
    /**
     * Execute a limit buy order
     * @param slab Slab market to trade on
     * @param quantity Quantity to buy (in instrument units, 6 decimals)
     * @param limitPrice Limit price (6 decimals)
     * @param leverage Leverage multiplier (1-10x), defaults to 1
     * @param oracle Optional oracle public key (auto-fetched if not provided)
     * @returns Transaction signature
     */
    limitBuy(slab: PublicKey, quantity: BN, limitPrice: BN, leverage?: number, oracle?: PublicKey): Promise<string>;
    /**
     * Execute a limit sell order
     * @param slab Slab market to trade on
     * @param quantity Quantity to sell (in instrument units, 6 decimals)
     * @param limitPrice Limit price (6 decimals)
     * @param leverage Leverage multiplier (1-10x), defaults to 1
     * @param oracle Optional oracle public key (auto-fetched if not provided)
     * @returns Transaction signature
     */
    limitSell(slab: PublicKey, quantity: BN, limitPrice: BN, leverage?: number, oracle?: PublicKey): Promise<string>;
}
