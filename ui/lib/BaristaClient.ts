import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { RouterClient, SlabClient, SLAB_SIZE } from '@barista-dex/sdk';
import BN from 'bn.js';

/**
 * Unified client wrapping RouterClient and SlabClient
 * Can work without wallet for read-only market data operations
 */
export class BaristaClient {
  public router: RouterClient | null;
  public slab: SlabClient;
  private connection: Connection;
  private routerProgramId: PublicKey;
  private slabProgramId: PublicKey;
  private oracleProgramId: PublicKey | null;

  constructor(
    connection: Connection,
    publicKey: PublicKey | null,
    routerProgramId: PublicKey,
    slabProgramId: PublicKey,
    wallet?: any,
    oracleProgramId?: PublicKey
  ) {
    this.connection = connection;
    this.routerProgramId = routerProgramId;
    this.slabProgramId = slabProgramId;
    this.oracleProgramId = oracleProgramId || null;

    // Router client requires wallet, only create if we have one
    this.router = publicKey && wallet
      ? new RouterClient(connection, routerProgramId, wallet)
      : null;

    // Slab client can work without wallet for read-only operations
    this.slab = new SlabClient(connection, slabProgramId);
  }

  // Fetch all slab accounts using getProgramAccounts
  async getAllSlabs(): Promise<PublicKey[]> {
    const accounts = await this.connection.getProgramAccounts(
      this.slabProgramId
    );
    return accounts.map((account) => account.pubkey);
  }

  // Delegate to SlabClient methods
  async getSlabState(address: PublicKey) {
    return this.slab.getSlabState(address);
  }

  async getInstruments(address: PublicKey) {
    return this.slab.getInstruments(address);
  }

  // Fetch oracle price for an instrument (localnet support)
  async getOraclePrice(instrument: PublicKey): Promise<number | null> {
    if (!this.oracleProgramId) {
      return null;
    }

    try {
      // Find all oracle accounts owned by oracle program
      const oracleAccounts = await this.connection.getProgramAccounts(this.oracleProgramId);

      // Find oracle for this instrument
      // Oracle format: magic(8) + version(1) + bump(1) + padding(6) + authority(32) + instrument(32) + price(8) + ...
      // Instrument is at offset 48, price is at offset 80
      for (const {pubkey, account} of oracleAccounts) {
        if (account.data.length === 128) {
          const oracleInstrument = new PublicKey(account.data.slice(48, 80));
          if (oracleInstrument.equals(instrument)) {
            const priceLow = account.data.readBigInt64LE(80);
            const price = Number(priceLow) / 1_000_000; // Convert from 1e6 scale
            return price;
          }
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  // Portfolio address derivation (no wallet required)
  async getPortfolioAddress(user: PublicKey): Promise<PublicKey> {
    // Portfolio address is derived using createWithSeed (not PDA)
    return await PublicKey.createWithSeed(
      user,
      'portfolio',
      this.routerProgramId
    );
  }

  // Delegate to RouterClient methods (require wallet)
  async getPortfolio(address?: PublicKey) {
    if (!this.router) {
      return null; // Return null instead of throwing when wallet not connected
    }
    return this.router.getPortfolio(address);
  }

  async executeOrder(params: any) {
    if (!this.router) {
      throw new Error('Executing orders requires wallet connection');
    }
    return this.router.executeOrder(params);
  }

  async deposit(amount: BN, user: PublicKey, wallet: any): Promise<string> {
    if (!this.router) {
      throw new Error('Deposit requires wallet connection');
    }

    try {
      // Ensure portfolio exists (auto-create if needed)
      const ensurePortfolioIxs = await this.router.ensurePortfolioInstructions(user);
      console.log('[BaristaClient] Portfolio instructions needed:', ensurePortfolioIxs.length);

      // Build deposit instruction
      const depositIx = await this.router.buildDepositInstruction(amount, user);
      console.log('[BaristaClient] Deposit instruction built');

      // Create transaction with all instructions
      const tx = new Transaction();
      if (ensurePortfolioIxs.length > 0) {
        tx.add(...ensurePortfolioIxs);
      }
      tx.add(depositIx);

      // Set transaction metadata
      const { blockhash } = await this.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = user;

      console.log('[BaristaClient] Transaction details:', {
        numInstructions: tx.instructions.length,
        feePayer: tx.feePayer?.toBase58(),
        blockhash: tx.recentBlockhash
      });

      // Sign transaction
      const signed = await wallet.signTransaction(tx);
      console.log('[BaristaClient] Transaction signed');

      // Try to simulate for better debugging, but proceed even if simulation fails
      try {
        console.log('[BaristaClient] Simulating transaction...');
        const simulation = await this.connection.simulateTransaction(signed);
        console.log('[BaristaClient] Simulation result:', {
          err: simulation.value.err,
          logs: simulation.value.logs
        });

        if (simulation.value.err) {
          console.error('[BaristaClient] Simulation shows error but will try to send anyway');
        }
      } catch (simError: any) {
        console.error('[BaristaClient] Simulation itself failed:', simError.message);
      }

      // Send transaction
      console.log('[BaristaClient] Sending transaction...');
      const signature = await this.connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });

      console.log('[BaristaClient] Transaction sent:', signature);

      // Confirm transaction
      await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight: (await this.connection.getLatestBlockhash()).lastValidBlockHeight
      });

      console.log('[BaristaClient] Transaction confirmed');
      return signature;
    } catch (error: any) {
      console.error('[BaristaClient] Deposit error:', error);
      console.error('[BaristaClient] Error message:', error.message);
      console.error('[BaristaClient] Error stack:', error.stack);
      throw error;
    }
  }

  async hasPortfolio(user: PublicKey): Promise<boolean> {
    if (!this.router) {
      return false;
    }
    try {
      const portfolio = await this.router.getPortfolio(user);
      return portfolio !== null;
    } catch (error) {
      return false;
    }
  }
}
