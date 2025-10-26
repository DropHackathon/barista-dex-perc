import { Connection, PublicKey } from '@solana/web3.js';
import { SlabClient, formatAmount } from '@barista-dex/sdk';
import { getNetworkConfig } from '../../config/networks';
import { displayError } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';

interface PriceOptions {
  slab?: string;
  oracle?: string;
  instrument?: string;
  network?: string;
  url?: string;
}

interface PriceOracle {
  price: bigint;
  timestamp: bigint;
  confidence: bigint;
  instrument: PublicKey;
  authority: PublicKey;
}

/**
 * Parse oracle account data
 */
function parseOracleData(data: Buffer): PriceOracle {
  let offset = 8 + 1 + 1 + 6; // Skip magic, version, bump, padding

  const authority = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const instrument = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const price = data.readBigInt64LE(offset);
  offset += 8;

  const timestamp = data.readBigInt64LE(offset);
  offset += 8;

  const confidence = data.readBigInt64LE(offset);

  return { price, timestamp, confidence, instrument, authority };
}

export async function priceCommand(options: PriceOptions): Promise<void> {
  const spinner = ora('Loading prices...').start();

  try {
    // Load network configuration
    const config = getNetworkConfig(options.network);
    const rpcUrl = options.url || config.rpcUrl;

    // Connect to Solana
    const connection = new Connection(rpcUrl, 'confirmed');

    // Oracle price mode (--oracle or --instrument)
    if (options.oracle || options.instrument) {
      let oracleAddress: PublicKey;

      if (options.oracle) {
        // Direct oracle address
        try {
          oracleAddress = new PublicKey(options.oracle);
        } catch (e) {
          spinner.fail();
          displayError('Invalid oracle address');
          process.exit(1);
        }
      } else if (options.instrument) {
        // Derive oracle from instrument (localnet only)
        spinner.text = 'Deriving oracle address from instrument...';

        if (!config.oracleProgramId) {
          spinner.fail();
          displayError('Oracle program not configured for this network. Use --oracle with Pyth feed address, or use localnet for custom oracle testing.');
          console.log(chalk.gray('\nNote: Mainnet/devnet use Pyth price feeds directly.'));
          console.log(chalk.gray('Set BARISTA_ORACLE_PROGRAM env var if using a custom oracle.\n'));
          process.exit(1);
        }

        const instrumentPubkey = new PublicKey(options.instrument);

        const [derivedOracle] = PublicKey.findProgramAddressSync(
          [Buffer.from('oracle'), instrumentPubkey.toBuffer()],
          config.oracleProgramId
        );

        oracleAddress = derivedOracle;
      } else {
        spinner.fail();
        displayError('Either --oracle or --instrument is required for oracle price');
        process.exit(1);
      }

      spinner.text = 'Fetching oracle price...';

      // Fetch oracle account
      const oracleAccount = await connection.getAccountInfo(oracleAddress);
      if (!oracleAccount) {
        spinner.fail();
        displayError(`Oracle not found at address ${oracleAddress.toBase58()}`);
        process.exit(1);
      }

      // Parse oracle data
      const oracle = parseOracleData(oracleAccount.data);

      spinner.succeed();

      // Format price (scaled by 1_000_000)
      const priceFloat = Number(oracle.price) / 1_000_000;
      const confidenceFloat = Number(oracle.confidence) / 1_000_000;

      // Calculate age
      const now = Math.floor(Date.now() / 1000);
      const age = oracle.timestamp > 0n ? now - Number(oracle.timestamp) : null;

      const ageStr =
        age !== null
          ? age < 60
            ? `${age}s ago`
            : age < 3600
            ? `${Math.floor(age / 60)}m ago`
            : age < 86400
            ? `${Math.floor(age / 3600)}h ago`
            : `${Math.floor(age / 86400)}d ago`
          : 'Never';

      // Display oracle price
      console.log(chalk.bold.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(chalk.bold.cyan('ORACLE PRICE (Testing/Localnet)'));
      console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log();

      console.log(
        `${chalk.bold('Price:')}       ${chalk.green(`$${priceFloat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}`
      );

      if (confidenceFloat > 0) {
        console.log(
          `${chalk.bold('Confidence:')}  ±$${confidenceFloat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        );
      }

      console.log(`${chalk.bold('Updated:')}     ${ageStr}`);

      console.log();
      console.log(chalk.gray(`Oracle:     ${oracleAddress.toBase58()}`));
      console.log(chalk.gray(`Instrument: ${oracle.instrument.toBase58()}`));
      console.log(chalk.gray(`Authority:  ${oracle.authority.toBase58()}`));

      // Staleness warning
      if (age !== null && age > 300) {
        // 5 minutes
        console.log();
        console.log(
          chalk.yellow(
            `⚠ Warning: Price is stale (${ageStr}). Oracle may need updating.`
          )
        );
      }

      console.log();
      if (config.oracleProgramId) {
        console.log(chalk.gray('Note: Custom oracle for localnet testing only. Mainnet/devnet use Pyth.'));
      } else {
        console.log(chalk.gray('Note: Using Pyth price feed. Future versions will use order book prices.'));
      }
      console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

      return;
    }

    // Slab price mode (default, existing behavior)
    if (!options.slab) {
      spinner.fail();
      displayError('Missing required option: --slab <address> (or use --oracle/--instrument for oracle price)');
      process.exit(1);
    }

    // Create SlabClient
    const client = new SlabClient(connection, config.slabProgramId);

    const slabAddress = new PublicKey(options.slab);

    spinner.text = 'Fetching best prices...';

    // Get best prices
    const prices = await client.getBestPrices(slabAddress);

    spinner.succeed();

    // Display prices
    console.log(chalk.bold.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold.cyan(`MARKET PRICES - ${options.slab.substring(0, 8)}...`));
    console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log();

    if (prices.bid) {
      const bidStr = `$${formatAmount(prices.bid.price, 6)}`;
      console.log(`${chalk.bold.green('Best Bid:')}  ${bidStr}`);
    } else {
      console.log(`${chalk.bold.green('Best Bid:')}  ${chalk.gray('--')}`);
    }

    if (prices.ask) {
      const askStr = `$${formatAmount(prices.ask.price, 6)}`;
      console.log(`${chalk.bold.red('Best Ask:')}  ${askStr}`);
    } else {
      console.log(`${chalk.bold.red('Best Ask:')}  ${chalk.gray('--')}`);
    }

    if (prices.spread) {
      const spreadStr = `$${formatAmount(prices.spread, 6)}`;
      console.log();
      console.log(`${chalk.bold('Spread:')}     ${spreadStr} (${prices.spreadBps?.toString() || '0'} bps)`);
    }

    console.log();
    console.log(chalk.gray('Note: v0 prices are derived from mark price (atomic fills only)'));
    console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  } catch (error: any) {
    spinner.fail();
    displayError(`Failed to fetch prices: ${error.message}`);
    process.exit(1);
  }
}
