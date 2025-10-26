import { Transaction, Keypair, SystemProgram } from '@solana/web3.js';
import { RouterClient } from '@barista-dex/sdk';
import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadKeypair } from '../../utils/wallet';
import { createConnection, getNetworkConfig } from '../../utils/network';
import { displaySuccess, displayError, displayInfo } from '../../utils/display';

interface CreateSlabOptions {
  market?: string;
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

    // Create router client
    const client = new RouterClient(connection, routerProgramId, wallet);

    // Check portfolio exists
    spinner.text = 'Checking portfolio...';
    const [portfolioPDA] = client.derivePortfolioPDA(wallet.publicKey);
    const portfolio = await client.getPortfolio(portfolioPDA);

    if (!portfolio) {
      spinner.fail();
      displayError('Portfolio not found. Create one with: barista-dlp deposit');
      process.exit(1);
    }

    spinner.stop();

    // Interactive market selection if not provided
    let market = options.market;
    if (!market) {
      console.log();
      const { selectedMarket } = await inquirer.prompt([
        {
          type: 'input',
          name: 'selectedMarket',
          message: 'Market symbol (e.g., SOL-PERP):',
          validate: (input) => {
            if (!input || input.trim().length === 0) {
              return 'Market symbol is required';
            }
            return true;
          },
        },
      ]);
      market = selectedMarket;
    }

    console.log();
    console.log(chalk.cyan('Creating new slab:'));
    console.log(chalk.gray(`  Market: ${market}`));
    console.log(chalk.gray(`  DLP: ${wallet.publicKey.toBase58()}`));
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

    spinner.start('Generating slab keypair...');

    // Generate new keypair for slab account
    const slabKeypair = Keypair.generate();

    // Note: In production, you would call client.buildCreateSlabInstruction()
    // For v0.5, slab creation logic needs to be implemented in SDK
    spinner.text = 'Building slab creation transaction...';

    // TODO: Replace with actual SDK method once implemented
    // const createSlabIx = await client.buildCreateSlabInstruction(
    //   slabKeypair.publicKey,
    //   market,
    //   wallet.publicKey
    // );

    spinner.fail();
    displayError('Slab creation not yet implemented in SDK');
    console.log();
    console.log(chalk.yellow('⚠'), 'This command requires SDK support for slab creation');
    console.log(chalk.gray('  Track progress: https://github.com/barista-dex/sdk/issues'));
    console.log();
    console.log(chalk.blue('ℹ'), 'For now, create slabs using the Keeper CLI (Rust):');
    console.log(chalk.cyan('  cd cli && cargo run -- slab create --market SOL-PERP'));
    console.log();

    process.exit(1);

    // Future implementation once SDK is ready:
    /*
    const tx = new Transaction()
      .add(
        SystemProgram.createAccount({
          fromPubkey: wallet.publicKey,
          newAccountPubkey: slabKeypair.publicKey,
          lamports: await connection.getMinimumBalanceForRentExemption(SLAB_ACCOUNT_SIZE),
          space: SLAB_ACCOUNT_SIZE,
          programId: slabProgramId,
        })
      )
      .add(createSlabIx);

    spinner.text = 'Sending transaction...';
    const signature = await connection.sendTransaction(tx, [wallet, slabKeypair], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    spinner.text = 'Confirming transaction...';
    await connection.confirmTransaction(signature, 'confirmed');

    spinner.succeed();

    console.log();
    displaySuccess(`Slab created successfully!`);
    console.log(chalk.gray(`  Market: ${market}`));
    console.log(chalk.gray(`  Slab Address: ${slabKeypair.publicKey.toBase58()}`));
    console.log(chalk.gray(`  Signature: ${signature}`));
    console.log();

    // Save slab keypair
    console.log(chalk.yellow('⚠'), 'Save this slab keypair in a secure location!');
    console.log(chalk.gray(`  Public Key: ${slabKeypair.publicKey.toBase58()}`));
    console.log(chalk.gray(`  You will need it to manage this slab`));
    console.log();

    // Next steps
    console.log(chalk.bold('Next Steps:'));
    console.log(chalk.cyan('  1.'), 'View slab:', chalk.gray(`barista-dlp slab view --address ${slabKeypair.publicKey.toBase58()}`));
    console.log(chalk.cyan('  2.'), 'Update slab params:', chalk.gray('barista-dlp slab update'));
    console.log(chalk.cyan('  3.'), 'View portfolio:', chalk.gray('barista-dlp portfolio --detailed'));
    console.log();
    */

  } catch (error) {
    spinner.fail();
    displayError(`Slab creation failed: ${error}`);
    process.exit(1);
  }
}
