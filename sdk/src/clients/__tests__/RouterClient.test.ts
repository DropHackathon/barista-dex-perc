import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import BN from 'bn.js';
import { RouterClient } from '../RouterClient';
import {
  RouterInstruction,
  SlabSplit,
  LiquidationParams,
  BurnLpSharesParams,
  CancelLpOrdersParams,
  VenueKind,
} from '../../types/router';
import {
  serializeU64,
  serializeU128,
  serializeI64,
  serializeI128,
  serializeBool,
  serializePubkey,
} from '../../utils/serialization';
import {
  MAX_SLABS,
  MAX_INSTRUMENTS,
  MAX_LP_BUCKETS,
  MAX_OPEN_ORDERS,
  PORTFOLIO_SIZE,
} from '../../constants';

describe('RouterClient', () => {
  let connection: Connection;
  let programId: PublicKey;
  let wallet: Keypair;
  let client: RouterClient;

  beforeEach(() => {
    connection = new Connection('http://localhost:8899', 'confirmed');
    programId = PublicKey.unique();
    wallet = Keypair.generate();
    client = new RouterClient(connection, programId, wallet);
  });

  describe('PDA Derivation', () => {
    it('should derive portfolio PDA correctly', () => {
      const user = PublicKey.unique();
      const [pda, bump] = client.derivePortfolioPDA(user);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it('should derive vault PDA correctly', () => {
      const mint = PublicKey.unique();
      const [pda, bump] = client.deriveVaultPDA(mint);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    it('should derive registry PDA correctly', () => {
      const [pda, bump] = client.deriveRegistryPDA();

      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    it('should derive authority PDA correctly', () => {
      const [pda, bump] = client.deriveAuthorityPDA();

      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    it('should derive same PDA for same inputs', () => {
      const user = PublicKey.unique();
      const [pda1] = client.derivePortfolioPDA(user);
      const [pda2] = client.derivePortfolioPDA(user);

      expect(pda1.equals(pda2)).toBe(true);
    });
  });

  describe('Instruction Builders', () => {
    describe('buildInitializeInstruction', () => {
      it('should build valid instruction', () => {
        const payer = wallet.publicKey;
        const ix = client.buildInitializeInstruction(payer);

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.keys.length).toBe(5);
        expect(ix.data[0]).toBe(RouterInstruction.Initialize);
      });
    });

    describe('buildDepositInstruction', () => {
      it('should build valid deposit instruction', async () => {
        const amount = new BN(1000000);
        const user = wallet.publicKey;

        const ix = await client.buildDepositInstruction(amount, user);

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.data[0]).toBe(RouterInstruction.Deposit);
      });
    });

    describe('buildWithdrawInstruction', () => {
      it('should build valid withdraw instruction', async () => {
        const amount = new BN(500000);
        const user = wallet.publicKey;

        const ix = await client.buildWithdrawInstruction(amount, user);

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.data[0]).toBe(RouterInstruction.Withdraw);
      });
    });

    describe('buildInitializePortfolioInstruction', () => {
      it('should build valid instruction', () => {
        const user = wallet.publicKey;
        const ix = client.buildInitializePortfolioInstruction(user);

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.keys.length).toBe(5);
        expect(ix.data[0]).toBe(RouterInstruction.InitializePortfolio);
      });
    });

    describe('buildExecuteCrossSlabInstruction', () => {
      it('should build valid instruction with single split (v0.5)', () => {
        const user = wallet.publicKey;
        const dlpOwner = PublicKey.unique();
        const splits: SlabSplit[] = [
          {
            slabMarket: PublicKey.unique(),
            side: 0, // Buy
            qty: new BN(1000000),
            limitPx: new BN(50000000),
            oracle: PublicKey.unique(),
            dlpOwner, // v0.5: Required for PnL settlement
          },
        ];

        const ix = client.buildExecuteCrossSlabInstruction(user, splits);

        expect(ix.programId.equals(programId)).toBe(true);
        // v0.5: 6 base (user_portfolio, user, dlp_portfolio, registry, authority, system_program)
        // + 1 slab + 1 receipt + 1 oracle = 9 accounts
        expect(ix.keys.length).toBe(9);
        expect(ix.data[0]).toBe(RouterInstruction.ExecuteCrossSlab);
        expect(ix.data[1]).toBe(1); // num_splits
      });

      it('should throw error for multiple splits (v0.5 limitation)', () => {
        const user = wallet.publicKey;
        const dlpOwner = PublicKey.unique();
        const splits: SlabSplit[] = [
          {
            slabMarket: PublicKey.unique(),
            side: 0, // Buy
            qty: new BN(1000000),
            limitPx: new BN(50000000),
            oracle: PublicKey.unique(),
            dlpOwner,
          },
          {
            slabMarket: PublicKey.unique(),
            side: 1, // Sell
            qty: new BN(500000),
            limitPx: new BN(51000000),
            oracle: PublicKey.unique(),
            dlpOwner,
          },
        ];

        // v0.5: Cross-slab routing disabled
        expect(() => {
          client.buildExecuteCrossSlabInstruction(user, splits);
        }).toThrow(/v0.5 only supports single slab execution/);
      });

      it('should throw error when dlpOwner is missing (v0.5)', () => {
        const user = wallet.publicKey;
        const splits: SlabSplit[] = [
          {
            slabMarket: PublicKey.unique(),
            side: 0,
            qty: new BN(1000000),
            limitPx: new BN(50000000),
            oracle: PublicKey.unique(),
            // dlpOwner missing
          },
        ];

        expect(() => {
          client.buildExecuteCrossSlabInstruction(user, splits);
        }).toThrow(/DLP owner .* must be provided/);
      });
    });

    describe('buildLiquidateUserInstruction', () => {
      it('should build valid instruction', () => {
        const params: LiquidationParams = {
          portfolio: PublicKey.unique(),
          oracles: [PublicKey.unique(), PublicKey.unique()],
          slabs: [PublicKey.unique()],
          isPreliq: false,
          currentTs: new BN(Date.now() / 1000),
        };

        const ix = client.buildLiquidateUserInstruction(params);

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.data[0]).toBe(RouterInstruction.LiquidateUser);
        // 2 (signer + portfolio) + 2 oracles + 1 slab = 5 accounts
        expect(ix.keys.length).toBe(5);
      });

      it('should handle preliq flag', () => {
        const params: LiquidationParams = {
          portfolio: PublicKey.unique(),
          oracles: [],
          slabs: [],
          isPreliq: true,
          currentTs: new BN(Date.now() / 1000),
        };

        const ix = client.buildLiquidateUserInstruction(params);
        expect(ix.data[1]).toBe(1); // isPreliq = true
      });
    });

    describe('buildBurnLpSharesInstruction', () => {
      it('should build valid instruction', () => {
        const params: BurnLpSharesParams = {
          user: wallet.publicKey,
          marketId: PublicKey.unique(),
          sharesToBurn: new BN(1000000),
          currentSharePrice: new BN(1050000),
          currentTs: new BN(Date.now() / 1000),
          maxStalenessSeconds: new BN(60),
        };

        const ix = client.buildBurnLpSharesInstruction(params);

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.keys.length).toBe(3);
        expect(ix.data[0]).toBe(RouterInstruction.BurnLpShares);
        expect(ix.data.length).toBe(65); // 1 + 32 + 8 + 8 + 8 + 8
      });
    });

    describe('buildCancelLpOrdersInstruction', () => {
      it('should build valid instruction with single order', () => {
        const params: CancelLpOrdersParams = {
          user: wallet.publicKey,
          marketId: PublicKey.unique(),
          orderIds: [new BN(1)],
          freedQuote: new BN(1000000),
          freedBase: new BN(500000),
        };

        const ix = client.buildCancelLpOrdersInstruction(params);

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.keys.length).toBe(3);
        expect(ix.data[0]).toBe(RouterInstruction.CancelLpOrders);
      });

      it('should build valid instruction with multiple orders', () => {
        const params: CancelLpOrdersParams = {
          user: wallet.publicKey,
          marketId: PublicKey.unique(),
          orderIds: [new BN(1), new BN(2), new BN(3)],
          freedQuote: new BN(1000000),
          freedBase: new BN(500000),
        };

        const ix = client.buildCancelLpOrdersInstruction(params);
        expect(ix.keys.length).toBe(3);
      });

      it('should throw error when exceeding max orders', () => {
        const orderIds = Array.from({ length: 17 }, (_, i) => new BN(i + 1));
        const params: CancelLpOrdersParams = {
          user: wallet.publicKey,
          marketId: PublicKey.unique(),
          orderIds,
          freedQuote: new BN(1000000),
          freedBase: new BN(500000),
        };

        expect(() => client.buildCancelLpOrdersInstruction(params)).toThrow(
          'Cannot cancel more than 16 orders at once'
        );
      });
    });
  });

  describe('Leverage & Margin Helpers', () => {
    describe('calculatePositionSize', () => {
      it('should calculate correct position size for spot (1x)', () => {
        const marginCommitted = new BN(1000);
        const leverage = 1;
        const positionSize = client.calculatePositionSize(marginCommitted, leverage);

        expect(positionSize.toString()).toBe('1000');
      });

      it('should calculate correct position size for 5x leverage', () => {
        const marginCommitted = new BN(1000);
        const leverage = 5;
        const positionSize = client.calculatePositionSize(marginCommitted, leverage);

        expect(positionSize.toString()).toBe('5000');
      });

      it('should calculate correct position size for 10x leverage', () => {
        const marginCommitted = new BN(500);
        const leverage = 10;
        const positionSize = client.calculatePositionSize(marginCommitted, leverage);

        expect(positionSize.toString()).toBe('5000');
      });

      it('should handle large numbers', () => {
        const marginCommitted = new BN('1000000000'); // 1 billion
        const leverage = 5;
        const positionSize = client.calculatePositionSize(marginCommitted, leverage);

        expect(positionSize.toString()).toBe('5000000000');
      });
    });

    describe('calculateActualQuantity', () => {
      it('should calculate actual quantity for spot (1x)', () => {
        const quantityInput = new BN(100);
        const price = new BN(10_000_000); // 10 USDC in 1e6 scale
        const leverage = 1;
        const actualQty = client.calculateActualQuantity(quantityInput, price, leverage);

        expect(actualQty.toString()).toBe('100');
      });

      it('should calculate actual quantity for 5x leverage', () => {
        const quantityInput = new BN(100);
        const price = new BN(10_000_000);
        const leverage = 5;
        const actualQty = client.calculateActualQuantity(quantityInput, price, leverage);

        expect(actualQty.toString()).toBe('500'); // 100 * 5
      });

      it('should calculate actual quantity for 10x leverage', () => {
        const quantityInput = new BN(50);
        const price = new BN(20_000_000);
        const leverage = 10;
        const actualQty = client.calculateActualQuantity(quantityInput, price, leverage);

        expect(actualQty.toString()).toBe('500'); // 50 * 10
      });

      it('should work correctly with different price scales', () => {
        const quantityInput = new BN(1000);
        const price = new BN(1_000_000); // 1 USDC
        const leverage = 2;
        const actualQty = client.calculateActualQuantity(quantityInput, price, leverage);

        expect(actualQty.toString()).toBe('2000');
      });
    });

    describe('calculateMaxQuantityInput', () => {
      it('should throw error for invalid leverage (< 1)', async () => {
        const user = PublicKey.unique();
        const price = new BN(10_000_000);

        await expect(
          client.calculateMaxQuantityInput(user, price, 0.5)
        ).rejects.toThrow('Leverage must be between 1x and 10x');
      });

      it('should throw error for invalid leverage (> 10)', async () => {
        const user = PublicKey.unique();
        const price = new BN(10_000_000);

        await expect(
          client.calculateMaxQuantityInput(user, price, 11)
        ).rejects.toThrow('Leverage must be between 1x and 10x');
      });

      // Note: Tests with actual portfolio fetching require network/mocked connection
    });

    describe('validateLeveragedPosition', () => {
      it('should throw error for invalid leverage range', async () => {
        const user = PublicKey.unique();
        const quantity = new BN(100);
        const price = new BN(10_000_000);

        await expect(
          client.validateLeveragedPosition(user, quantity, price, 0)
        ).rejects.toThrow('Leverage must be between 1x and 10x');

        await expect(
          client.validateLeveragedPosition(user, quantity, price, 15)
        ).rejects.toThrow('Leverage must be between 1x and 10x');
      });

      // Note: Full integration tests with mocked portfolio would go here
      // These would test the actual validation logic with different equity levels
    });

    describe('Leverage calculation examples', () => {
      it('should correctly model spot trading (1x)', () => {
        // User wants to commit 100 units at price 10 USDC
        const quantityInput = new BN(100);
        const price = new BN(10_000_000); // 10 USDC
        const leverage = 1;

        // Calculate what happens
        const marginCommitted = quantityInput.mul(price).div(new BN(1_000_000));
        const positionSize = client.calculatePositionSize(marginCommitted, leverage);
        const actualQuantity = client.calculateActualQuantity(quantityInput, price, leverage);

        // Verify: spot trading means 1:1
        expect(marginCommitted.toString()).toBe('1000'); // 100 * 10 = 1000 USDC
        expect(positionSize.toString()).toBe('1000'); // Same as margin
        expect(actualQuantity.toString()).toBe('100'); // Same as input
      });

      it('should correctly model 5x leverage trading', () => {
        // User wants to commit 100 units at price 10 USDC with 5x leverage
        const quantityInput = new BN(100);
        const price = new BN(10_000_000); // 10 USDC
        const leverage = 5;

        // Calculate
        const marginCommitted = quantityInput.mul(price).div(new BN(1_000_000));
        const positionSize = client.calculatePositionSize(marginCommitted, leverage);
        const actualQuantity = client.calculateActualQuantity(quantityInput, price, leverage);

        // Verify: 5x multiplier effect
        expect(marginCommitted.toString()).toBe('1000'); // 100 * 10 = 1000 USDC committed
        expect(positionSize.toString()).toBe('5000'); // 1000 * 5 = 5000 USDC position
        expect(actualQuantity.toString()).toBe('500'); // 100 * 5 = 500 contracts
      });

      it('should correctly model 10x leverage trading', () => {
        // User commits 50 units at 20 USDC with max 10x leverage
        const quantityInput = new BN(50);
        const price = new BN(20_000_000); // 20 USDC
        const leverage = 10;

        const marginCommitted = quantityInput.mul(price).div(new BN(1_000_000));
        const positionSize = client.calculatePositionSize(marginCommitted, leverage);
        const actualQuantity = client.calculateActualQuantity(quantityInput, price, leverage);

        expect(marginCommitted.toString()).toBe('1000'); // 50 * 20 = 1000 USDC
        expect(positionSize.toString()).toBe('10000'); // 1000 * 10 = 10000 USDC position
        expect(actualQuantity.toString()).toBe('500'); // 50 * 10 = 500 contracts
      });

      it('should demonstrate leverage independence from max quantity input', () => {
        // With 1000 USDC equity and 10 USDC price:
        // Max quantity input is always 100 (equity / price)
        // But leverage changes the actual position opened
        const equity = new BN(1000);
        const price = new BN(10_000_000);

        // Max input: equity / price * 1e6
        const maxInput = equity.mul(new BN(1_000_000)).div(price);
        expect(maxInput.toString()).toBe('100');

        // At 1x: opens 100-unit position
        const pos1x = client.calculateActualQuantity(maxInput, price, 1);
        expect(pos1x.toString()).toBe('100');

        // At 5x: opens 500-unit position (same input!)
        const pos5x = client.calculateActualQuantity(maxInput, price, 5);
        expect(pos5x.toString()).toBe('500');

        // At 10x: opens 1000-unit position (same input!)
        const pos10x = client.calculateActualQuantity(maxInput, price, 10);
        expect(pos10x.toString()).toBe('1000');
      });
    });
  });

  /**
   * Helper: Create a mock registry buffer matching on-chain layout
   */
  function createRegistryBuffer(fields: {
    routerId: PublicKey;
    governance: PublicKey;
    slabCount: number;
    slabs: Array<{
      slabId: PublicKey;
      oracleId: PublicKey;
      active: boolean;
    }>;
  }): Buffer {
    // Simplified registry buffer creation for testing
    // Only includes fields needed for getOracleForSlab tests
    const buffer = Buffer.alloc(10000); // Large enough for registry
    let offset = 0;

    // Discriminator (8 bytes)
    buffer.writeBigUInt64LE(BigInt(0x1234567890abcdef), offset);
    offset += 8;

    // Router ID (32 bytes)
    serializePubkey(fields.routerId).copy(buffer, offset);
    offset += 32;

    // Governance (32 bytes)
    serializePubkey(fields.governance).copy(buffer, offset);
    offset += 32;

    // Slab count (u16 = 2 bytes)
    buffer.writeUInt16LE(fields.slabCount, offset);
    offset += 2;

    // Bump (u8 = 1 byte)
    buffer.writeUInt8(0, offset);
    offset += 1;

    // Padding (5 bytes)
    offset += 5;

    // Liquidation parameters (skip for simplicity - just advance offset)
    offset += 8; // imr
    offset += 8; // mmr
    offset += 8; // liq_band_bps
    offset += 16; // preliq_buffer (i128)
    offset += 8; // preliq_band_bps
    offset += 8; // router_cap_per_slab
    offset += 16; // min_equity_to_quote (i128)
    offset += 8; // oracle_tolerance_bps
    offset += 8; // _padding2

    // Skip complex nested structs (~376 bytes as estimated in deserializeRegistry)
    offset += 376;

    // Now write slab entries
    const SLAB_ENTRY_SIZE = 168;
    for (let i = 0; i < fields.slabs.length; i++) {
      const slab = fields.slabs[i];
      const entryOffset = offset + (i * SLAB_ENTRY_SIZE);

      // slab_id (Pubkey - 32 bytes)
      serializePubkey(slab.slabId).copy(buffer, entryOffset);

      // version_hash ([u8; 32] - 32 bytes) - skip
      // oracle_id (Pubkey - 32 bytes)
      serializePubkey(slab.oracleId).copy(buffer, entryOffset + 64);

      // Skip other fields (imr, mmr, etc.)

      // active (bool - 1 byte at offset 160)
      buffer.writeUInt8(slab.active ? 1 : 0, entryOffset + 160);
    }

    return buffer;
  }

  describe('Portfolio Deserialization', () => {
    /**
     * Helper: Create a mock portfolio buffer matching on-chain layout
     */
    function createPortfolioBuffer(fields: {
      routerId?: PublicKey;
      user?: PublicKey;
      equity?: BN;
      im?: BN;
      mm?: BN;
      freeCollateral?: BN;
      lastMarkTs?: BN;
      exposureCount?: number;
      bump?: number;
      health?: BN;
      lastLiquidationTs?: BN;
      cooldownSeconds?: BN;
      principal?: BN;
      pnl?: BN;
      vestedPnl?: BN;
      lastSlot?: BN;
      pnlIndexCheckpoint?: BN;
      exposures?: Array<{ slabIndex: number; instrumentIndex: number; positionQty: BN }>;
      lpBuckets?: Array<{
        marketId: PublicKey;
        venueKind: VenueKind;
        hasAmm: boolean;
        amm?: { lpShares: BN; sharePriceCached: BN; lastUpdateTs: BN };
        hasSlab: boolean;
        slab?: {
          reservedQuote: BN;
          reservedBase: BN;
          openOrderCount: number;
          openOrderIds: BN[];
        };
        im: BN;
        mm: BN;
        active: boolean;
      }>;
    }): Buffer {
      const buffer = Buffer.alloc(PORTFOLIO_SIZE);
      let offset = 0;

      // Discriminator (8 bytes) - using a mock value
      buffer.writeBigUInt64LE(BigInt(0x1234567890abcdef), offset);
      offset += 8;

      // Identity
      serializePubkey(fields.routerId || PublicKey.default).copy(buffer, offset);
      offset += 32;
      serializePubkey(fields.user || PublicKey.default).copy(buffer, offset);
      offset += 32;

      // Cross-margin state
      serializeI128(fields.equity || new BN(0)).copy(buffer, offset);
      offset += 16;
      serializeU128(fields.im || new BN(0)).copy(buffer, offset);
      offset += 16;
      serializeU128(fields.mm || new BN(0)).copy(buffer, offset);
      offset += 16;
      serializeI128(fields.freeCollateral || new BN(0)).copy(buffer, offset);
      offset += 16;
      serializeU64(fields.lastMarkTs || new BN(0)).copy(buffer, offset);
      offset += 8;
      buffer.writeUInt16LE(fields.exposureCount || 0, offset);
      offset += 2;
      buffer.writeUInt8(fields.bump || 0, offset);
      offset += 1;
      offset += 5; // _padding

      // Liquidation tracking
      serializeI128(fields.health || new BN(0)).copy(buffer, offset);
      offset += 16;
      serializeU64(fields.lastLiquidationTs || new BN(0)).copy(buffer, offset);
      offset += 8;
      serializeU64(fields.cooldownSeconds || new BN(0)).copy(buffer, offset);
      offset += 8;
      offset += 8; // _padding2

      // PnL vesting
      serializeI128(fields.principal || new BN(0)).copy(buffer, offset);
      offset += 16;
      serializeI128(fields.pnl || new BN(0)).copy(buffer, offset);
      offset += 16;
      serializeI128(fields.vestedPnl || new BN(0)).copy(buffer, offset);
      offset += 16;
      serializeU64(fields.lastSlot || new BN(0)).copy(buffer, offset);
      offset += 8;
      serializeI128(fields.pnlIndexCheckpoint || new BN(0)).copy(buffer, offset);
      offset += 16;
      offset += 8; // _padding4

      // Exposures array (MAX_SLABS * MAX_INSTRUMENTS)
      const exposureSet = new Map<string, BN>();
      if (fields.exposures) {
        for (const exp of fields.exposures) {
          const key = `${exp.slabIndex},${exp.instrumentIndex}`;
          exposureSet.set(key, exp.positionQty);
        }
      }

      for (let slabIdx = 0; slabIdx < MAX_SLABS; slabIdx++) {
        for (let instIdx = 0; instIdx < MAX_INSTRUMENTS; instIdx++) {
          const key = `${slabIdx},${instIdx}`;
          const positionQty = exposureSet.get(key) || new BN(0);

          buffer.writeUInt16LE(slabIdx, offset);
          offset += 2;
          buffer.writeUInt16LE(instIdx, offset);
          offset += 2;
          serializeI64(positionQty).copy(buffer, offset);
          offset += 8;
        }
      }

      // LP Buckets array (MAX_LP_BUCKETS)
      for (let i = 0; i < MAX_LP_BUCKETS; i++) {
        const bucket = fields.lpBuckets?.[i];

        // VenueId (40 bytes)
        serializePubkey(bucket?.marketId || PublicKey.default).copy(buffer, offset);
        offset += 32;
        buffer.writeUInt8(bucket?.venueKind ?? VenueKind.Slab, offset);
        offset += 1;
        offset += 7; // _padding

        // Option<AmmLp>
        const hasAmm = bucket?.hasAmm ?? false;
        buffer.writeUInt8(hasAmm ? 1 : 0, offset);
        offset += 1;
        if (hasAmm && bucket?.amm) {
          serializeU64(bucket.amm.lpShares).copy(buffer, offset);
          offset += 8;
          serializeI64(bucket.amm.sharePriceCached).copy(buffer, offset);
          offset += 8;
          serializeU64(bucket.amm.lastUpdateTs).copy(buffer, offset);
          offset += 8;
          offset += 8; // _padding
        } else {
          offset += 32; // Skip AmmLp size
        }

        // Option<SlabLp>
        const hasSlab = bucket?.hasSlab ?? false;
        buffer.writeUInt8(hasSlab ? 1 : 0, offset);
        offset += 1;
        if (hasSlab && bucket?.slab) {
          serializeU128(bucket.slab.reservedQuote).copy(buffer, offset);
          offset += 16;
          serializeU128(bucket.slab.reservedBase).copy(buffer, offset);
          offset += 16;
          buffer.writeUInt16LE(bucket.slab.openOrderCount, offset);
          offset += 2;
          offset += 6; // _padding
          for (let j = 0; j < MAX_OPEN_ORDERS; j++) {
            const orderId = bucket.slab.openOrderIds[j] || new BN(0);
            serializeU64(orderId).copy(buffer, offset);
            offset += 8;
          }
        } else {
          offset += 16 + 16 + 2 + 6 + 8 * MAX_OPEN_ORDERS;
        }

        // Final bucket fields
        serializeU128(bucket?.im || new BN(0)).copy(buffer, offset);
        offset += 16;
        serializeU128(bucket?.mm || new BN(0)).copy(buffer, offset);
        offset += 16;
        buffer.writeUInt8(bucket?.active ? 1 : 0, offset);
        offset += 1;
        offset += 7; // _padding
      }

      return buffer;
    }

    it('should deserialize empty portfolio correctly', async () => {
      const routerId = PublicKey.unique();
      const user = PublicKey.unique();

      const buffer = createPortfolioBuffer({
        routerId,
        user,
        bump: 255,
      });

      // Mock getAccountInfo to return our buffer
      const mockAccountInfo = {
        data: buffer,
        executable: false,
        lamports: 1000000,
        owner: programId,
      };

      jest.spyOn(connection, 'getAccountInfo').mockResolvedValue(mockAccountInfo);

      const portfolio = await client.getPortfolio(user);

      expect(portfolio).toBeDefined();
      expect(portfolio!.routerId.equals(routerId)).toBe(true);
      expect(portfolio!.user.equals(user)).toBe(true);
      expect(portfolio!.bump).toBe(255);
      expect(portfolio!.equity.toString()).toBe('0');
      expect(portfolio!.im.toString()).toBe('0');
      expect(portfolio!.mm.toString()).toBe('0');
      expect(portfolio!.exposures.length).toBe(0);
      expect(portfolio!.lpBuckets.length).toBe(0);
    });

    it('should deserialize portfolio with positive equity and collateral', async () => {
      const routerId = PublicKey.unique();
      const user = PublicKey.unique();
      const equity = new BN(1000000000); // 1000 USDC (scaled)
      const im = new BN(200000000); // 200 USDC
      const mm = new BN(100000000); // 100 USDC
      const freeCollateral = new BN(800000000); // 800 USDC

      const buffer = createPortfolioBuffer({
        routerId,
        user,
        equity,
        im,
        mm,
        freeCollateral,
        bump: 254,
      });

      const mockAccountInfo = {
        data: buffer,
        executable: false,
        lamports: 1000000,
        owner: programId,
      };

      jest.spyOn(connection, 'getAccountInfo').mockResolvedValue(mockAccountInfo);

      const portfolio = await client.getPortfolio(user);

      expect(portfolio!.equity.toString()).toBe(equity.toString());
      expect(portfolio!.im.toString()).toBe(im.toString());
      expect(portfolio!.mm.toString()).toBe(mm.toString());
      expect(portfolio!.freeCollateral.toString()).toBe(freeCollateral.toString());
    });

    it('should deserialize portfolio with negative PnL', async () => {
      const routerId = PublicKey.unique();
      const user = PublicKey.unique();
      const principal = new BN(1000000000); // 1000 USDC deposited
      const pnl = new BN(-50000000); // -50 USDC unrealized loss
      const vestedPnl = new BN(-30000000); // -30 USDC vested
      const equity = principal.add(pnl); // 950 USDC

      const buffer = createPortfolioBuffer({
        routerId,
        user,
        equity,
        principal,
        pnl,
        vestedPnl,
        lastSlot: new BN(123456),
        bump: 253,
      });

      const mockAccountInfo = {
        data: buffer,
        executable: false,
        lamports: 1000000,
        owner: programId,
      };

      jest.spyOn(connection, 'getAccountInfo').mockResolvedValue(mockAccountInfo);

      const portfolio = await client.getPortfolio(user);

      expect(portfolio!.principal.toString()).toBe(principal.toString());
      expect(portfolio!.pnl.isNeg()).toBe(true);
      expect(portfolio!.pnl.toString()).toBe(pnl.toString());
      expect(portfolio!.vestedPnl.toString()).toBe(vestedPnl.toString());
      expect(portfolio!.equity.toString()).toBe(equity.toString());
      expect(portfolio!.lastSlot.toString()).toBe('123456');
    });

    it('should deserialize portfolio with exposures', async () => {
      const routerId = PublicKey.unique();
      const user = PublicKey.unique();

      const buffer = createPortfolioBuffer({
        routerId,
        user,
        exposureCount: 3,
        bump: 252,
        exposures: [
          { slabIndex: 0, instrumentIndex: 0, positionQty: new BN(1000000) },
          { slabIndex: 0, instrumentIndex: 1, positionQty: new BN(-500000) },
          { slabIndex: 5, instrumentIndex: 10, positionQty: new BN(2000000) },
        ],
      });

      const mockAccountInfo = {
        data: buffer,
        executable: false,
        lamports: 1000000,
        owner: programId,
      };

      jest.spyOn(connection, 'getAccountInfo').mockResolvedValue(mockAccountInfo);

      const portfolio = await client.getPortfolio(user);

      expect(portfolio!.exposures.length).toBe(3);

      const exp1 = portfolio!.exposures.find(
        (e) => e.slabIndex === 0 && e.instrumentIndex === 0
      );
      expect(exp1).toBeDefined();
      expect(exp1!.positionQty.toString()).toBe('1000000');

      const exp2 = portfolio!.exposures.find(
        (e) => e.slabIndex === 0 && e.instrumentIndex === 1
      );
      expect(exp2).toBeDefined();
      expect(exp2!.positionQty.isNeg()).toBe(true);
      expect(exp2!.positionQty.toString()).toBe('-500000');

      const exp3 = portfolio!.exposures.find(
        (e) => e.slabIndex === 5 && e.instrumentIndex === 10
      );
      expect(exp3).toBeDefined();
      expect(exp3!.positionQty.toString()).toBe('2000000');
    });

    it('should deserialize portfolio with AMM LP bucket', async () => {
      const routerId = PublicKey.unique();
      const user = PublicKey.unique();
      const marketId = PublicKey.unique();

      const buffer = createPortfolioBuffer({
        routerId,
        user,
        bump: 251,
        lpBuckets: [
          {
            marketId,
            venueKind: VenueKind.Amm,
            hasAmm: true,
            amm: {
              lpShares: new BN(5000000),
              sharePriceCached: new BN(1050000),
              lastUpdateTs: new BN(Date.now() / 1000),
            },
            hasSlab: false,
            im: new BN(100000),
            mm: new BN(50000),
            active: true,
          },
        ],
      });

      const mockAccountInfo = {
        data: buffer,
        executable: false,
        lamports: 1000000,
        owner: programId,
      };

      jest.spyOn(connection, 'getAccountInfo').mockResolvedValue(mockAccountInfo);

      const portfolio = await client.getPortfolio(user);

      expect(portfolio!.lpBuckets.length).toBe(1);

      const bucket = portfolio!.lpBuckets[0];
      expect(bucket.venue.marketId.equals(marketId)).toBe(true);
      expect(bucket.venue.venueKind).toBe(VenueKind.Amm);
      expect(bucket.amm).toBeDefined();
      expect(bucket.amm!.lpShares.toString()).toBe('5000000');
      expect(bucket.amm!.sharePriceCached.toString()).toBe('1050000');
      expect(bucket.slab).toBeNull();
      expect(bucket.im.toString()).toBe('100000');
      expect(bucket.mm.toString()).toBe('50000');
      expect(bucket.active).toBe(true);
    });

    it('should deserialize portfolio with Slab LP bucket', async () => {
      const routerId = PublicKey.unique();
      const user = PublicKey.unique();
      const marketId = PublicKey.unique();

      const buffer = createPortfolioBuffer({
        routerId,
        user,
        bump: 250,
        lpBuckets: [
          {
            marketId,
            venueKind: VenueKind.Slab,
            hasAmm: false,
            hasSlab: true,
            slab: {
              reservedQuote: new BN(10000000),
              reservedBase: new BN(5000000),
              openOrderCount: 3,
              openOrderIds: [new BN(101), new BN(102), new BN(103)],
            },
            im: new BN(200000),
            mm: new BN(100000),
            active: true,
          },
        ],
      });

      const mockAccountInfo = {
        data: buffer,
        executable: false,
        lamports: 1000000,
        owner: programId,
      };

      jest.spyOn(connection, 'getAccountInfo').mockResolvedValue(mockAccountInfo);

      const portfolio = await client.getPortfolio(user);

      expect(portfolio!.lpBuckets.length).toBe(1);

      const bucket = portfolio!.lpBuckets[0];
      expect(bucket.venue.marketId.equals(marketId)).toBe(true);
      expect(bucket.venue.venueKind).toBe(VenueKind.Slab);
      expect(bucket.amm).toBeNull();
      expect(bucket.slab).toBeDefined();
      expect(bucket.slab!.reservedQuote.toString()).toBe('10000000');
      expect(bucket.slab!.reservedBase.toString()).toBe('5000000');
      expect(bucket.slab!.openOrderCount).toBe(3);
      expect(bucket.slab!.openOrderIds.length).toBe(3);
      expect(bucket.slab!.openOrderIds[0].toString()).toBe('101');
      expect(bucket.slab!.openOrderIds[1].toString()).toBe('102');
      expect(bucket.slab!.openOrderIds[2].toString()).toBe('103');
    });

    it('should deserialize complex portfolio with multiple exposures and LP buckets', async () => {
      const routerId = PublicKey.unique();
      const user = PublicKey.unique();
      const market1 = PublicKey.unique();
      const market2 = PublicKey.unique();

      const buffer = createPortfolioBuffer({
        routerId,
        user,
        equity: new BN(5000000000),
        im: new BN(1000000000),
        mm: new BN(500000000),
        freeCollateral: new BN(4000000000),
        exposureCount: 4,
        bump: 249,
        health: new BN(2000000000),
        principal: new BN(4500000000),
        pnl: new BN(500000000),
        vestedPnl: new BN(300000000),
        lastSlot: new BN(999999),
        exposures: [
          { slabIndex: 0, instrumentIndex: 0, positionQty: new BN(10000000) },
          { slabIndex: 0, instrumentIndex: 1, positionQty: new BN(-5000000) },
          { slabIndex: 1, instrumentIndex: 0, positionQty: new BN(3000000) },
          { slabIndex: 2, instrumentIndex: 5, positionQty: new BN(1000000) },
        ],
        lpBuckets: [
          {
            marketId: market1,
            venueKind: VenueKind.Amm,
            hasAmm: true,
            amm: {
              lpShares: new BN(8000000),
              sharePriceCached: new BN(1100000),
              lastUpdateTs: new BN(1234567890),
            },
            hasSlab: false,
            im: new BN(300000),
            mm: new BN(150000),
            active: true,
          },
          {
            marketId: market2,
            venueKind: VenueKind.Slab,
            hasAmm: false,
            hasSlab: true,
            slab: {
              reservedQuote: new BN(20000000),
              reservedBase: new BN(15000000),
              openOrderCount: 5,
              openOrderIds: [
                new BN(201),
                new BN(202),
                new BN(203),
                new BN(204),
                new BN(205),
              ],
            },
            im: new BN(400000),
            mm: new BN(200000),
            active: true,
          },
        ],
      });

      const mockAccountInfo = {
        data: buffer,
        executable: false,
        lamports: 1000000,
        owner: programId,
      };

      jest.spyOn(connection, 'getAccountInfo').mockResolvedValue(mockAccountInfo);

      const portfolio = await client.getPortfolio(user);

      // Verify core fields
      expect(portfolio!.equity.toString()).toBe('5000000000');
      expect(portfolio!.im.toString()).toBe('1000000000');
      expect(portfolio!.mm.toString()).toBe('500000000');
      expect(portfolio!.freeCollateral.toString()).toBe('4000000000');
      expect(portfolio!.health.toString()).toBe('2000000000');
      expect(portfolio!.principal.toString()).toBe('4500000000');
      expect(portfolio!.pnl.toString()).toBe('500000000');
      expect(portfolio!.vestedPnl.toString()).toBe('300000000');

      // Verify exposures
      expect(portfolio!.exposures.length).toBe(4);

      // Verify LP buckets
      expect(portfolio!.lpBuckets.length).toBe(2);

      const ammBucket = portfolio!.lpBuckets.find(
        (b) => b.venue.venueKind === VenueKind.Amm
      );
      expect(ammBucket).toBeDefined();
      expect(ammBucket!.amm).toBeDefined();
      expect(ammBucket!.amm!.lpShares.toString()).toBe('8000000');

      const slabBucket = portfolio!.lpBuckets.find(
        (b) => b.venue.venueKind === VenueKind.Slab
      );
      expect(slabBucket).toBeDefined();
      expect(slabBucket!.slab).toBeDefined();
      expect(slabBucket!.slab!.openOrderIds.length).toBe(5);
    });

    it('should handle portfolio with liquidation tracking fields', async () => {
      const routerId = PublicKey.unique();
      const user = PublicKey.unique();
      const now = Math.floor(Date.now() / 1000);

      const buffer = createPortfolioBuffer({
        routerId,
        user,
        equity: new BN(100000000), // Low equity
        health: new BN(-10000000), // Negative health (underwater)
        lastLiquidationTs: new BN(now - 3600), // Liquidated 1hr ago
        cooldownSeconds: new BN(86400), // 24hr cooldown
        bump: 248,
      });

      const mockAccountInfo = {
        data: buffer,
        executable: false,
        lamports: 1000000,
        owner: programId,
      };

      jest.spyOn(connection, 'getAccountInfo').mockResolvedValue(mockAccountInfo);

      const portfolio = await client.getPortfolio(user);

      expect(portfolio!.health.isNeg()).toBe(true);
      expect(portfolio!.health.toString()).toBe('-10000000');
      expect(portfolio!.lastLiquidationTs.toString()).toBe((now - 3600).toString());
      expect(portfolio!.cooldownSeconds.toString()).toBe('86400');
    });
  });

  describe('Oracle Auto-Fetch', () => {
    describe('getOracleForSlab', () => {
      it('should return oracle for registered slab', async () => {
        const slabId = PublicKey.unique();
        const oracleId = PublicKey.unique();
        const routerId = PublicKey.unique();
        const governance = PublicKey.unique();

        // Mock registry with one registered slab
        const registryBuffer = createRegistryBuffer({
          routerId,
          governance,
          slabCount: 1,
          slabs: [
            {
              slabId,
              oracleId,
              active: true,
            },
          ],
        });

        const mockAccountInfo = {
          data: registryBuffer,
          executable: false,
          lamports: 1000000,
          owner: programId,
        };

        jest.spyOn(connection, 'getAccountInfo').mockResolvedValue(mockAccountInfo);

        const oracle = await client.getOracleForSlab(slabId);

        expect(oracle).toEqual(oracleId);
      });

      it('should return null for unregistered slab', async () => {
        const slabId = PublicKey.unique();
        const routerId = PublicKey.unique();
        const governance = PublicKey.unique();

        // Mock registry with no slabs
        const registryBuffer = createRegistryBuffer({
          routerId,
          governance,
          slabCount: 0,
          slabs: [],
        });

        const mockAccountInfo = {
          data: registryBuffer,
          executable: false,
          lamports: 1000000,
          owner: programId,
        };

        jest.spyOn(connection, 'getAccountInfo').mockResolvedValue(mockAccountInfo);

        const oracle = await client.getOracleForSlab(slabId);

        expect(oracle).toBeNull();
      });

      it('should return null for inactive slab', async () => {
        const slabId = PublicKey.unique();
        const oracleId = PublicKey.unique();
        const routerId = PublicKey.unique();
        const governance = PublicKey.unique();

        // Mock registry with inactive slab
        const registryBuffer = createRegistryBuffer({
          routerId,
          governance,
          slabCount: 1,
          slabs: [
            {
              slabId,
              oracleId,
              active: false, // Inactive
            },
          ],
        });

        const mockAccountInfo = {
          data: registryBuffer,
          executable: false,
          lamports: 1000000,
          owner: programId,
        };

        jest.spyOn(connection, 'getAccountInfo').mockResolvedValue(mockAccountInfo);

        const oracle = await client.getOracleForSlab(slabId);

        expect(oracle).toBeNull();
      });

      it('should throw error if registry not found', async () => {
        const slabId = PublicKey.unique();

        jest.spyOn(connection, 'getAccountInfo').mockResolvedValue(null);

        await expect(client.getOracleForSlab(slabId)).rejects.toThrow(
          'Registry account not found'
        );
      });
    });

    describe('buildBuyInstruction with auto-oracle-fetch (v0.5)', () => {
      it('should auto-fetch oracle and DLP owner when not provided', async () => {
        const user = PublicKey.unique();
        const slabMarket = PublicKey.unique();
        const oracleId = PublicKey.unique();
        const dlpOwner = PublicKey.unique();
        const quantity = new BN(1000);
        const price = new BN(50000000);

        // Mock getOracleForSlab and getDlpOwnerForSlab
        jest.spyOn(client, 'getOracleForSlab').mockResolvedValue(oracleId);
        jest.spyOn(client, 'getDlpOwnerForSlab').mockResolvedValue(dlpOwner);

        const instruction = await client.buildBuyInstruction(
          user,
          slabMarket,
          quantity,
          price
          // Oracle omitted - should auto-fetch
        );

        expect(client.getOracleForSlab).toHaveBeenCalledWith(slabMarket);
        expect(client.getDlpOwnerForSlab).toHaveBeenCalledWith(slabMarket);
        expect(instruction).toBeDefined();
        expect(instruction.keys.length).toBeGreaterThan(0);
      });

      it('should use provided oracle but still fetch DLP owner', async () => {
        const user = PublicKey.unique();
        const slabMarket = PublicKey.unique();
        const providedOracle = PublicKey.unique();
        const dlpOwner = PublicKey.unique();
        const quantity = new BN(1000);
        const price = new BN(50000000);

        const getOracleSpy = jest.spyOn(client, 'getOracleForSlab');
        jest.spyOn(client, 'getDlpOwnerForSlab').mockResolvedValue(dlpOwner);

        const instruction = await client.buildBuyInstruction(
          user,
          slabMarket,
          quantity,
          price,
          providedOracle // Oracle provided explicitly
        );

        // Should NOT call getOracleForSlab
        expect(getOracleSpy).not.toHaveBeenCalled();
        // Should still fetch DLP owner (v0.5 requirement)
        expect(client.getDlpOwnerForSlab).toHaveBeenCalledWith(slabMarket);
        expect(instruction).toBeDefined();
      });

      it('should throw error when oracle not found', async () => {
        const user = PublicKey.unique();
        const slabMarket = PublicKey.unique();
        const quantity = new BN(1000);
        const price = new BN(50000000);

        // Mock getOracleForSlab to return null
        jest.spyOn(client, 'getOracleForSlab').mockResolvedValue(null);

        await expect(
          client.buildBuyInstruction(user, slabMarket, quantity, price)
        ).rejects.toThrow(/Oracle not found for slab/);
      });

      it('should throw error when DLP owner not found (v0.5)', async () => {
        const user = PublicKey.unique();
        const slabMarket = PublicKey.unique();
        const oracleId = PublicKey.unique();
        const quantity = new BN(1000);
        const price = new BN(50000000);

        // Mock successful oracle fetch but failed DLP owner fetch
        jest.spyOn(client, 'getOracleForSlab').mockResolvedValue(oracleId);
        jest.spyOn(client, 'getDlpOwnerForSlab').mockResolvedValue(null);

        await expect(
          client.buildBuyInstruction(user, slabMarket, quantity, price)
        ).rejects.toThrow(/Failed to fetch DLP owner for slab/);
      });
    });

    describe('buildSellInstruction with auto-oracle-fetch (v0.5)', () => {
      it('should auto-fetch oracle and DLP owner when not provided', async () => {
        const user = PublicKey.unique();
        const slabMarket = PublicKey.unique();
        const oracleId = PublicKey.unique();
        const dlpOwner = PublicKey.unique();
        const quantity = new BN(1000);
        const price = new BN(50000000);

        // Mock getOracleForSlab and getDlpOwnerForSlab
        jest.spyOn(client, 'getOracleForSlab').mockResolvedValue(oracleId);
        jest.spyOn(client, 'getDlpOwnerForSlab').mockResolvedValue(dlpOwner);

        const instruction = await client.buildSellInstruction(
          user,
          slabMarket,
          quantity,
          price
          // Oracle omitted - should auto-fetch
        );

        expect(client.getOracleForSlab).toHaveBeenCalledWith(slabMarket);
        expect(client.getDlpOwnerForSlab).toHaveBeenCalledWith(slabMarket);
        expect(instruction).toBeDefined();
        expect(instruction.keys.length).toBeGreaterThan(0);
      });

      it('should use provided oracle but still fetch DLP owner', async () => {
        const user = PublicKey.unique();
        const slabMarket = PublicKey.unique();
        const providedOracle = PublicKey.unique();
        const dlpOwner = PublicKey.unique();
        const quantity = new BN(1000);
        const price = new BN(50000000);

        const getOracleSpy = jest.spyOn(client, 'getOracleForSlab');
        jest.spyOn(client, 'getDlpOwnerForSlab').mockResolvedValue(dlpOwner);

        const instruction = await client.buildSellInstruction(
          user,
          slabMarket,
          quantity,
          price,
          providedOracle // Oracle provided explicitly
        );

        // Should NOT call getOracleForSlab
        expect(getOracleSpy).not.toHaveBeenCalled();
        // Should still fetch DLP owner (v0.5 requirement)
        expect(client.getDlpOwnerForSlab).toHaveBeenCalledWith(slabMarket);
        expect(instruction).toBeDefined();
      });

      it('should throw error when oracle not found', async () => {
        const user = PublicKey.unique();
        const slabMarket = PublicKey.unique();
        const quantity = new BN(1000);
        const price = new BN(50000000);

        // Mock getOracleForSlab to return null
        jest.spyOn(client, 'getOracleForSlab').mockResolvedValue(null);

        await expect(
          client.buildSellInstruction(user, slabMarket, quantity, price)
        ).rejects.toThrow(/Oracle not found for slab/);
      });

      it('should throw error when DLP owner not found (v0.5)', async () => {
        const user = PublicKey.unique();
        const slabMarket = PublicKey.unique();
        const oracleId = PublicKey.unique();
        const quantity = new BN(1000);
        const price = new BN(50000000);

        // Mock successful oracle fetch but failed DLP owner fetch
        jest.spyOn(client, 'getOracleForSlab').mockResolvedValue(oracleId);
        jest.spyOn(client, 'getDlpOwnerForSlab').mockResolvedValue(null);

        await expect(
          client.buildSellInstruction(user, slabMarket, quantity, price)
        ).rejects.toThrow(/Failed to fetch DLP owner for slab/);
      });
    });
  });
});
