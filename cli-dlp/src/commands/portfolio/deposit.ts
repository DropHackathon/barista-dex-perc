import { Transaction } from '@solana/web3.js';
import { RouterClient } from '@barista-dex/sdk';
import BN from 'bn.js';
import ora from 'ora';
import chalk from 'chalk';
import { loadKeypair } from '../../utils/wallet';
import { createConnection, getNetworkConfig } from '../../utils/network';
import { displaySuccess, displayError, formatSolWithSuffix } from '../../utils/display';
import { checkDepositAmount, displaySafetyResults } from '../../utils/safety';

interface DepositOptions {
  amount: string;
  keypair?: string;
  network?: string;
  url?: string;
}

export async function depositCommand(options: DepositOptions): Promise<void> {
  const spinner = ora('Initializing...').start();

  try {
    // Validate amount
    const amount = new BN(options.amount);
    if (amount.lte(new BN(0))) {
      spinner.fail();
      displayError('Amount must be greater than 0');
      process.exit(1);
    }

    // Safety check
    const safetyCheck = checkDepositAmount(amount);
    if (safetyCheck.warnings.length > 0) {
      spinner.stop();
      displaySafetyResults(safetyCheck);
      console.log(); // Empty line
      spinner.start('Proceeding with deposit...');
    }

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

    // Check if portfolio exists
    spinner.text = 'Checking portfolio...';
    const portfolioAddress = await client.derivePortfolioAddress(wallet.publicKey);
    const portfolioInfo = await connection.getAccountInfo(portfolioAddress);

    const needsInit = !portfolioInfo;

    // Build transaction
    spinner.text = needsInit ? 'Creating portfolio and depositing...' : 'Building deposit transaction...';

    const tx = new Transaction();

    // Add portfolio initialization if needed
    if (needsInit) {
      const ensurePortfolioIxs = await client.ensurePortfolioInstructions(wallet.publicKey);
      tx.add(...ensurePortfolioIxs);
    }

    // Add deposit instruction
    const depositIx = await client.buildDepositInstruction(amount, wallet.publicKey);
    tx.add(depositIx);

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
    displaySuccess(`Deposited ${formatSolWithSuffix(amount)} to portfolio!`);
    console.log(chalk.gray(`  Signature: ${signature}`));
    console.log(chalk.gray(`  Portfolio: ${portfolioAddress.toBase58()}`));

    if (needsInit) {
      console.log();
      console.log(chalk.blue('ℹ'), 'Portfolio created successfully (first-time setup)');
    }

    console.log();
    console.log('Next steps:');
    console.log('  1. View your portfolio: barista-dlp portfolio');
    console.log('  2. Create a slab: barista-dlp slab create (coming soon)');
  } catch (error) {
    spinner.fail();
    displayError(`Deposit failed: ${error}`);
    process.exit(1);
  }
}
