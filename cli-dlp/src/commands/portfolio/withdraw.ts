import { Transaction } from '@solana/web3.js';
import { RouterClient } from '@barista-dex/sdk';
import BN from 'bn.js';
import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadKeypair } from '../../utils/wallet';
import { createConnection, getNetworkConfig } from '../../utils/network';
import { displaySuccess, displayError, displayInfo, formatSolWithSuffix } from '../../utils/display';
import { checkWithdrawalSafety, displaySafetyResults } from '../../utils/safety';

interface WithdrawOptions {
  amount: string;
  force?: boolean;
  keypair?: string;
  network?: string;
  url?: string;
}

export async function withdrawCommand(options: WithdrawOptions): Promise<void> {
  const spinner = ora('Initializing...').start();

  try {
    // Validate amount
    const amount = new BN(options.amount);
    if (amount.lte(new BN(0))) {
      spinner.fail();
      displayError('Amount must be greater than 0');
      process.exit(1);
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

    // Get portfolio
    spinner.text = 'Fetching portfolio...';
    const portfolio = await client.getPortfolio(wallet.publicKey);

    if (!portfolio) {
      spinner.fail();
      displayError('Portfolio not found. Create one with: barista-dlp deposit');
      process.exit(1);
    }

    // Safety checks
    if (!options.force) {
      spinner.text = 'Running safety checks...';
      const safetyCheck = checkWithdrawalSafety(portfolio, amount);

      if (!safetyCheck.safe || safetyCheck.warnings.length > 0) {
        spinner.stop();
        console.log();
        displaySafetyResults(safetyCheck);

        if (!safetyCheck.safe) {
          console.log();
          displayError('Withdrawal blocked by safety checks');
          console.log(chalk.gray('  Override with --force (not recommended)'));
          process.exit(1);
        }

        // Warnings only - prompt for confirmation
        if (safetyCheck.warnings.length > 0) {
          console.log();
          const { confirmed } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmed',
              message: 'Proceed with withdrawal despite warnings?',
              default: false,
            },
          ]);

          if (!confirmed) {
            displayInfo('Withdrawal cancelled');
            process.exit(0);
          }

          spinner.start('Proceeding with withdrawal...');
        }
      }
    }

    // Build transaction
    spinner.text = 'Building withdrawal transaction...';
    const withdrawIx = await client.buildWithdrawInstruction(amount, wallet.publicKey);
    const tx = new Transaction().add(withdrawIx);

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
    displaySuccess(`Withdrew ${formatSolWithSuffix(amount)} from portfolio!`);
    console.log(chalk.gray(`  Signature: ${signature}`));

    // Show remaining balance
    const equity = new BN(portfolio.equity.toString());
    const remaining = equity.sub(amount);
    console.log();
    console.log(chalk.blue('ℹ'), `Remaining balance: ${formatSolWithSuffix(remaining)}`);

  } catch (error) {
    spinner.fail();
    displayError(`Withdrawal failed: ${error}`);
    process.exit(1);
  }
}
