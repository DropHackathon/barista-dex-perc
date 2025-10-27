import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { RouterClient, parseAmount, formatAmount, ExecutionType } from '@barista-dex/sdk';
import { loadKeypair, getDefaultKeypairPath } from '../../utils/wallet';
import { displaySuccess, displayError, getExplorerUrl } from '../../utils/display';
import { getNetworkConfig } from '../../config/networks';
import chalk from 'chalk';
import ora from 'ora';
import BN from 'bn.js';

// Decimal places for quantity and price (6 decimals like SOL/USDC)
const DECIMALS = 6;

interface SellOptions {
  slab: string;        // Required in v0 (cross-slab routing disabled)
  instrument?: string; // Optional: instrument selection within slab (for v1+ multi-instrument slabs)
  quantity: string;
  price?: string;  // Optional: if not provided, market order
  leverage?: string;  // Optional: "5x", "10x", etc. Default: 1x (spot)
  keypair?: string;
  url?: string;
  network?: string;
}

/**
 * Parse leverage string to number
 * @param leverageStr "5x", "10x", or just "5", "10"
 * @returns Leverage as number (1-10)
 */
function parseLeverage(leverageStr: string): number {
  const cleaned = leverageStr.toLowerCase().replace('x', '').trim();
  const leverage = parseFloat(cleaned);

  if (isNaN(leverage) || leverage < 1 || leverage > 10) {
    throw new Error('Leverage must be between 1x and 10x');
  }

  return leverage;
}

