import { Connection, PublicKey, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { RouterClient, Cluster } from '@barista-dex/sdk';
import { loadKeypair, getConfig, getDefaultKeypairPath } from '../../utils/wallet';
import { displaySuccess, displayError, getExplorerUrl } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';
import BN from 'bn.js';

interface DepositOptions {
  amount: string;
  keypair?: string;
  url?: string;
  network?: string;
}

export async function depositCommand(options: DepositOptions): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  try {
    // Validate required options
    if (!options.amount) {
      spinner.fail();
      displayError('Missing required option: --amount <lamports>');
      console.log(chalk.gray('\nExamples:'));
      console.log(chalk.cyan('  barista deposit --amount 1000000000  # 1 SOL'));
      console.log(chalk.cyan('  barista deposit --amount 500000000   # 0.5 SOL'));
      process.exit(1);
    }

    // Load configuration (uses env vars if not provided)
    const cluster = options.network as Cluster | undefined;
    const config = getConfig(cluster, options.url);
    const keypairPath = options.keypair || getDefaultKeypairPath();
    const wallet = loadKeypair(keypairPath);

    spinner.text = `Using wallet: ${wallet.publicKey.toBase58()}`;

    // Parse amount
    const amount = new BN(options.amount);
    const solAmount = amount.toNumber() / LAMPORTS_PER_SOL;

    // Connect to Solana
    const connection = new Connection(config.rpcUrl, 'confirmed');

    spinner.text = 'Connecting to Solana...';

    // Create RouterClient
    const client = new RouterClient(
      connection,
      new PublicKey(config.routerProgramId),
      wallet
    );

    // Ensure portfolio exists (auto-create if needed)
    spinner.text = 'Checking portfolio...';
    const ensurePortfolioIxs = await client.ensurePortfolioInstructions(wallet.publicKey);

    if (ensurePortfolioIxs.length > 0) {
      spinner.text = 'Creating portfolio (first-time setup)...';
    }

    // Build deposit instruction
    spinner.text = `Building deposit transaction (${solAmount} SOL)...`;
    const depositIx = await client.buildDepositInstruction(
      amount,
      wallet.publicKey
    );

    const transaction = new Transaction()
      .add(...ensurePortfolioIxs)  // Auto-create portfolio if needed
      .add(depositIx);

    // Send and confirm transaction
    spinner.text = 'Sending transaction...';
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      { commitment: 'confirmed' }
    );

    spinner.succeed();
    displaySuccess(`Deposited ${solAmount} SOL to portfolio!`);

    console.log(chalk.gray(`  Signature: ${signature}`));
    console.log(chalk.gray(`  Explorer: ${getExplorerUrl(signature, config.cluster)}`));
  } catch (error: any) {
    spinner.fail();
    displayError(`Deposit failed: ${error.message}`);
    process.exit(1);
  }
}
