import { Connection, PublicKey } from '@solana/web3.js';
import { RouterClient, Cluster } from '@barista-dex/sdk';
import { loadKeypair, getConfig, getDefaultKeypairPath } from '../../utils/wallet';
import { displayError, formatAmount, formatSol, formatPublicKey } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import boxen from 'boxen';
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

    // Display portfolio summary with cleaner layout
    console.log('');

    // Derive portfolio address using createWithSeed (NOT PDA)
    // NOTE: Portfolio uses create_with_seed to bypass 10KB CPI limit
    const portfolioAddress = await PublicKey.createWithSeed(
      userAddress,
      'portfolio',
      new PublicKey(config.routerProgramId)
    );

    // Show portfolio address
    console.log(chalk.gray(`Portfolio Address: ${chalk.cyan(portfolioAddress.toBase58())}`));
    console.log('');

    // Main balance box
    const equity = formatSol(portfolio.equity);
    const freeCollateral = formatSol(portfolio.freeCollateral);
    const pnl = formatSol(portfolio.pnl);
    const im = formatSol(portfolio.im);

    const balanceBox = boxen(
      chalk.bold.white(`Equity: ${chalk.green(equity)} units\n`) +
      chalk.gray(`Free: ${freeCollateral} units  |  IM: ${im} units  |  PnL: ${pnl} units`),
      {
        padding: { left: 2, right: 2, top: 0, bottom: 0 },
        margin: { top: 0, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: 'cyan',
        title: '💰 Balance',
        titleAlignment: 'left'
      }
    );

    console.log(balanceBox);

    // Positions summary (if any)
    if (portfolio.exposures.length > 0) {
      const positionsBox = boxen(
        chalk.white(`${portfolio.exposures.length} active position${portfolio.exposures.length > 1 ? 's' : ''}`),
        {
          padding: { left: 2, right: 2, top: 0, bottom: 0 },
          margin: { top: 0, bottom: 1, left: 0, right: 0 },
          borderStyle: 'round',
          borderColor: 'yellow',
          title: '📍 Positions',
          titleAlignment: 'left'
        }
      );
      console.log(positionsBox);
    }

    // Display exposures if any
    if (portfolio.exposures.length > 0) {
      const exposuresTable = new Table({
        head: ['Size', 'Entry', 'Mark', 'PnL', 'Notional', 'Lev'],
        colWidths: [12, 12, 12, 14, 14, 6],
        style: {
          head: ['cyan']
        }
      });

      // Resolve slab addresses from registry
      spinner.start('Resolving slab addresses from registry...');
      const registry = await client.getRegistry();

      if (!registry) {
        spinner.fail('Registry not found');
        console.log(chalk.red('\nError: Router registry not initialized'));
        process.exit(1);
      }

      spinner.succeed(`Loaded ${portfolio.exposures.length} position${portfolio.exposures.length > 1 ? 's' : ''}`);

      // Import SlabClient for fetching instrument info
      const { SlabClient } = await import('@barista-dex/sdk');
      const slabClient = new SlabClient(connection, new PublicKey(config.slabProgramId));

      for (const exp of portfolio.exposures) {
        // Resolve slab address from registry index
        const slabEntry = registry.slabs[exp.slabIndex];

        const slabAddress = slabEntry && slabEntry.active
          ? slabEntry.slabId.toBase58()
          : `Unknown (Index ${exp.slabIndex})`;

        // Fetch instrument address and price
        let instrumentAddress = `Unknown (Index ${exp.instrumentIndex})`;
        let markPrice = new BN(0);
        let entryPrice = new BN(0);
        let realizedPnl = '—';
        let unrealizedPnl = '—';

        // Fetch PositionDetails for entry price and realized PnL
        try {
          const portfolioPda = await client.derivePortfolioAddress(userAddress);
          const [positionDetailsPda] = client.derivePositionDetailsPDA(
            portfolioPda,
            exp.slabIndex,
            exp.instrumentIndex
          );

          const positionDetailsAccount = await connection.getAccountInfo(positionDetailsPda);
          if (positionDetailsAccount && positionDetailsAccount.data.length >= 136) {
            const data = positionDetailsAccount.data;
            // PositionDetails layout:
            // - magic (u64): 8 bytes
            // - portfolio (Pubkey): 32 bytes
            // - slab_index (u16): 2 bytes
            // - instrument_index (u16): 2 bytes
            // - bump (u8): 1 byte
            // - _padding1: 3 bytes
            // - avg_entry_price (i64): 8 bytes at offset 48
            // - total_qty (i64): 8 bytes at offset 56
            // - realized_pnl (i128): 16 bytes at offset 64
            // - total_fees (i128): 16 bytes at offset 80
            // - trade_count (u32): 4 bytes at offset 96
            // - _padding2: 4 bytes
            // - last_update_ts (i64): 8 bytes at offset 104
            // - margin_held (u128): 16 bytes at offset 112
            // - leverage (u8): 1 byte at offset 128
            const entryPriceOffset = 48;
            const realizedPnlOffset = 64;
            const marginHeldOffset = 112;
            const leverageOffset = 128;

            entryPrice = new BN(data.readBigInt64LE(entryPriceOffset).toString());
            // Read i128 as two i64s (low, high)
            const pnlLow = data.readBigInt64LE(realizedPnlOffset);
            const pnlHigh = data.readBigInt64LE(realizedPnlOffset + 8);
            // Combine into i128 (simplified for display)
            const realizedPnlValue = pnlLow; // Use low 64 bits for display
            realizedPnl = formatAmount(new BN(realizedPnlValue.toString()));

            // Read margin_held (u128) - use low 64 bits for display
            const marginLow = data.readBigInt64LE(marginHeldOffset);
            const marginHeldLamports = new BN(marginLow.toString());

            // Read leverage (u8)
            const positionLeverage = data.readUInt8(leverageOffset);

            // Store for later use in leverage calculation
            (exp as any).marginHeld = marginHeldLamports;
            (exp as any).positionLeverage = positionLeverage;
          }
        } catch (err) {
          // Silently continue if PositionDetails not found
        }

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

            // Calculate unrealized PnL if we have both prices
            if (!markPrice.isZero() && !entryPrice.isZero() && !exp.positionQty.isZero()) {
              // unrealized_pnl = position_qty * (mark_price - entry_price) / 1e6
              const priceDiff = markPrice.sub(entryPrice);
              const pnl = exp.positionQty.mul(priceDiff).div(new BN(1_000_000));
              unrealizedPnl = formatAmount(pnl);
            }
          } catch (err) {
            // Fallback to unknown if fetch fails
            instrumentAddress = `Unknown (Index ${exp.instrumentIndex})`;
          }
        }

        // Calculate notional value and effective leverage
        let notional = '—';
        let effectiveLeverage = '—';

        if (!markPrice.isZero() && !exp.positionQty.isZero()) {
          // Notional = position_qty × mark_price / 1e6 (in SOL/USD value)
          const notionalValue = exp.positionQty.abs().mul(markPrice).div(new BN(1_000_000));
          notional = formatAmount(notionalValue);

          // Calculate effective leverage from margin_held stored in PositionDetails
          const marginHeld = (exp as any).marginHeld as BN | undefined;
          const positionLeverage = (exp as any).positionLeverage as number | undefined;

          if (marginHeld && marginHeld.gt(new BN(0)) && positionLeverage) {
            // Display the leverage that was used for this position
            effectiveLeverage = `${positionLeverage}x`;
          }
        }

        // Format PnL with color
        const pnlFormatted = unrealizedPnl === '—' ? '—' :
          parseFloat(unrealizedPnl) >= 0 ?
            chalk.green(`+${unrealizedPnl}`) :
            chalk.red(unrealizedPnl);

        exposuresTable.push([
          formatAmount(exp.positionQty),
          entryPrice.isZero() ? '—' : `$${formatAmount(entryPrice)}`,
          markPrice.isZero() ? '—' : `$${formatAmount(markPrice)}`,
          pnlFormatted,
          notional === '—' ? '—' : `$${notional}`,
          effectiveLeverage,
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
