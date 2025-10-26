import { Transaction, PublicKey } from '@solana/web3.js';
import { RouterClient, SlabClient } from '@barista-dex/sdk';
import BN from 'bn.js';
import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadKeypair } from '../../utils/wallet';
import { createConnection, getNetworkConfig } from '../../utils/network';
import { displaySuccess, displayError, displayInfo } from '../../utils/display';

interface CreateSlabOptions {
  instrument?: string;  // Instrument address
  markPrice?: string;   // Mark price in dollars (e.g., "100.50")
  takerFee?: string;    // Taker fee in bps (e.g., "10" = 10 bps)
  contractSize?: string; // Contract size (e.g., "1.0")
  keypair?: string;
  network?: string;
  url?: string;
  yes?: boolean; // Skip confirmation
}

export async function createSlabCommand(options: CreateSlabOptions): Promise<void> {
  const spinner = ora('Initializing...').start();

  try {
    // Load wallet
    if (!options.keypair) {
      spinner.fail();
      displayError('--keypair is required');
      process.exit(1);
    }

    spinner.text = 'Loading wallet...';
    const wallet = loadKeypair(options.keypair);

    // Setup network
    const network = (options.network || 'localnet') as 'localnet' | 'devnet' | 'mainnet-beta';
    const connection = createConnection(network, options.url);
    const { routerProgramId, slabProgramId } = getNetworkConfig(network, options.url);

    spinner.text = 'Connecting to Solana...';

    // Create clients
    const routerClient = new RouterClient(connection, routerProgramId, wallet);
    const slabClient = new SlabClient(connection, slabProgramId, wallet);

    // Check portfolio exists
    spinner.text = 'Checking portfolio...';
    const [portfolioPDA] = routerClient.derivePortfolioPDA(wallet.publicKey);
    const portfolio = await routerClient.getPortfolio(portfolioPDA);

    if (!portfolio) {
      spinner.fail();
      displayError('Portfolio not found. Create one with: barista-dlp deposit');
      process.exit(1);
    }

    spinner.stop();

    // Interactive parameter collection
    let instrumentAddr: PublicKey;
    let markPrice: BN;
    let takerFee: BN;
    let contractSize: BN;

    console.log();

    if (!options.instrument) {
      const { instrumentInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'instrumentInput',
          message: 'Instrument address (perp market):',
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
    } else {
      instrumentAddr = new PublicKey(options.instrument);
    }

    if (!options.markPrice) {
      const { markPriceInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'markPriceInput',
          message: 'Mark price (USD, e.g., 100.50):',
          default: '100.00',
          validate: (input) => {
            const price = parseFloat(input);
            return !isNaN(price) && price > 0 ? true : 'Invalid price';
          },
        },
      ]);
      markPrice = new BN(parseFloat(markPriceInput) * 1_000_000);
    } else {
      markPrice = new BN(parseFloat(options.markPrice) * 1_000_000);
    }

    if (!options.takerFee) {
      const { takerFeeInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'takerFeeInput',
          message: 'Taker fee (bps, e.g., 10 = 0.1%):',
          default: '10',
          validate: (input) => {
            const fee = parseInt(input);
            return !isNaN(fee) && fee >= 0 ? true : 'Invalid fee';
          },
        },
      ]);
      takerFee = new BN(parseInt(takerFeeInput) * 100); // Convert bps to 1e6 scale
    } else {
      takerFee = new BN(parseInt(options.takerFee) * 100);
    }

    if (!options.contractSize) {
      const { contractSizeInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'contractSizeInput',
          message: 'Contract size (e.g., 1.0):',
          default: '1.0',
          validate: (input) => {
            const size = parseFloat(input);
            return !isNaN(size) && size > 0 ? true : 'Invalid size';
          },
        },
      ]);
      contractSize = new BN(parseFloat(contractSizeInput) * 1_000_000);
    } else {
      contractSize = new BN(parseFloat(options.contractSize) * 1_000_000);
    }

    console.log();
    console.log(chalk.cyan('Creating new slab:'));
    console.log(chalk.gray(`  LP Owner (DLP): ${wallet.publicKey.toBase58()}`));
    console.log(chalk.gray(`  Instrument: ${instrumentAddr.toBase58()}`));
    console.log(chalk.gray(`  Mark Price: $${(Number(markPrice.toString()) / 1_000_000).toFixed(2)}`));
    console.log(chalk.gray(`  Taker Fee: ${(Number(takerFee.toString()) / 100).toFixed(2)} bps`));
    console.log(chalk.gray(`  Contract Size: ${(Number(contractSize.toString()) / 1_000_000).toFixed(6)}`));
    console.log(chalk.gray(`  Network: ${network}`));
    console.log();

    // Confirm if not --yes
    if (!options.yes) {
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: 'Create slab with these settings?',
          default: true,
        },
      ]);

      if (!confirmed) {
        displayInfo('Slab creation cancelled');
        process.exit(0);
      }
    }

    // Derive slab PDA
    spinner.start('Deriving slab address...');
    const [slabPDA, bump] = slabClient.deriveSlabPDA(wallet.publicKey, instrumentAddr);
    console.log(chalk.gray(`  Slab PDA: ${slabPDA.toBase58()}`));

    // Check if slab already exists
    spinner.text = 'Checking if slab already exists...';
    const existingSlab = await slabClient.getSlabState(slabPDA);
    if (existingSlab) {
      spinner.fail();
      displayError('Slab already exists for this LP Owner + Instrument combination');
      console.log(chalk.gray(`  Slab address: ${slabPDA.toBase58()}`));
      console.log();
      console.log(chalk.blue('ℹ'), 'View slab:', chalk.cyan(`barista-dlp slab:view --address ${slabPDA.toBase58()}`));
      process.exit(1);
    }

    // Build initialize slab instruction
    spinner.text = 'Building slab initialization transaction...';
    const initSlabIx = slabClient.buildInitializeSlabInstruction(
      wallet.publicKey,   // lpOwner
      routerProgramId,    // routerId
      instrumentAddr,     // instrument
      markPrice,          // markPx
      takerFee,           // takerFeeBps
      contractSize,       // contractSize
      wallet.publicKey    // payer
    );

    const tx = new Transaction().add(initSlabIx);

    // Send transaction
    spinner.text = 'Sending transaction...';
    const signature = await connection.sendTransaction(tx, [wallet], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    spinner.text = 'Confirming transaction...';
    await connection.confirmTransaction(signature, 'confirmed');

    spinner.succeed();

    // Display success
    console.log();
    displaySuccess('Slab created successfully!');
    console.log(chalk.gray(`  Slab Address: ${slabPDA.toBase58()}`));
    console.log(chalk.gray(`  Signature: ${signature}`));
    console.log();

    // Next steps
    console.log(chalk.bold('Next Steps:'));
    console.log(chalk.cyan('  1.'), 'View slab:', chalk.gray(`barista-dlp slab:view --address ${slabPDA.toBase58()}`));
    console.log(chalk.cyan('  2.'), 'View portfolio:', chalk.gray('barista-dlp portfolio --detailed'));
    console.log();
    console.log(chalk.yellow('⚠'), 'Save this slab address! You\'ll need it to manage this slab');
    console.log(chalk.gray(`  ${slabPDA.toBase58()}`));
    console.log();

  } catch (error) {
    spinner.fail();
    displayError(`Slab creation failed: ${error}`);
    process.exit(1);
  }
}
