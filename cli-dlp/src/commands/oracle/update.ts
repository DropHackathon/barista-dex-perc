import { PublicKey, Transaction } from '@solana/web3.js';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { loadKeypair } from '../../utils/wallet';
import { createConnection } from '../../utils/network';
import { displayError, displaySuccess, formatPubkey } from '../../utils/display';

export interface UpdateOracleOptions {
  address: string;
  price?: string;
  confidence?: string;
  oracleProgram?: string;
  yes?: boolean;
  keypair?: string;
  network?: string;
  url?: string;
}

/**
 * Update oracle price
 */
export async function updateOracleCommand(options: UpdateOracleOptions): Promise<void> {
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
    const connection = createConnection(network, options.url);

    spinner.start('Loading oracle...');

    // Parse oracle address
    let oracleAddress: PublicKey;
    try {
      oracleAddress = new PublicKey(options.address);
    } catch (e) {
      spinner.fail('Invalid oracle address');
      displayError('Please provide a valid oracle public key');
      process.exit(1);
    }

    // Get oracle program ID
    let oracleProgramId: PublicKey;
    if (options.oracleProgram) {
      oracleProgramId = new PublicKey(options.oracleProgram);
    } else if (process.env.BARISTA_ORACLE_PROGRAM_ID) {
      oracleProgramId = new PublicKey(process.env.BARISTA_ORACLE_PROGRAM_ID);
    } else {
      spinner.stop();
      displayError('Oracle program ID not found');
      console.log('Set BARISTA_ORACLE_PROGRAM_ID environment variable or use --oracle-program');
      process.exit(1);
    }

    // Verify oracle exists
    const oracleAccount = await connection.getAccountInfo(oracleAddress);
    if (!oracleAccount) {
      spinner.fail('Oracle not found');
      displayError(`No oracle found at address ${formatPubkey(options.address, 20)}`);
      process.exit(1);
    }

    spinner.succeed('Oracle loaded');

    // Get new price
    let newPrice: number;
    if (options.price) {
      newPrice = parseFloat(options.price);
      if (isNaN(newPrice) || newPrice <= 0) {
        displayError('Price must be a positive number');
        process.exit(1);
      }
    } else {
      const { priceInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'priceInput',
          message: 'New price in USD (e.g., 51000.00):',
          validate: (input) => {
            const price = parseFloat(input);
            if (isNaN(price) || price <= 0) {
              return 'Price must be a positive number';
            }
            return true;
          },
        },
      ]);
      newPrice = parseFloat(priceInput);
    }

    // Get confidence interval (optional)
    let confidence: number;
    if (options.confidence) {
      confidence = parseFloat(options.confidence);
      if (isNaN(confidence) || confidence < 0) {
        displayError('Confidence must be a non-negative number');
        process.exit(1);
      }
    } else {
      const { confidenceInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'confidenceInput',
          message: 'Confidence interval in USD (e.g., 100.00):',
          default: '0.00',
          validate: (input) => {
            const conf = parseFloat(input);
            if (isNaN(conf) || conf < 0) {
              return 'Confidence must be a non-negative number';
            }
            return true;
          },
        },
      ]);
      confidence = parseFloat(confidenceInput);
    }

    // Convert to scaled values (multiply by 1_000_000)
    const scaledPrice = Math.floor(newPrice * 1_000_000);
    const scaledConfidence = Math.floor(confidence * 1_000_000);

    // Display summary
    console.log(chalk.cyan('\n═══════════════════════════════════════'));
    console.log(chalk.cyan.bold('        Oracle Price Update'));
    console.log(chalk.cyan('═══════════════════════════════════════'));
    console.log(`${chalk.gray('Oracle Address:')} ${formatPubkey(oracleAddress.toBase58(), 20)}`);
    console.log(`${chalk.gray('New Price:')}      ${chalk.green(`$${newPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}`);
    console.log(`${chalk.gray('Confidence:')}     ±$${confidence.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`${chalk.gray('Authority:')}      ${formatPubkey(wallet.publicKey.toBase58(), 20)}`);
    console.log(chalk.cyan('═══════════════════════════════════════\n'));

    // Confirm update
    if (!options.yes) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Update oracle price?',
          default: true,
        },
      ]);

      if (!confirm) {
        console.log(chalk.yellow('\n✗ Cancelled'));
        process.exit(0);
      }
    }

    spinner.start('Updating oracle price...');

    // Build instruction data: [discriminator: 1, price: i64, confidence: i64]
    const instructionData = Buffer.alloc(1 + 8 + 8);
    instructionData.writeUInt8(1, 0); // discriminator for update_price
    instructionData.writeBigInt64LE(BigInt(scaledPrice), 1);
    instructionData.writeBigInt64LE(BigInt(scaledConfidence), 9);

    // Build update instruction
    const updateIx = {
      keys: [
        { pubkey: oracleAddress, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
      ],
      programId: oracleProgramId,
      data: instructionData,
    };

    // Build and send transaction
    const tx = new Transaction().add(updateIx);

    const signature = await connection.sendTransaction(tx, [wallet], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    spinner.text = 'Confirming transaction...';

    await connection.confirmTransaction(signature, 'confirmed');

    spinner.succeed('Oracle price updated successfully!');

    displaySuccess('Price updated');
    console.log(`${chalk.gray('New Price:')}    ${chalk.green(`$${newPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}`);
    console.log(`${chalk.gray('Confidence:')}   ±$${confidence.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`${chalk.gray('Transaction:')}  ${chalk.gray(signature)}\n`);

    // Display next steps
    console.log(chalk.cyan('Next steps:'));
    console.log(`  View updated oracle:`);
    console.log(`    ${chalk.gray(`barista-dlp oracle:view --address ${oracleAddress.toBase58()}`)}\n`);
  } catch (error: any) {
    spinner.fail('Failed to update oracle');

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
