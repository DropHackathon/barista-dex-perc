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
    const pnl = formatSol(portfolio.pnl);
    const im = formatSol(portfolio.im);

    const balanceBox = boxen(
      chalk.bold.white(`Equity: ${chalk.green(equity)} units\n`) +
      chalk.gray(`IM: ${im} units  |  PnL: ${pnl} units`),
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
        head: ['Market', 'Size', 'Entry', 'Mark', 'PnL', 'Notional', 'Lev'],
        colWidths: [20, 16, 16, 16, 18, 18, 10],
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

      // Group exposures by instrument address for netting
      interface PositionData {
        instrumentAddress: string;
        totalQty: BN;
        weightedEntryPrice: BN; // For calculating avg entry
        totalNotional: BN;
        markPrice: BN;
        totalMarginHeld: BN;
        totalRealizedPnl: BN;
        slabPositions: Array<{
          slabIndex: number;
          instrumentIndex: number;
          qty: BN;
          entryPrice: BN;
          marginHeld: BN;
        }>;
      }

      const positionsByInstrument = new Map<string, PositionData>();

      for (const exp of portfolio.exposures) {
        // Resolve slab address from registry index
        const slabEntry = registry.slabs[exp.slabIndex];

        // Fetch instrument address and price
        let instrumentAddress = `Unknown-${exp.slabIndex}-${exp.instrumentIndex}`;
        let markPrice = new BN(0);
        let entryPrice = new BN(0);
        let marginHeld = new BN(0);
        let realizedPnlValue = new BN(0);

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
            const entryPriceOffset = 48;
            const realizedPnlOffset = 64;
            const marginHeldOffset = 112;

            entryPrice = new BN(data.readBigInt64LE(entryPriceOffset).toString());
            const pnlLow = data.readBigInt64LE(realizedPnlOffset);
            realizedPnlValue = new BN(pnlLow.toString());
            const marginLow = data.readBigInt64LE(marginHeldOffset);
            marginHeld = new BN(marginLow.toString());
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

            // Fetch mark price
            if (config.cluster === 'localnet') {
              try {
                const oracleAccountInfo = await connection.getAccountInfo(slabEntry.oracleId);
                if (oracleAccountInfo && oracleAccountInfo.data.length >= 128) {
                  const data = oracleAccountInfo.data;
                  const priceOffset = 80;
                  markPrice = new BN(data.readBigInt64LE(priceOffset).toString());
                }
              } catch (oracleErr) {
                console.error(chalk.yellow(`  Warning: Failed to read oracle price: ${oracleErr}`));
              }
            } else {
              const slabState = await slabClient.getSlabState(slabEntry.slabId);
              if (slabState && slabState.markPx) {
                markPrice = slabState.markPx;
              }
            }
          } catch (err) {
            // Fallback to unknown if fetch fails
          }
        }

        // Aggregate by instrument
        const existing = positionsByInstrument.get(instrumentAddress);
        if (existing) {
          // Net the quantity
          existing.totalQty = existing.totalQty.add(exp.positionQty);

          // Weighted entry price (weighted by notional)
          const notional = exp.positionQty.abs().mul(entryPrice);
          existing.weightedEntryPrice = existing.weightedEntryPrice.add(notional);
          existing.totalNotional = existing.totalNotional.add(exp.positionQty.abs());

          // Sum margin
          existing.totalMarginHeld = existing.totalMarginHeld.add(marginHeld);
          existing.totalRealizedPnl = existing.totalRealizedPnl.add(realizedPnlValue);

          // Update mark price (use latest)
          if (!markPrice.isZero()) {
            existing.markPrice = markPrice;
          }

          // Track underlying slab positions
          existing.slabPositions.push({
            slabIndex: exp.slabIndex,
            instrumentIndex: exp.instrumentIndex,
            qty: exp.positionQty,
            entryPrice,
            marginHeld,
          });
        } else {
          positionsByInstrument.set(instrumentAddress, {
            instrumentAddress,
            totalQty: exp.positionQty,
            weightedEntryPrice: exp.positionQty.abs().mul(entryPrice),
            totalNotional: exp.positionQty.abs(),
            markPrice,
            totalMarginHeld: marginHeld,
            totalRealizedPnl: realizedPnlValue,
            slabPositions: [{
              slabIndex: exp.slabIndex,
              instrumentIndex: exp.instrumentIndex,
              qty: exp.positionQty,
              entryPrice,
              marginHeld,
            }],
          });
        }
      }

      // Now display netted positions
      for (const [instrumentAddr, position] of positionsByInstrument.entries()) {
        // Skip if position is completely flat
        if (position.totalQty.isZero()) {
          continue;
        }

        // Calculate weighted average entry price
        const avgEntryPrice = position.totalNotional.isZero()
          ? new BN(0)
          : position.weightedEntryPrice.div(position.totalNotional);

        // Calculate unrealized PnL
        let unrealizedPnl = '—';
        if (!position.markPrice.isZero() && !avgEntryPrice.isZero() && !position.totalQty.isZero()) {
          const priceDiff = position.markPrice.sub(avgEntryPrice);
          const pnl = position.totalQty.mul(priceDiff).div(new BN(1_000_000));
          unrealizedPnl = formatAmount(pnl);
        }

        // Calculate notional value
        let notional = '—';
        if (!position.markPrice.isZero() && !position.totalQty.isZero()) {
          const notionalUsd = position.totalQty.abs().mul(position.markPrice).div(new BN(1_000_000));
          notional = formatAmount(notionalUsd);
        }

        // Calculate aggregate effective leverage
        let effectiveLeverage = '—';
        if (position.totalMarginHeld.gt(new BN(0)) && !position.totalQty.isZero()) {
          const notionalLamports = position.totalQty.abs().mul(new BN(1_000));
          const leverage = notionalLamports.mul(new BN(100)).div(position.totalMarginHeld);
          const leverageFloat = leverage.toNumber() / 100;
          effectiveLeverage = `${leverageFloat.toFixed(2)}x`;
        }

        // Format market identifier (truncated instrument address)
        const marketId = instrumentAddr.startsWith('Unknown')
          ? instrumentAddr
          : `${instrumentAddr.slice(0, 4)}...${instrumentAddr.slice(-4)}`;

        // Format PnL with color
        const pnlFormatted = unrealizedPnl === '—' ? '—' :
          parseFloat(unrealizedPnl) >= 0 ?
            chalk.green(`+${unrealizedPnl}`) :
            chalk.red(unrealizedPnl);

        // Add row with netted position
        exposuresTable.push([
          marketId,
          formatAmount(position.totalQty),
          avgEntryPrice.isZero() ? '—' : `$${formatAmount(avgEntryPrice)}`,
          position.markPrice.isZero() ? '—' : `$${formatAmount(position.markPrice)}`,
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
