import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
} from '@solana/web3.js';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { loadKeypair } from '../../utils/wallet';
import { createConnection, getNetworkConfig } from '../../utils/network';
import { displayError, displaySuccess, formatPubkey } from '../../utils/display';

const PRICE_ORACLE_SIZE = 128;

export interface InitOracleOptions {
  instrument?: string;
  initialPrice?: string;
  oracleProgram?: string;
  yes?: boolean;
  keypair?: string;
  network?: string;
  url?: string;
}

/**
 * Initialize a new price oracle for an instrument
 */
export async function initOracleCommand(options: InitOracleOptions): Promise<void> {
  const spinner = ora();

  try {
    // Load wallet and connection
    const keypairPath = options.keypair || process.env.BARISTA_DLP_KEYPAIR;
    if (!keypairPath) {
      displayError('Keypair path required. Use --keypair or set BARISTA_DLP_KEYPAIR');
      process.exit(1);
    }

    const wallet = loadKeypair(keypairPath);
    const network = (options.network || 'localnet') as 'localnet' | 'devnet' | 'mainnet-beta';
    const networkConfig = getNetworkConfig(network, options.url);
    const connection = createConnection(network, options.url);

    spinner.start('Loading oracle configuration...');

    // Get oracle program ID from environment or prompt
    let oracleProgramId: PublicKey;
    if (options.oracleProgram) {
      try {
        oracleProgramId = new PublicKey(options.oracleProgram);
      } catch (e) {
        spinner.fail('Invalid oracle program ID');
        displayError('Please provide a valid oracle program public key');
        process.exit(1);
      }
    } else if (process.env.BARISTA_ORACLE_PROGRAM_ID) {
      oracleProgramId = new PublicKey(process.env.BARISTA_ORACLE_PROGRAM_ID);
    } else {
      spinner.stop();
      const { oracleProgramInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'oracleProgramInput',
          message: 'Oracle program ID:',
          validate: (input) => {
            try {
              new PublicKey(input);
              return true;
            } catch (e) {
              return 'Invalid public key';
            }
          },
        },
      ]);
      oracleProgramId = new PublicKey(oracleProgramInput);
      spinner.start('Loading oracle configuration...');
    }

    spinner.succeed('Oracle program loaded');

    // Get instrument address
    let instrumentAddr: PublicKey;
    if (options.instrument) {
      try {
        instrumentAddr = new PublicKey(options.instrument);
      } catch (e) {
        displayError('Invalid instrument address');
        process.exit(1);
      }
    } else {
      const { instrumentInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'instrumentInput',
          message: 'Instrument address:',
          validate: (input) => {
            try {
              new PublicKey(input);
              return true;
            } catch (e) {
              return 'Invalid public key';
            }
          },
        },
      ]);
      instrumentAddr = new PublicKey(instrumentInput);
    }

    // Get initial price
    let initialPrice: number;
    if (options.initialPrice) {
      initialPrice = parseFloat(options.initialPrice);
      if (isNaN(initialPrice) || initialPrice <= 0) {
        displayError('Initial price must be a positive number');
        process.exit(1);
      }
    } else {
      const { priceInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'priceInput',
          message: 'Initial price in USD (e.g., 50000.00):',
          validate: (input) => {
            const price = parseFloat(input);
            if (isNaN(price) || price <= 0) {
              return 'Price must be a positive number';
            }
            return true;
          },
        },
      ]);
      initialPrice = parseFloat(priceInput);
    }

    // Convert price to lamports (scaled by 1_000_000)
    const scaledPrice = Math.floor(initialPrice * 1_000_000);

    // Derive oracle PDA: ['oracle', instrument]
    const [oraclePDA, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from('oracle'), instrumentAddr.toBuffer()],
      oracleProgramId
    );

    spinner.start('Checking if oracle already exists...');

    // Check if oracle already exists
    const oracleAccount = await connection.getAccountInfo(oraclePDA);
    if (oracleAccount && oracleAccount.data.length > 0) {
      spinner.fail('Oracle already exists');
      displayError(
        `Oracle already initialized at ${formatPubkey(oraclePDA.toBase58(), 20)}`
      );
      console.log(`\nTo view oracle details, use:`);
      console.log(`  barista-dlp oracle:view --address ${oraclePDA.toBase58()}`);
      process.exit(1);
    }

    spinner.succeed('Oracle does not exist - ready to create');

    // Display summary
    console.log(chalk.cyan('\n═══════════════════════════════════════'));
    console.log(chalk.cyan.bold('       Oracle Initialization'));
    console.log(chalk.cyan('═══════════════════════════════════════'));
    console.log(`${chalk.gray('Oracle PDA:')}        ${formatPubkey(oraclePDA.toBase58(), 20)}`);
    console.log(`${chalk.gray('Instrument:')}        ${formatPubkey(instrumentAddr.toBase58(), 20)}`);
    console.log(`${chalk.gray('Initial Price:')}     ${chalk.green(`$${initialPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}`);
    console.log(`${chalk.gray('Authority:')}         ${formatPubkey(wallet.publicKey.toBase58(), 20)}`);
    console.log(`${chalk.gray('Bump:')}              ${bump}`);
    console.log(chalk.cyan('═══════════════════════════════════════\n'));

    // Confirm creation
    if (!options.yes) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Initialize this oracle?',
          default: true,
        },
      ]);

      if (!confirm) {
        console.log(chalk.yellow('\n✗ Cancelled'));
        process.exit(0);
      }
    }

    spinner.start('Creating oracle account...');

    // Get rent exemption amount
    const rent = await connection.getMinimumBalanceForRentExemption(PRICE_ORACLE_SIZE);

    // Build instruction data: [discriminator: 0, initial_price: i64, bump: u8]
    const instructionData = Buffer.alloc(1 + 8 + 1);
    instructionData.writeUInt8(0, 0); // discriminator for initialize
    instructionData.writeBigInt64LE(BigInt(scaledPrice), 1);
    instructionData.writeUInt8(bump, 9);

    // Create account instruction
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: oraclePDA,
      lamports: rent,
      space: PRICE_ORACLE_SIZE,
      programId: oracleProgramId,
    });

    // Initialize oracle instruction
    const initOracleIx = {
      keys: [
        { pubkey: oraclePDA, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: instrumentAddr, isSigner: false, isWritable: false },
      ],
      programId: oracleProgramId,
      data: instructionData,
    };

    // Build and send transaction
    const tx = new Transaction().add(createAccountIx).add(initOracleIx);

    const signature = await connection.sendTransaction(tx, [wallet], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    spinner.text = 'Confirming transaction...';

    await connection.confirmTransaction(signature, 'confirmed');

    spinner.succeed('Oracle initialized successfully!');

    displaySuccess('Oracle created and initialized');
    console.log(`${chalk.gray('Oracle Address:')} ${chalk.cyan(oraclePDA.toBase58())}`);
    console.log(`${chalk.gray('Transaction:')}    ${chalk.gray(signature)}`);
    console.log(`\n${chalk.yellow('⚠ Save the oracle address!')}`);
    console.log(`${chalk.gray('Traders will need this address to verify prices.')}\n`);

    // Display next steps
    console.log(chalk.cyan('Next steps:'));
    console.log(`  1. Use this oracle address when trading on your slab`);
    console.log(`  2. Update price as needed:`);
    console.log(`     ${chalk.gray(`barista-dlp oracle:update --address ${oraclePDA.toBase58()} --price <NEW_PRICE>`)}`);
    console.log(`  3. View oracle details:`);
    console.log(`     ${chalk.gray(`barista-dlp oracle:view --address ${oraclePDA.toBase58()}`)}\n`);
  } catch (error: any) {
    spinner.fail('Failed to initialize oracle');

    if (error.message) {
      displayError(error.message);
    }

    if (error.logs) {
      console.log(chalk.gray('\nProgram logs:'));
      error.logs.forEach((log: string) => console.log(chalk.gray(`  ${log}`)));
    }

    process.exit(1);
  }
}
