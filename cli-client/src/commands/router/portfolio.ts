import { Connection, PublicKey } from '@solana/web3.js';
import { RouterClient, Cluster } from '@barista-dex/sdk';
import { loadKeypair, getConfig, getDefaultKeypairPath } from '../../utils/wallet';
import { displayError, formatAmount, formatPublicKey } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import BN from 'bn.js';

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

      const network = options.network || 'mainnet-beta';

      console.log(chalk.gray('\nTo initialize your portfolio, deposit SOL:'));
      console.log(chalk.cyan('  barista deposit --amount <LAMPORTS> --network ' + network));
      console.log(chalk.gray('  (1 SOL = 1000000000 lamports)'));
      console.log(chalk.gray('\nExamples:'));
      console.log(chalk.cyan('  barista deposit --amount 1000000000 --network ' + network + '  # 1 SOL'));
      console.log(chalk.cyan('  barista deposit --amount 500000000 --network ' + network + '   # 0.5 SOL'));

      console.log(chalk.gray('\nOr start trading (also auto-creates portfolio):'));
      console.log(chalk.cyan('  barista buy --slab <SLAB> -q <QUANTITY> --network ' + network));
      console.log(chalk.cyan('  barista sell --slab <SLAB> -q <QUANTITY> --network ' + network));

      console.log(chalk.gray('\n💡 Note: v0 supports SOL deposits only (USDC coming in v1+)\n'));
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
        head: ['Slab', 'Instrument', 'Position Qty', 'Mark Price', 'Notional Value'],
        colWidths: [45, 45, 15, 15, 18],
      });

      // Resolve slab addresses from registry
      spinner.start('Resolving slab addresses from registry...');
      const registry = await client.getRegistry();

      if (!registry) {
        spinner.fail('Registry not found');
        console.log(chalk.red('\nError: Router registry not initialized'));
        process.exit(1);
      }

      spinner.succeed(`Registry loaded with ${registry.slabs.length} registered slabs`);

      // Debug: log registry contents
      console.log(chalk.gray('\nRegistry contents:'));
      for (let i = 0; i < Math.min(5, registry.slabs.length); i++) {
        const entry = registry.slabs[i];
        console.log(chalk.gray(`  [${i}] ${entry.slabId.toBase58()} (active: ${entry.active})`));
      }
      console.log();

      // Import SlabClient for fetching instrument info
      const { SlabClient } = await import('@barista-dex/sdk');
      const slabClient = new SlabClient(connection, new PublicKey(config.slabProgramId));

      for (const exp of portfolio.exposures) {
        console.log(chalk.gray(`Looking up position: slabIndex=${exp.slabIndex}, instrumentIndex=${exp.instrumentIndex}, qty=${exp.positionQty.toString()}`));

        // Resolve slab address from registry index
        const slabEntry = registry.slabs[exp.slabIndex];
        console.log(chalk.gray(`  slabEntry: ${slabEntry ? `${slabEntry.slabId.toBase58()} (active=${slabEntry.active})` : 'undefined'}`));

        const slabAddress = slabEntry && slabEntry.active
          ? slabEntry.slabId.toBase58()
          : `Unknown (Index ${exp.slabIndex})`;

        // Fetch instrument address and price
        let instrumentAddress = `Unknown (Index ${exp.instrumentIndex})`;
        let markPrice = new BN(0);
        let notionalValue = '—';

        if (slabEntry && slabEntry.active) {
          try {
            const instruments = await slabClient.getInstruments(slabEntry.slabId);
            if (instruments.length > exp.instrumentIndex) {
              instrumentAddress = instruments[exp.instrumentIndex].pubkey.toBase58();
            }

            // For localnet, read live oracle price (updated by keeper with CoinGecko feed)
            // For mainnet/devnet, use mark_px from slab state (static initialization value)
            if (config.cluster === 'localnet') {
              // Fetch oracle price directly
              try {
                const oracleAccountInfo = await connection.getAccountInfo(slabEntry.oracleId);
                if (oracleAccountInfo && oracleAccountInfo.data.length >= 128) {
                  const data = oracleAccountInfo.data;

                  // Deserialize PriceOracle struct:
                  // - magic (u64): 8 bytes
                  // - version (u8): 1 byte
                  // - bump (u8): 1 byte
                  // - _padding: 6 bytes
                  // - authority (Pubkey): 32 bytes
                  // - instrument (Pubkey): 32 bytes
                  // - price (i64): 8 bytes at offset 80
                  const priceOffset = 80;
                  markPrice = new BN(data.readBigInt64LE(priceOffset).toString());
                }
              } catch (oracleErr) {
                console.error(chalk.yellow(`  Warning: Failed to read oracle price: ${oracleErr}`));
              }
            } else {
              // For mainnet/devnet, use mark_px from slab state
              const slabState = await slabClient.getSlabState(slabEntry.slabId);
              if (slabState && slabState.markPx) {
                markPrice = slabState.markPx;
              }
            }

            // Calculate notional value if we have a price
            if (!markPrice.isZero()) {
              // position_qty * mark_price (both in 1e6 scale)
              // Result needs to be divided by 1e6 to get actual value
              const notional = exp.positionQty.mul(markPrice).div(new BN(1_000_000));
              notionalValue = formatAmount(notional);
            }
          } catch (err) {
            // Fallback to unknown if fetch fails
            instrumentAddress = `Unknown (Index ${exp.instrumentIndex})`;
          }
        }

        exposuresTable.push([
          slabAddress,
          instrumentAddress,
          formatAmount(exp.positionQty),
          markPrice.isZero() ? '—' : `$${formatAmount(markPrice)}`,
          notionalValue,
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
