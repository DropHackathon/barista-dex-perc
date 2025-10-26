import { Transaction } from '@solana/web3.js';
import { RouterClient } from '@barista-dex/sdk';
import ora from 'ora';
import chalk from 'chalk';
import { loadKeypair } from '../../utils/wallet';
import { createConnection, getNetworkConfig } from '../../utils/network';
import { displaySuccess, displayError, displayInfo } from '../../utils/display';

interface InitOptions {
  keypair?: string;
  network?: string;
  url?: string;
}

export async function initCommand(options: InitOptions): Promise<void> {
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
    const { routerProgramId } = getNetworkConfig(network, options.url);

    spinner.text = 'Connecting to Solana...';

    // Create router client
    const client = new RouterClient(connection, routerProgramId, wallet);

    // Check if portfolio already exists
    spinner.text = 'Checking for existing portfolio...';
    const [portfolioPDA] = client.derivePortfolioPDA(wallet.publicKey);
    const portfolioInfo = await connection.getAccountInfo(portfolioPDA);

    if (portfolioInfo) {
      spinner.succeed();
      displayInfo('Portfolio already exists!');
      console.log(chalk.gray(`  Address: ${portfolioPDA.toBase58()}`));
      console.log();
      console.log(chalk.blue('ℹ'), 'View portfolio with:', chalk.cyan('barista-dlp portfolio'));
      process.exit(0);
    }

    // Build initialization transaction
    spinner.text = 'Building initialization transaction...';
    const ensurePortfolioIxs = await client.ensurePortfolioInstructions(wallet.publicKey);

    if (ensurePortfolioIxs.length === 0) {
      spinner.fail();
      displayError('Failed to generate portfolio initialization instructions');
      process.exit(1);
    }

    const tx = new Transaction().add(...ensurePortfolioIxs);

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
    displaySuccess('Portfolio initialized successfully!');
    console.log(chalk.gray(`  Address: ${portfolioPDA.toBase58()}`));
    console.log(chalk.gray(`  Signature: ${signature}`));
    console.log();

    // Next steps
    console.log(chalk.bold('Next Steps:'));
    console.log(chalk.cyan('  1.'), 'Deposit capital:', chalk.gray('barista-dlp deposit --amount 100000000000'));
    console.log(chalk.cyan('  2.'), 'Create a slab:', chalk.gray('barista-dlp slab create --market SOL-PERP'));
    console.log(chalk.cyan('  3.'), 'View portfolio:', chalk.gray('barista-dlp portfolio'));
    console.log();

  } catch (error) {
    spinner.fail();
    displayError(`Portfolio initialization failed: ${error}`);
    process.exit(1);
  }
}