export async function sellCommand(options: SellOptions): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  try {
    // v0: Validate slab is provided (cross-slab routing disabled)
    if (!options.slab) {
      spinner.fail();
      displayError('v0 requires --slab (cross-slab routing disabled)');
      console.log(chalk.gray('\nExample:'));
      console.log(chalk.cyan('  barista sell --slab <SLAB_ADDRESS> -q 100\n'));
      process.exit(1);
    }

    if (!options.quantity) {
      spinner.fail();
      displayError('Missing required option: --quantity <amount>');
      process.exit(1);
    }

    // Parse leverage (default to 1x for spot)
    const leverage = options.leverage ? parseLeverage(options.leverage) : 1;
    const isSpot = leverage === 1;
    const isMarketOrder = !options.price;

    // Load network configuration (uses env vars for overrides)
    const config = getNetworkConfig(options.network);

    // Override RPC URL if provided
    const rpcUrl = options.url || config.rpcUrl;

    const keypairPath = options.keypair || getDefaultKeypairPath();
    const wallet = loadKeypair(keypairPath);

    spinner.text = `Using wallet: ${wallet.publicKey.toBase58()}`;

    // Connect to Solana
    const connection = new Connection(rpcUrl, 'confirmed');

    spinner.text = 'Connecting to Solana...';

    // Create RouterClient
    const client = new RouterClient(
      connection,
      config.routerProgramId,
      wallet
    );

    const quantityInput = parseAmount(options.quantity, DECIMALS);
    let slabMarket: PublicKey;
    let price: BN;

    if (options.instrument) {
      // ============ SMART ROUTING MODE ============
      spinner.text = 'Finding best slab for instrument...';
      const instrumentId = new PublicKey(options.instrument);

      const bestSlab = await client.findBestSlabForTrade(
        instrumentId,
        'sell',  // For sell, we look for highest bid
        quantityInput,
        config.slabProgramId
      );

      slabMarket = bestSlab.slab;
      price = bestSlab.price;

      spinner.succeed();
      console.log();
      console.log(chalk.green('✓ Smart routing found best price'));
      console.log(chalk.gray(`  Instrument: ${options.instrument}`));
      console.log(chalk.gray(`  Best slab: ${slabMarket.toBase58()}`));
      console.log(chalk.gray(`  Best bid: $${formatAmount(price, DECIMALS)}`));
      console.log(chalk.gray(`  Available: ${bestSlab.availableQty.toString()} units`));
      console.log();

      spinner.start('Validating position...');

    } else {
      // ============ MANUAL SLAB MODE (existing) ============
      slabMarket = new PublicKey(options.slab!);

      // Get price (either from user or fetch market price)
      if (isMarketOrder) {
        spinner.text = 'Fetching market price...';
        price = await client.getMarketPrice(slabMarket, config.slabProgramId);
        console.log(chalk.gray(`  Market price: $${formatAmount(price, DECIMALS)}`));
      } else {
        price = parseAmount(options.price!, DECIMALS);
      }
    }

    // Validate position with NEW leverage model
    // quantityInput represents margin to commit, leverage multiplies it
    spinner.text = 'Validating position...';
    const validation = await client.validateLeveragedPosition(
      wallet.publicKey,
      quantityInput,
      price,
      leverage
    );

    if (!validation.valid) {
      spinner.fail();
      console.log();
      displayError('Insufficient equity for this trade');
      console.log();
      console.log(chalk.gray('  Trade Details:'));
      console.log(chalk.gray(`    Mode: ${validation.mode === 'spot' ? 'Spot (1x)' : `Margin (${leverage}x)`}`));
      console.log(chalk.gray(`    Quantity input: ${formatAmount(quantityInput, DECIMALS)} units`));
      console.log(chalk.gray(`    Price: $${formatAmount(price, DECIMALS)}`));
      console.log(chalk.gray(`    Margin committed: ${formatAmount(validation.marginCommitted, DECIMALS)} units`));
      console.log(chalk.gray(`    Actual position size: ${formatAmount(validation.positionSize, DECIMALS)} units`));
      console.log(chalk.gray(`    Actual quantity traded: ${formatAmount(validation.actualQuantity, DECIMALS)} contracts`));
      console.log(chalk.red(`    Available equity: ${formatAmount(validation.availableEquity, DECIMALS)} units`));
      console.log();

      const maxQty = await client.calculateMaxQuantityInput(wallet.publicKey, price, leverage);
      console.log(chalk.yellow(`  Tip: Maximum quantity input: ${formatAmount(maxQty, DECIMALS)} units`));
      if (leverage > 1) {
        console.log(chalk.yellow(`       (This will open ${formatAmount(maxQty.mul(new BN(leverage)), DECIMALS)} contracts with ${leverage}x leverage)`));
      }
      process.exit(1);
    }

    // Display position summary
    spinner.stop();
    console.log();
    console.log(chalk.cyan('  Trade Summary:'));
    console.log(chalk.gray(`    Order type: ${isMarketOrder ? chalk.yellow('Market') : chalk.green('Limit')}`));
    console.log(chalk.gray(`    Mode: ${validation.mode === 'spot' ? chalk.green('Spot (1x)') : chalk.yellow(`Margin (${leverage}x)`)}`));
    console.log(chalk.gray(`    Quantity input: ${formatAmount(quantityInput, DECIMALS)} units`));
    console.log(chalk.gray(`    Price: $${formatAmount(price, DECIMALS)}`));
    console.log(chalk.gray(`    Margin committed: ${formatAmount(validation.marginCommitted, DECIMALS)} units`));
    console.log(chalk.cyan(`    → Actual position: ${formatAmount(validation.positionSize, DECIMALS)} units (${formatAmount(validation.actualQuantity, DECIMALS)} contracts)`));
    console.log(chalk.gray(`    Available equity: ${formatAmount(validation.availableEquity, DECIMALS)} units`));

    // Show order type info
    if (isMarketOrder) {
      console.log();
      console.log(chalk.gray(`  Market Order: Executes at oracle price (±0.5% slippage tolerance)`));
    } else {
      console.log();
      console.log(chalk.yellow(`  ⚠️  v0 LIMIT ORDER: Executes INSTANTLY (not a resting order)`));
      console.log(chalk.gray(`     Price is sanity-checked within ±20% of oracle, then fills immediately`));
      console.log(chalk.gray(`     True limit orders (wait for price) coming in v1+`));
    }

    // Show warnings for high leverage
    if (leverage >= 8) {
      console.log();
      console.log(chalk.red(`  ⚠️  WARNING: High leverage (${leverage}x) increases liquidation risk!`));
    } else if (leverage >= 5) {
      console.log();
      console.log(chalk.yellow(`  ⚠️  Caution: Using ${leverage}x leverage increases risk`));
    }

    // Confirm for margin trades or market orders
    if (!isSpot || isMarketOrder) {
      console.log();
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const promptMsg = isMarketOrder
        ? '  Execute market order? (y/N): '
        : '  Continue with margin trade? (y/N): ';

      const answer = await new Promise<string>((resolve) => {
        readline.question(chalk.yellow(promptMsg), resolve);
      });
      readline.close();

      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log(chalk.gray('  Trade cancelled.'));
        process.exit(0);
      }
    }

    console.log();
    spinner.start('Building sell transaction...');

    // Ensure portfolio exists (auto-create if needed)
    spinner.text = 'Checking portfolio...';
    const ensurePortfolioIxs = await client.ensurePortfolioInstructions(wallet.publicKey);

    if (ensurePortfolioIxs.length > 0) {
      spinner.text = 'Creating portfolio (first-time setup)...';
    }

    // Build sell instruction - oracle is auto-fetched from SlabRegistry
    spinner.text = 'Fetching oracle from registry...';
    const orderType = isMarketOrder ? ExecutionType.Market : ExecutionType.Limit;
    const sellIx = await client.buildSellInstruction(
      wallet.publicKey,
      slabMarket,
      validation.actualQuantity,  // Use leveraged quantity!
      price,
      undefined,  // Oracle auto-fetched from SlabRegistry
      orderType   // Market order if no price provided, Limit if price specified
    );

    const transaction = new Transaction()
      .add(...ensurePortfolioIxs)  // Auto-create portfolio if needed
      .add(sellIx);

    // Send and confirm transaction
    spinner.text = 'Sending transaction...';
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      { commitment: 'confirmed' }
    );

    spinner.succeed();
    displaySuccess(`Sell order executed successfully!`);

    console.log(chalk.gray(`  Signature: ${signature}`));
    console.log(chalk.gray(`  Explorer: ${getExplorerUrl(signature, options.network || 'mainnet-beta')}`));
    console.log();
    console.log(chalk.cyan(`  Position opened: ${formatAmount(validation.actualQuantity, DECIMALS)} contracts`));
    console.log(chalk.cyan(`  Margin used: ${formatAmount(validation.marginCommitted, DECIMALS)} units`));
    console.log(chalk.cyan(`  Effective leverage: ${leverage}x`));
  } catch (error: any) {
    spinner.fail();
    displayError(`Sell order failed: ${error.message}`);
    process.exit(1);
  }
}
