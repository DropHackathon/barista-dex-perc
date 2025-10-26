import { RouterClient } from '@barista-dex/sdk';
import ora from 'ora';
import chalk from 'chalk';
import Table from 'cli-table3';
import { loadKeypair } from '../../utils/wallet';
import { createConnection, getNetworkConfig } from '../../utils/network';
import { displayError, formatSolWithSuffix, formatPnl } from '../../utils/display';

interface ViewOptions {
  keypair?: string;
  network?: string;
  url?: string;
  detailed?: boolean;
}

export async function viewCommand(options: ViewOptions): Promise<void> {
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

    // Get portfolio
    spinner.text = 'Fetching portfolio...';
    const [portfolioPDA] = client.derivePortfolioPDA(wallet.publicKey);
    const portfolio = await client.getPortfolio(portfolioPDA);

    if (!portfolio) {
      spinner.fail();
      displayError('Portfolio not found. Create one with: barista-dlp deposit');
      process.exit(1);
    }

    spinner.succeed();

    // Display portfolio summary
    console.log();
    console.log(chalk.bold.cyan('═══════════════════════════════════════'));
    console.log(chalk.bold.cyan('         DLP Portfolio Summary         '));
    console.log(chalk.bold.cyan('═══════════════════════════════════════'));
    console.log();

    // Capital summary table
    const capitalTable = new Table({
      head: [chalk.cyan('Metric'), chalk.cyan('Value')],
      colWidths: [30, 30],
      style: {
        head: [],
        border: ['gray'],
      },
    });

    const equity = BigInt(portfolio.equity.toString());
    const pnl = BigInt(portfolio.pnl.toString());
    const principal = equity - pnl;

    capitalTable.push(
      ['Principal (Deposited)', formatSolWithSuffix(principal.toString())],
      ['Realized PnL', formatPnl(pnl.toString())],
      ['─────────────────────────────', '─────────────────────────────'],
      [chalk.bold('Total Equity'), chalk.bold(formatSolWithSuffix(equity.toString()))]
    );

    console.log(capitalTable.toString());
    console.log();

    // Warning if PnL is negative (traders are winning)
    if (pnl < 0n) {
      console.log(chalk.yellow('⚠'), chalk.yellow('Warning: Negative PnL - Traders are currently winning'));
      console.log(chalk.gray('  This is normal variance, but monitor your risk exposure.'));
      console.log();
    }

    // Exposure summary (if detailed flag)
    if (options.detailed) {
      console.log(chalk.bold.cyan('Exposure Details'));
      console.log(chalk.gray('─────────────────────────────────────────'));
      console.log();

      // Note: In v0.5, exposure tracking is basic since DLP is sole counterparty
      // In v1+, this will show per-slab exposure, open interest, Greeks, etc.
      console.log(chalk.gray('  Model: DLP Counterparty (v0.5)'));
      console.log(chalk.gray('  Role: Sole liquidity provider for all trades'));
      console.log(chalk.gray('  Exposure: Direct counterparty to all open positions'));
      console.log();

      // Portfolio address info
      console.log(chalk.bold.cyan('Account Information'));
      console.log(chalk.gray('─────────────────────────────────────────'));
      console.log(chalk.gray(`  Owner: ${wallet.publicKey.toBase58()}`));
      console.log(chalk.gray(`  Portfolio PDA: ${portfolioPDA.toBase58()}`));
      console.log();
    }

    // Quick tips
    console.log(chalk.gray('💡 Tips:'));
    console.log(chalk.gray('  • Use --detailed for more information'));
    console.log(chalk.gray('  • Create slabs with: barista-dlp slab create'));
    console.log(chalk.gray('  • View analytics with: barista-dlp analytics stats'));
    console.log();

  } catch (error) {
    spinner.fail();
    displayError(`Failed to fetch portfolio: ${error}`);
    process.exit(1);
  }
}
