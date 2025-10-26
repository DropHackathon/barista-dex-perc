import { PublicKey } from '@solana/web3.js';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { loadKeypair } from '../../utils/wallet';
import { createConnection } from '../../utils/network';
import { displayError, formatPubkey } from '../../utils/display';

export interface ViewOracleOptions {
  address: string;
  keypair?: string;
  network?: string;
  url?: string;
}

interface PriceOracle {
  magic: bigint;
  version: number;
  bump: number;
  authority: PublicKey;
  instrument: PublicKey;
  price: bigint;
  timestamp: bigint;
  confidence: bigint;
}

/**
 * Parse oracle account data
 */
function parseOracleData(data: Buffer): PriceOracle {
  let offset = 0;

  const magic = data.readBigUInt64LE(offset);
  offset += 8;

  const version = data.readUInt8(offset);
  offset += 1;

  const bump = data.readUInt8(offset);
  offset += 1;

  // Skip padding (6 bytes)
  offset += 6;

  const authority = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const instrument = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const price = data.readBigInt64LE(offset);
  offset += 8;

  const timestamp = data.readBigInt64LE(offset);
  offset += 8;

  const confidence = data.readBigInt64LE(offset);

  return {
    magic,
    version,
    bump,
    authority,
    instrument,
    price,
    timestamp,
    confidence,
  };
}

/**
 * View oracle details
 */
export async function viewOracleCommand(options: ViewOracleOptions): Promise<void> {
  const spinner = ora();

  try {
    const network = (options.network || 'localnet') as 'localnet' | 'devnet' | 'mainnet-beta';
    const connection = createConnection(network, options.url);

    // Load wallet if available (for ownership check)
    let wallet: any = null;
    if (options.keypair) {
      try {
        wallet = loadKeypair(options.keypair);
      } catch (e) {
        // No wallet - skip ownership check
      }
    }

    // Parse oracle address
    let oracleAddress: PublicKey;
    try {
      oracleAddress = new PublicKey(options.address);
    } catch (e) {
      displayError('Invalid oracle address');
      process.exit(1);
    }

    spinner.start('Fetching oracle data...');

    // Fetch oracle account
    const oracleAccount = await connection.getAccountInfo(oracleAddress);
    if (!oracleAccount) {
      spinner.fail('Oracle not found');
      displayError(`No oracle found at address ${formatPubkey(options.address, 20)}`);
      process.exit(1);
    }

    // Parse oracle data
    const oracle = parseOracleData(oracleAccount.data);

    spinner.succeed('Oracle data loaded');

    // Display oracle information
    console.log(chalk.cyan('\n═══════════════════════════════════════'));
    console.log(chalk.cyan.bold('        Oracle Information'));
    console.log(chalk.cyan('═══════════════════════════════════════\n'));

    const infoTable = new Table({
      head: [chalk.cyan('Field'), chalk.cyan('Value')],
      colWidths: [25, 55],
      style: {
        head: [],
        border: ['gray'],
      },
    });

    // Format price (scaled by 1_000_000)
    const priceFloat = Number(oracle.price) / 1_000_000;
    const confidenceFloat = Number(oracle.confidence) / 1_000_000;

    // Format timestamp
    const timestampDate = oracle.timestamp > 0n
      ? new Date(Number(oracle.timestamp) * 1000).toISOString()
      : 'Never updated';

    // Calculate age
    const now = Math.floor(Date.now() / 1000);
    const age = oracle.timestamp > 0n ? now - Number(oracle.timestamp) : null;

    const ageStr = age !== null
      ? age < 60
        ? `${age}s ago`
        : age < 3600
        ? `${Math.floor(age / 60)}m ago`
        : age < 86400
        ? `${Math.floor(age / 3600)}h ago`
        : `${Math.floor(age / 86400)}d ago`
      : 'N/A';

    infoTable.push(
      ['Oracle Address', formatPubkey(oracleAddress.toBase58(), 45)],
      ['Authority', formatPubkey(oracle.authority.toBase58(), 45)],
      ['Instrument', formatPubkey(oracle.instrument.toBase58(), 45)],
      ['', ''],
      ['Current Price', chalk.green(`$${priceFloat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)],
      ['Confidence Interval', `±$${confidenceFloat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ['Last Updated', timestampDate],
      ['Price Age', ageStr],
      ['', ''],
      ['Version', oracle.version.toString()],
      ['Bump', oracle.bump.toString()]
    );

    // Check ownership
    if (wallet && oracle.authority.equals(wallet.publicKey)) {
      infoTable.push(['', chalk.green('✓ You are the authority')]);
    }

    console.log(infoTable.toString());

    // Price staleness warning
    if (age !== null && age > 300) {
      // 5 minutes
      console.log(
        chalk.yellow(`\n⚠ Warning: Price is stale (${ageStr}). Consider updating.`)
      );
    }

    console.log();
  } catch (error: any) {
    spinner.fail('Failed to fetch oracle');

    if (error.message) {
      displayError(error.message);
    }

    process.exit(1);
  }
}
