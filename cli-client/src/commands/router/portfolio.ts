import { Connection, PublicKey } from '@solana/web3.js';
import { RouterClient, Cluster } from '@barista-dex/sdk';
import { loadKeypair, getConfig, getDefaultKeypairPath } from '../../utils/wallet';
import { displayError, formatAmount, formatPublicKey } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';

interface PortfolioOptions {
  address?: string;
  keypair?: string;
  url?: string;
  network?: string;
}

export async function portfolioCommand(options: PortfolioOptions): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  try {
    // Get cluster configuration (uses env vars if not provided)
    const cluster = options.network as Cluster | undefined;
    const config = getConfig(cluster, options.url);

    const keypairPath = options.keypair || getDefaultKeypairPath();
    const wallet = loadKeypair(keypairPath);

    // Connect to Solana
    const connection = new Connection(config.rpcUrl, 'confirmed');

    spinner.text = 'Connecting to Solana...';

    // Create RouterClient (read-only if only address is provided)
    const client = new RouterClient(
      connection,
      new PublicKey(config.routerProgramId)
    );

    // Determine user address
    const userAddress = options.address
      ? new PublicKey(options.address)
      : wallet.publicKey;

    spinner.text = `Fetching portfolio for ${formatPublicKey(userAddress.toBase58())}...`;

    // Get portfolio
    const portfolio = await client.getPortfolio(userAddress);

    if (!portfolio) {
      spinner.fail();
      console.log(chalk.yellow('\n⚠️  Portfolio not found\n'));
      console.log(chalk.gray('Your portfolio will be automatically created on first use.'));
      console.log(chalk.gray('\nTo initialize your portfolio, try:'));

      const network = options.network || 'mainnet-beta';

      // Show different guidance based on network
      if (network === 'localnet') {
        console.log(chalk.cyan('  • barista deposit --mint <MINT> --amount <AMOUNT> --network localnet'));
        console.log(chalk.gray('    (First create and mint test tokens with spl-token)'));
      } else {
        console.log(chalk.cyan('  • barista deposit --mint <MINT> --amount <AMOUNT> --network ' + network));
        console.log(chalk.gray('    (Requires existing tokens in your wallet)'));
      }

      console.log(chalk.cyan('  • barista buy --slab <SLAB> -q <QUANTITY> --network ' + network));
      console.log(chalk.cyan('  • barista sell --slab <SLAB> -q <QUANTITY> --network ' + network));
      console.log(chalk.gray('\nYour portfolio will be created automatically in the same transaction.\n'));
      process.exit(1);
    }

    spinner.succeed('Portfolio loaded');

    // Display portfolio summary
    console.log(chalk.bold('\n📊 Portfolio Summary\n'));

    const summaryTable = new Table({
      head: ['Metric', 'Value'],
      colWidths: [30, 35],
    });

    summaryTable.push(
      ['User', formatPublicKey(portfolio.user.toBase58())],
      ['Router ID', formatPublicKey(portfolio.routerId.toBase58())],
      ['Bump', portfolio.bump.toString()],
      ['', ''],
      [chalk.bold('💰 Balance'), ''],
      ['Equity', formatAmount(portfolio.equity)],
      ['Principal (Deposits)', formatAmount(portfolio.principal)],
      ['Free Collateral', formatAmount(portfolio.freeCollateral)],
      ['', ''],
      [chalk.bold('📈 PnL & Vesting'), ''],
      ['Unrealized PnL', formatAmount(portfolio.pnl)],
      ['Vested PnL', formatAmount(portfolio.vestedPnl)],
      ['PnL Index Checkpoint', formatAmount(portfolio.pnlIndexCheckpoint)],
      ['Last Slot', portfolio.lastSlot.toString()],
      ['', ''],
      [chalk.bold('🛡️  Margin & Risk'), ''],
      ['Initial Margin (IM)', formatAmount(portfolio.im)],
      ['Maintenance Margin (MM)', formatAmount(portfolio.mm)],
      ['Health', formatAmount(portfolio.health)],
      ['Last Mark Timestamp', portfolio.lastMarkTs.toString()],
      ['', ''],
      [chalk.bold('⚠️  Liquidation'), ''],
      ['Last Liquidation Ts', portfolio.lastLiquidationTs.toString()],
      ['Cooldown (seconds)', portfolio.cooldownSeconds.toString()],
      ['', ''],
      [chalk.bold('📍 Positions & LP'), ''],
      ['Active Exposures', portfolio.exposureCount.toString()],
      ['Active LP Buckets', portfolio.lpBuckets.length.toString()]
    );

    console.log(summaryTable.toString());

    // Display exposures if any
    if (portfolio.exposures.length > 0) {
      console.log(chalk.bold('\n📍 Trading Positions\n'));

      const exposuresTable = new Table({
        head: ['Slab', 'Instrument', 'Position Qty'],
        colWidths: [10, 15, 20],
      });

      for (const exp of portfolio.exposures) {
        exposuresTable.push([
          exp.slabIndex.toString(),
          exp.instrumentIndex.toString(),
          formatAmount(exp.positionQty),
        ]);
      }

      console.log(exposuresTable.toString());
    }

    // Display LP buckets if any
    if (portfolio.lpBuckets.length > 0) {
      console.log(chalk.bold('\n💧 Liquidity Provider Positions\n'));

      const lpTable = new Table({
        head: ['Market ID', 'Venue', 'Type', 'Value', 'IM', 'MM'],
        colWidths: [12, 8, 10, 20, 15, 15],
      });

      for (const bucket of portfolio.lpBuckets) {
        const venueKind = bucket.venue.venueKind === 0 ? 'Slab' : 'AMM';
        const marketId = formatPublicKey(bucket.venue.marketId.toBase58());

        if (bucket.amm) {
          lpTable.push([
            marketId,
            venueKind,
            'AMM LP',
            `${formatAmount(bucket.amm.lpShares)} shares`,
            formatAmount(bucket.im),
            formatAmount(bucket.mm),
          ]);
        }

        if (bucket.slab) {
          lpTable.push([
            marketId,
            venueKind,
            'Slab LP',
            `${bucket.slab.openOrderCount} orders`,
            formatAmount(bucket.im),
            formatAmount(bucket.mm),
          ]);
        }
      }

      console.log(lpTable.toString());
    }
  } catch (error: any) {
    spinner.fail();
    displayError(`Failed to fetch portfolio: ${error.message}`);
    process.exit(1);
  }
}
