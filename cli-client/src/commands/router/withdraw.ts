import { Connection, PublicKey, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { RouterClient, Cluster } from '@barista-dex/sdk';
import { loadKeypair, getConfig, getDefaultKeypairPath } from '../../utils/wallet';
import { displaySuccess, displayError, getExplorerUrl } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';
import BN from 'bn.js';

interface WithdrawOptions {
  amount: string;
  keypair?: string;
  url?: string;
  network?: string;
}

export async function withdrawCommand(options: WithdrawOptions): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  try {
    // Validate required options
    if (!options.amount) {
      spinner.fail();
      displayError('Missing required option: --amount <lamports>');
      console.log(chalk.gray('\nExamples:'));
      console.log(chalk.cyan('  barista withdraw --amount 1000000000  # 1 SOL'));
      console.log(chalk.cyan('  barista withdraw --amount 500000000   # 0.5 SOL'));
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

    // Build withdraw instruction
    spinner.text = `Building withdraw transaction (${solAmount} SOL)...`;
    const withdrawIx = await client.buildWithdrawInstruction(
      amount,
      wallet.publicKey
    );

    const transaction = new Transaction().add(withdrawIx);

    // Send and confirm transaction
    spinner.text = 'Sending transaction...';
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      { commitment: 'confirmed' }
    );

    spinner.succeed();
    displaySuccess(`Withdrew ${solAmount} SOL from portfolio!`);

    console.log(chalk.gray(`  Signature: ${signature}`));
    console.log(chalk.gray(`  Explorer: ${getExplorerUrl(signature, config.cluster)}`));
  } catch (error: any) {
    spinner.fail();
    displayError(`Withdrawal failed: ${error.message}`);
    process.exit(1);
  }
}
