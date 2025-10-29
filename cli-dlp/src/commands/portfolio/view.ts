import { RouterClient } from '@barista-dex/sdk';
import ora from 'ora';
import chalk from 'chalk';
import Table from 'cli-table3';
import boxen from 'boxen';
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
    const portfolio = await client.getPortfolio(wallet.publicKey);

    if (!portfolio) {
      spinner.fail();
      displayError('Portfolio not found. Create one with: barista-dlp deposit');
      process.exit(1);
    }

    spinner.succeed('Portfolio loaded');

    // Display portfolio summary with cleaner layout
    console.log('');

    // Show portfolio address
    const portfolioAddress = await client.derivePortfolioAddress(wallet.publicKey);
    console.log(chalk.gray(`Portfolio Address: ${chalk.cyan(portfolioAddress.toBase58())}`));
    console.log('');

    // Main balance box
    const equity = BigInt(portfolio.equity.toString());
    const pnl = BigInt(portfolio.pnl.toString());
    const principal = equity - pnl;

    const equityFormatted = formatSolWithSuffix(equity);
    const principalFormatted = formatSolWithSuffix(principal);
    const pnlFormatted = formatPnl(pnl);

    const balanceBox = boxen(
      chalk.bold.white(`Equity: ${chalk.green(equityFormatted)}\n`) +
      chalk.gray(`Principal: ${principalFormatted}  |  Realized PnL: ${pnlFormatted}`),
      {
        padding: { left: 2, right: 2, top: 0, bottom: 0 },
        margin: { top: 0, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: 'cyan',
        title: '💰 DLP Balance',
        titleAlignment: 'left'
      }
    );

    console.log(balanceBox);

    // Warning if PnL is negative (traders are winning)
    if (pnl < 0n) {
      const warningBox = boxen(
        chalk.yellow('Negative PnL - Traders are currently winning\n') +
        chalk.gray('This is normal variance, but monitor your risk exposure.'),
        {
          padding: { left: 2, right: 2, top: 0, bottom: 0 },
          margin: { top: 0, bottom: 1, left: 0, right: 0 },
          borderStyle: 'round',
          borderColor: 'yellow',
          title: '⚠️  Warning',
          titleAlignment: 'left'
        }
      );
      console.log(warningBox);
    }

    // Exposure summary (if detailed flag)
    if (options.detailed) {
      const exposureBox = boxen(
        chalk.white('Model: DLP Counterparty (v0.5)\n') +
        chalk.gray('Role: Sole liquidity provider for all trades\n') +
        chalk.gray('Exposure: Direct counterparty to all open positions'),
        {
          padding: { left: 2, right: 2, top: 0, bottom: 0 },
          margin: { top: 0, bottom: 1, left: 0, right: 0 },
          borderStyle: 'round',
          borderColor: 'magenta',
          title: '📊 Exposure Details',
          titleAlignment: 'left'
        }
      );
      console.log(exposureBox);

      // Account info
      const accountBox = boxen(
        chalk.gray(`Owner: ${wallet.publicKey.toBase58()}\n`) +
        chalk.gray(`Portfolio: ${portfolioAddress.toBase58()}`),
        {
          padding: { left: 2, right: 2, top: 0, bottom: 0 },
          margin: { top: 0, bottom: 1, left: 0, right: 0 },
          borderStyle: 'round',
          borderColor: 'gray',
          title: 'ℹ️  Account Information',
          titleAlignment: 'left'
        }
      );
      console.log(accountBox);
    }

    // Quick tips
    console.log(chalk.gray('💡 Tips:'));
    console.log(chalk.gray('  • Use --detailed for more information'));
    console.log(chalk.gray('  • Create slabs: barista-dlp slab-create'));
    console.log(chalk.gray('  • View slab: barista-dlp slab-view --address <SLAB>'));
    console.log();

  } catch (error) {
    spinner.fail();
    displayError(`Failed to fetch portfolio: ${error}`);
    process.exit(1);
  }
}
