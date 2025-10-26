import {
  Connection,
  PublicKey,
  TransactionInstruction,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import {
  RouterInstruction,
  Portfolio,
  Registry,
  Vault,
  SlabSplit,
  LiquidationParams,
  BurnLpSharesParams,
  CancelLpOrdersParams,
  Exposure,
  VenueId,
  VenueKind,
  AmmLp,
  SlabLp,
  LpBucket,
} from '../types/router';
import {
  SlabInfo,
} from '../types/discovery';
import {
  serializeU64,
  serializeU128,
  serializeI64,
  serializeBool,
  serializePubkey,
  createInstructionData,
  deserializeU64,
  deserializeU128,
  deserializeI64,
  deserializeI128,
  deserializePubkey,
} from '../utils/serialization';
import {
  MAX_SLABS,
  MAX_INSTRUMENTS,
  MAX_LP_BUCKETS,
  MAX_OPEN_ORDERS,
} from '../constants';

/**
 * Client for interacting with the Barista DEX Router program
 */
export class RouterClient {
  /**
   * Create a new RouterClient
   * @param connection Solana connection
   * @param programId Router program ID
   * @param wallet Optional wallet keypair for signing transactions
   */
  constructor(
    private connection: Connection,
    private programId: PublicKey,
    private wallet?: Keypair
  ) {}

  // ============================================================================
  // PDA Derivation Methods
  // ============================================================================

  /**
   * Derive Portfolio PDA for a user
   * @param user User's public key
   * @returns [PDA, bump]
   */
  derivePortfolioPDA(user: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('portfolio'), user.toBuffer()],
      this.programId
    );
  }

  /**
   * Derive Vault PDA for a token mint
   * @param mint Token mint public key
   * @returns [PDA, bump]
   */
  deriveVaultPDA(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), mint.toBuffer()],
      this.programId
    );
  }

  /**
   * Derive Registry PDA
   * @returns [PDA, bump]
   */
  deriveRegistryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('registry')],
      this.programId
    );
  }

  /**
   * Derive Authority PDA
   * @returns [PDA, bump]
   */
  deriveAuthorityPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('authority')],
      this.programId
    );
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
  async getPortfolio(user: PublicKey): Promise<Portfolio | null> {
    const portfolioAddress = await this.derivePortfolioAddress(user);
    const accountInfo = await this.connection.getAccountInfo(portfolioAddress);

    if (!accountInfo) {
      return null;
    }

    return this.deserializePortfolio(accountInfo.data);
  }

  /**
   * Fetch Registry account data
   * @returns Registry data
   */
  async getRegistry(): Promise<Registry | null> {
    const [registryPDA] = this.deriveRegistryPDA();
    const accountInfo = await this.connection.getAccountInfo(registryPDA);

    if (!accountInfo) {
      return null;
    }

    return this.deserializeRegistry(accountInfo.data);
  }

  /**
   * Fetch Vault account data
   * @param mint Token mint public key
   * @returns Vault data
   */
  async getVault(mint: PublicKey): Promise<Vault | null> {
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
  async getAllSlabs(slabProgramId: PublicKey): Promise<SlabInfo[]> {
    // Get all accounts owned by the slab program
    const accounts = await this.connection.getProgramAccounts(slabProgramId, {
      filters: [
        {
          dataSize: 4096, // Approximate size of SlabState in v0 (~4KB)
        },
      ],
    });

    const slabs: SlabInfo[] = [];

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
        const lpOwner = new PublicKey(account.data.slice(offset, offset + 32));
        offset += 32;

        // Skip router_id (32 bytes)
        offset += 32;

        // Read instrument (32 bytes)
        const instrument = new PublicKey(account.data.slice(offset, offset + 32));
        offset += 32;

        // Read contract_size (8 bytes, i64)
        const contractSize = new BN(account.data.readBigInt64LE(offset).toString());
        offset += 8;

        // Skip tick (8 bytes)
        offset += 8;

        // Skip lot (8 bytes)
        offset += 8;

        // Read mark_px (8 bytes, i64)
        const markPx = new BN(account.data.readBigInt64LE(offset).toString());
        offset += 8;

        // Read taker_fee_bps (8 bytes, i64)
        const takerFeeBps = new BN(account.data.readBigInt64LE(offset).toString());

        slabs.push({
          address: pubkey,
          lpOwner,
          instrument,
          markPx,
          takerFeeBps,
          contractSize,
          seqno,
        });
      } catch (err) {
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
  async getSlabsForInstrument(
    instrumentId: PublicKey,
    slabProgramId: PublicKey
  ): Promise<PublicKey[]> {
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
  calculatePositionSize(marginCommitted: BN, leverage: number = 1): BN {
    return marginCommitted.mul(new BN(leverage));
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
  calculateActualQuantity(quantityInput: BN, price: BN, leverage: number = 1): BN {
    // margin_committed = quantityInput * price / 1e6
    // position_size = margin_committed * leverage
    // actual_quantity = position_size / price * 1e6
    // Simplified: actual_quantity = quantityInput * leverage
    return quantityInput.mul(new BN(leverage));
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
  async validateLeveragedPosition(
    user: PublicKey,
    quantityInput: BN,
    price: BN,
    leverage: number = 1
  ): Promise<{
    valid: boolean;
    availableEquity: BN;
    marginCommitted: BN;
    actualQuantity: BN;
    positionSize: BN;
    leverage: number;
    mode: 'spot' | 'margin';
  }> {
    // Validate leverage range
    if (leverage < 1 || leverage > 10) {
      throw new Error('Leverage must be between 1x and 10x');
    }

    // Get portfolio equity
    const [portfolioPDA] = this.derivePortfolioPDA(user);
    const portfolio = await this.getPortfolio(portfolioPDA);

    if (!portfolio) {
      throw new Error('Portfolio not found. Please initialize portfolio first.');
    }

    // Calculate margin committed: quantity_input * price / 1e6
    const marginCommitted = quantityInput.mul(price).div(new BN(1_000_000));

    // Calculate actual position size: margin * leverage
    const positionSize = this.calculatePositionSize(marginCommitted, leverage);

    // Calculate actual quantity to trade: quantity_input * leverage
    const actualQuantity = this.calculateActualQuantity(quantityInput, price, leverage);

    // Check if equity >= margin committed
    const availableEquity = new BN(portfolio.equity.toString());
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
  async calculateMaxQuantityInput(
    user: PublicKey,
    price: BN,
    leverage: number = 1
  ): Promise<BN> {
    // Validate leverage range
    if (leverage < 1 || leverage > 10) {
      throw new Error('Leverage must be between 1x and 10x');
    }

    // Get portfolio equity
    const [portfolioPDA] = this.derivePortfolioPDA(user);
    const portfolio = await this.getPortfolio(portfolioPDA);

    if (!portfolio) {
      throw new Error('Portfolio not found. Please initialize portfolio first.');
    }

    const availableEquity = new BN(portfolio.equity.toString());

    // max_quantity_input = equity / price * 1e6
    // Note: leverage doesn't affect this - it just multiplies the actual position
    return availableEquity.mul(new BN(1_000_000)).div(price);
  }

  /**
   * Get market price from slab (uses mark price)
   *
   * @param slabMarket Slab market address
   * @param slabProgramId Slab program ID
   * @returns Mark price (1e6 scale)
   */
  async getMarketPrice(slabMarket: PublicKey, slabProgramId: PublicKey): Promise<BN> {
    const accountInfo = await this.connection.getAccountInfo(slabMarket);

    if (!accountInfo) {
      throw new Error(`Slab market not found: ${slabMarket.toBase58()}`);
    }

    // Parse slab state to get markPx
    // Layout: discriminator(8) + version(4) + seqno(4) + program_id(32) + lp_owner(32) +
    //         router_id(32) + instrument(32) + contract_size(8) + tick(8) + lot(8) + mark_px(8)
    let offset = 8 + 4 + 4 + 32 + 32 + 32 + 32 + 8 + 8 + 8; // = 176

    const markPx = new BN(accountInfo.data.readBigInt64LE(offset).toString());
    return markPx;
  }

  // ============================================================================
  // Instruction Builders
  // ============================================================================

  /**
   * Build Initialize instruction
   * Creates the global Registry and Authority accounts
   * @param payer Payer and authority for initialization
   * @returns TransactionInstruction
   */
  buildInitializeInstruction(payer: PublicKey): TransactionInstruction {
    const [registryPDA] = this.deriveRegistryPDA();
    const [authorityPDA] = this.deriveAuthorityPDA();

    const data = createInstructionData(RouterInstruction.Initialize);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: registryPDA, isSigner: false, isWritable: true },
        { pubkey: authorityPDA, isSigner: false, isWritable: true },
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build Deposit instruction (SOL only)
   * Deposits SOL from user's wallet to their portfolio account
   * @param amount Amount of lamports to deposit (u64)
   * @param user User's public key
   * @returns TransactionInstruction
   */
  async buildDepositInstruction(
    amount: BN,
    user: PublicKey
  ): Promise<TransactionInstruction> {
    const portfolioAddress = await this.derivePortfolioAddress(user);

    const data = createInstructionData(
      RouterInstruction.Deposit,
      serializeU64(amount)
    );

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: portfolioAddress, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
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
  async buildWithdrawInstruction(
    amount: BN,
    user: PublicKey
  ): Promise<TransactionInstruction> {
    const portfolioAddress = await this.derivePortfolioAddress(user);
    const [registryPDA] = this.deriveRegistryPDA();

    const data = createInstructionData(
      RouterInstruction.Withdraw,
      serializeU64(amount)
    );

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: portfolioAddress, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
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
  async derivePortfolioAddress(user: PublicKey): Promise<PublicKey> {
    return await PublicKey.createWithSeed(
      user,
      'portfolio',
      this.programId
    );
  }

  /**
   * Initialize a portfolio account for a user
   * Creates the portfolio account and initializes it in a single transaction
   * NOTE: Portfolio uses create_with_seed (NOT PDA) to bypass 10KB CPI limit
   * @param user User's public key (must be signer)
   * @param portfolioSize Size of portfolio account in bytes (default: 139264)
   * @returns Array of instructions [createAccountInstruction, initializeInstruction]
   */
  async buildInitializePortfolioInstructions(
    user: PublicKey,
    portfolioSize: number = 139264  // Portfolio::LEN (~136KB)
  ): Promise<TransactionInstruction[]> {
    // Derive portfolio address using create_with_seed
    const portfolioAddress = await this.derivePortfolioAddress(user);

    // Get rent exemption amount
    const rentExemption = await this.connection.getMinimumBalanceForRentExemption(portfolioSize);

    // Instruction 1: Create account with seed
    const createAccountIx = SystemProgram.createAccountWithSeed({
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
    instructionData.writeUInt8(RouterInstruction.InitializePortfolio, 0);
    user.toBuffer().copy(instructionData, 1);

    const initializeIx = new TransactionInstruction({
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
  async ensurePortfolioInstructions(user: PublicKey): Promise<TransactionInstruction[]> {
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
  buildInitializePortfolioInstruction(
    user: PublicKey
  ): TransactionInstruction {
    const [portfolioPDA] = this.derivePortfolioPDA(user);
    const [registryPDA] = this.deriveRegistryPDA();

    const data = createInstructionData(RouterInstruction.InitializePortfolio);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: portfolioPDA, isSigner: false, isWritable: true },
        { pubkey: registryPDA, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build ExecuteCrossSlab instruction
   * Routes a trade across multiple slab markets
   * @param user User's public key
   * @param splits Array of slab splits
   * @param slabProgram Slab program ID
   * @returns TransactionInstruction
   */
  buildExecuteCrossSlabInstruction(
    user: PublicKey,
    splits: SlabSplit[],
    slabProgram: PublicKey
  ): TransactionInstruction {
    const [portfolioPDA] = this.derivePortfolioPDA(user);

    // Serialize splits: num_splits (u8) + splits
    const numSplits = Buffer.from([splits.length]);
    const splitBuffers = splits.map((split) =>
      Buffer.concat([
        serializePubkey(split.slabMarket),
        serializeBool(split.isBuy),
        serializeU128(split.size),
        serializeU128(split.price),
      ])
    );

    const data = createInstructionData(
      RouterInstruction.ExecuteCrossSlab,
      numSplits,
      ...splitBuffers
    );

    // Build account list: portfolio + slab markets
    const keys = [
      { pubkey: portfolioPDA, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: false },
      { pubkey: slabProgram, isSigner: false, isWritable: false },
    ];

    // Add each slab market
    for (const split of splits) {
      keys.push({ pubkey: split.slabMarket, isSigner: false, isWritable: true });
    }

    return new TransactionInstruction({
      programId: this.programId,
      keys,
      data,
    });
  }

  /**
   * Build LiquidateUser instruction
   * @param params Liquidation parameters
   * @returns TransactionInstruction
   */
  buildLiquidateUserInstruction(
    params: LiquidationParams
  ): TransactionInstruction {
    const [portfolioPDA] = this.derivePortfolioPDA(
      params.portfolio // Note: portfolio is the target user's portfolio pubkey
    );

    const data = createInstructionData(
      RouterInstruction.LiquidateUser,
      serializeBool(params.isPreliq),
      serializeU64(params.currentTs)
    );

    // Build dynamic account list
    const keys = [
      { pubkey: portfolioPDA, isSigner: false, isWritable: true },
      { pubkey: this.wallet?.publicKey || PublicKey.default, isSigner: true, isWritable: false },
    ];

    // Add oracle accounts
    for (const oracle of params.oracles) {
      keys.push({ pubkey: oracle, isSigner: false, isWritable: false });
    }

    // Add slab accounts
    for (const slab of params.slabs) {
      keys.push({ pubkey: slab, isSigner: false, isWritable: true });
    }

    return new TransactionInstruction({
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
  buildBurnLpSharesInstruction(
    params: BurnLpSharesParams
  ): TransactionInstruction {
    const [portfolioPDA] = this.derivePortfolioPDA(params.user);

    const data = createInstructionData(
      RouterInstruction.BurnLpShares,
      serializePubkey(params.marketId),
      serializeU64(params.sharesToBurn),
      serializeI64(params.currentSharePrice),
      serializeU64(params.currentTs),
      serializeU64(params.maxStalenessSeconds)
    );

    return new TransactionInstruction({
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
  buildCancelLpOrdersInstruction(
    params: CancelLpOrdersParams
  ): TransactionInstruction {
    const [portfolioPDA] = this.derivePortfolioPDA(params.user);

    // Limit to 16 orders
    if (params.orderIds.length > 16) {
      throw new Error('Cannot cancel more than 16 orders at once');
    }

    // Serialize: num_orders (u8) + order_ids + freed_quote + freed_base
    const numOrders = Buffer.from([params.orderIds.length]);
    const orderIdBuffers = params.orderIds.map((id) => serializeU64(id));

    const data = createInstructionData(
      RouterInstruction.CancelLpOrders,
      serializePubkey(params.marketId),
      numOrders,
      ...orderIdBuffers,
      serializeU128(params.freedQuote),
      serializeU128(params.freedBase)
    );

    return new TransactionInstruction({
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
  private deserializePortfolio(data: Buffer): Portfolio {
    let offset = 0;

    // Skip discriminator (8 bytes)
    // In Anchor/Borsh, accounts start with 8-byte discriminator
    offset += 8;

    // ===== Identity Fields =====

    // router_id: Pubkey (32 bytes)
    const routerId = deserializePubkey(data, offset);
    offset += 32;

    // user: Pubkey (32 bytes)
    const user = deserializePubkey(data, offset);
    offset += 32;

    // ===== Cross-Margin State =====

    // equity: i128 (16 bytes)
    const equity = deserializeI128(data, offset);
    offset += 16;

    // im: u128 (16 bytes)
    const im = deserializeU128(data, offset);
    offset += 16;

    // mm: u128 (16 bytes)
    const mm = deserializeU128(data, offset);
    offset += 16;

    // free_collateral: i128 (16 bytes)
    const freeCollateral = deserializeI128(data, offset);
    offset += 16;

    // last_mark_ts: u64 (8 bytes)
    const lastMarkTs = deserializeU64(data, offset);
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
    const health = deserializeI128(data, offset);
    offset += 16;

    // last_liquidation_ts: u64 (8 bytes)
    const lastLiquidationTs = deserializeU64(data, offset);
    offset += 8;

    // cooldown_seconds: u64 (8 bytes)
    const cooldownSeconds = deserializeU64(data, offset);
    offset += 8;

    // _padding2: [u8; 8]
    offset += 8;

    // ===== PnL Vesting State =====

    // principal: i128 (16 bytes)
    const principal = deserializeI128(data, offset);
    offset += 16;

    // pnl: i128 (16 bytes)
    const pnl = deserializeI128(data, offset);
    offset += 16;

    // vested_pnl: i128 (16 bytes)
    const vestedPnl = deserializeI128(data, offset);
    offset += 16;

    // last_slot: u64 (8 bytes)
    const lastSlot = deserializeU64(data, offset);
    offset += 8;

    // pnl_index_checkpoint: i128 (16 bytes)
    const pnlIndexCheckpoint = deserializeI128(data, offset);
    offset += 16;

    // _padding4: [u8; 8]
    offset += 8;

    // ===== Exposures Array =====
    // exposures: [(u16, u16, i64); MAX_SLABS * MAX_INSTRUMENTS]

    const exposures: Exposure[] = [];
    const maxExposures = MAX_SLABS * MAX_INSTRUMENTS;

    for (let i = 0; i < maxExposures; i++) {
      // slab_index: u16 (2 bytes)
      const slabIndex = data.readUInt16LE(offset);
      offset += 2;

      // instrument_index: u16 (2 bytes)
      const instrumentIndex = data.readUInt16LE(offset);
      offset += 2;

      // position_qty: i64 (8 bytes)
      const positionQty = deserializeI64(data, offset);
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

    const lpBuckets: LpBucket[] = [];

    for (let i = 0; i < MAX_LP_BUCKETS; i++) {
      // venue: VenueId (40 bytes total)
      // market_id: Pubkey (32 bytes)
      const marketId = deserializePubkey(data, offset);
      offset += 32;

      // venue_kind: VenueKind (1 byte)
      const venueKind = data.readUInt8(offset) as VenueKind;
      offset += 1;

      // _padding: [u8; 7]
      offset += 7;

      const venue: VenueId = {
        marketId,
        venueKind,
      };

      // amm: Option<AmmLp>
      // Option discriminator (1 byte): 0 = None, 1 = Some
      const hasAmm = data.readUInt8(offset) === 1;
      offset += 1;

      let amm: AmmLp | null = null;
      if (hasAmm) {
        // lp_shares: u64 (8 bytes)
        const lpShares = deserializeU64(data, offset);
        offset += 8;

        // share_price_cached: i64 (8 bytes)
        const sharePriceCached = deserializeI64(data, offset);
        offset += 8;

        // last_update_ts: u64 (8 bytes)
        const lastUpdateTs = deserializeU64(data, offset);
        offset += 8;

        // _padding: [u8; 8]
        offset += 8;

        amm = {
          lpShares,
          sharePriceCached,
          lastUpdateTs,
        };
      } else {
        // Skip AmmLp size (8 + 8 + 8 + 8 = 32 bytes)
        offset += 32;
      }

      // slab: Option<SlabLp>
      const hasSlab = data.readUInt8(offset) === 1;
      offset += 1;

      let slab: SlabLp | null = null;
      if (hasSlab) {
        // reserved_quote: u128 (16 bytes)
        const reservedQuote = deserializeU128(data, offset);
        offset += 16;

        // reserved_base: u128 (16 bytes)
        const reservedBase = deserializeU128(data, offset);
        offset += 16;

        // open_order_count: u16 (2 bytes)
        const openOrderCount = data.readUInt16LE(offset);
        offset += 2;

        // _padding: [u8; 6]
        offset += 6;

        // open_order_ids: [u64; MAX_OPEN_ORDERS]
        const openOrderIds: BN[] = [];
        for (let j = 0; j < MAX_OPEN_ORDERS; j++) {
          const orderId = deserializeU64(data, offset);
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
      } else {
        // Skip SlabLp size (16 + 16 + 2 + 6 + (8 * MAX_OPEN_ORDERS) bytes)
        offset += 16 + 16 + 2 + 6 + (8 * MAX_OPEN_ORDERS);
      }

      // im: u128 (16 bytes)
      const lpIm = deserializeU128(data, offset);
      offset += 16;

      // mm: u128 (16 bytes)
      const lpMm = deserializeU128(data, offset);
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

  private deserializeRegistry(data: Buffer): Registry {
    let offset = 8; // Skip discriminator

    const authority = deserializePubkey(data, offset);
    offset += 32;

    const numVaults = data.readUInt32LE(offset);
    offset += 4;

    const numPortfolios = data.readUInt32LE(offset);
    offset += 4;

    // Read vault addresses (assuming max 256 vaults)
    const vaults: PublicKey[] = [];
    for (let i = 0; i < numVaults; i++) {
      vaults.push(deserializePubkey(data, offset));
      offset += 32;
    }

    return {
      authority,
      numVaults,
      numPortfolios,
      vaults,
    };
  }

  private deserializeVault(data: Buffer): Vault {
    let offset = 8; // Skip discriminator

    const mint = deserializePubkey(data, offset);
    offset += 32;

    const totalDeposits = deserializeU128(data, offset);
    offset += 16;

    const totalWithdrawals = deserializeU128(data, offset);
    offset += 16;

    const balance = deserializeU128(data, offset);

    return {
      mint,
      totalDeposits,
      totalWithdrawals,
      balance,
    };
  }

  // ============================================================================
  // Convenience Methods for Trading (v0 - Atomic Fills)
  // ============================================================================

  /**
   * Build a buy instruction (market order that executes immediately)
   * V0: Atomic fill only - no resting orders
   * @param user User's public key
   * @param slabMarket Slab market to trade on
   * @param quantity Quantity to buy (in base units)
   * @param limitPrice Maximum price willing to pay (in quote units)
   * @param slabProgram Slab program ID
   * @returns TransactionInstruction
   */
  buildBuyInstruction(
    user: PublicKey,
    slabMarket: PublicKey,
    quantity: BN,
    limitPrice: BN,
    slabProgram: PublicKey
  ): TransactionInstruction {
    const split: SlabSplit = {
      slabMarket,
      isBuy: true,
      size: quantity,
      price: limitPrice,
    };

    return this.buildExecuteCrossSlabInstruction(user, [split], slabProgram);
  }

  /**
   * Build a sell instruction (market order that executes immediately)
   * V0: Atomic fill only - no resting orders
   * @param user User's public key
   * @param slabMarket Slab market to trade on
   * @param quantity Quantity to sell (in base units)
   * @param limitPrice Minimum price willing to accept (in quote units)
   * @param slabProgram Slab program ID
   * @returns TransactionInstruction
   */
  buildSellInstruction(
    user: PublicKey,
    slabMarket: PublicKey,
    quantity: BN,
    limitPrice: BN,
    slabProgram: PublicKey
  ): TransactionInstruction {
    const split: SlabSplit = {
      slabMarket,
      isBuy: false,
      size: quantity,
      price: limitPrice,
    };

    return this.buildExecuteCrossSlabInstruction(user, [split], slabProgram);
  }
}
