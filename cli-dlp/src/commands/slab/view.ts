import { PublicKey } from '@solana/web3.js';
import { SlabClient } from '@barista-dex/sdk';
import ora from 'ora';
import chalk from 'chalk';
import Table from 'cli-table3';
import { loadKeypair } from '../../utils/wallet';
import { createConnection, getNetworkConfig } from '../../utils/network';
import { displayError, displaySuccess, formatSolWithSuffix, formatPubkey } from '../../utils/display';

interface ViewSlabOptions {
  address?: string;
  keypair?: string;
  network?: string;
  url?: string;
  detailed?: boolean;
}

export async function viewSlabCommand(options: ViewSlabOptions): Promise<void> {
  const spinner = ora('Initializing...').start();

  try {
    // Validate address
    if (!options.address) {
      spinner.fail();
      displayError('--address is required');
      console.log(chalk.gray('  Usage: barista-dlp slab:view --address <slab-pubkey>'));
      process.exit(1);
    }

    let slabAddress: PublicKey;
    try {
      slabAddress = new PublicKey(options.address);
    } catch (e) {
      spinner.fail();
      displayError('Invalid slab address');
      process.exit(1);
    }

    // Setup network
    const network = (options.network || 'localnet') as 'localnet' | 'devnet' | 'mainnet-beta';
    const connection = createConnection(network, options.url);
    const { slabProgramId } = getNetworkConfig(network, options.url);

    spinner.text = 'Connecting to Solana...';

    // Load wallet if provided (for checking if you own this slab)
    let wallet;
    if (options.keypair) {
      wallet = loadKeypair(options.keypair);
    }

    // Create slab client
    const client = new SlabClient(connection, slabProgramId, wallet);

    // Fetch slab state
    spinner.text = 'Fetching slab state...';
    const slabState = await client.getSlabState(slabAddress);

    if (!slabState) {
      spinner.fail();
      displayError('Slab not found');
      console.log(chalk.gray(`  Address: ${slabAddress.toBase58()}`));
      console.log();
      console.log(chalk.yellow('⚠'), 'Make sure the slab address is correct and deployed');
      process.exit(1);
    }

    spinner.succeed();

    // Display slab information
    console.log();
    console.log(chalk.bold.cyan('═══════════════════════════════════════'));
    console.log(chalk.bold.cyan('           Slab Information            '));
    console.log(chalk.bold.cyan('═══════════════════════════════════════'));
    console.log();

    // Basic info table
    const infoTable = new Table({
      head: [chalk.cyan('Field'), chalk.cyan('Value')],
      colWidths: [25, 55],
      style: {
        head: [],
        border: ['gray'],
      },
    });

    infoTable.push(
      ['Slab Address', formatPubkey(slabAddress.toBase58(), 20)],
      ['LP Owner (DLP)', formatPubkey(slabState.lpOwner.toBase58(), 20)],
      ['Router ID', formatPubkey(slabState.routerId.toBase58(), 20)],
      ['Instrument', formatPubkey(slabState.instrument.toBase58(), 20)]
    );

    // Check if you own this slab
    if (wallet && slabState.lpOwner.equals(wallet.publicKey)) {
      infoTable.push(['', chalk.green('✓ You own this slab')]);
    }

    console.log(infoTable.toString());
    console.log();

    // Parameters table
    const paramsTable = new Table({
      head: [chalk.cyan('Parameter'), chalk.cyan('Value')],
      colWidths: [25, 55],
      style: {
        head: [],
        border: ['gray'],
      },
    });

    // Format prices (1e6 scale)
    const markPxSol = Number(slabState.markPx.toString()) / 1_000_000;
    const contractSizeSol = Number(slabState.contractSize.toString()) / 1_000_000;
    const takerFeeBps = Number(slabState.takerFeeBps.toString()) / 100; // Convert to actual bps

    paramsTable.push(
      ['Mark Price', `$${markPxSol.toFixed(2)}`],
      ['Contract Size', `${contractSizeSol.toFixed(6)}`],
      ['Taker Fee', `${takerFeeBps.toFixed(2)} bps`],
      ['Sequence Number', slabState.seqno.toString()],
      ['Bump', slabState.bump.toString()]
    );

    console.log(paramsTable.toString());
    console.log();

    // Detailed view
    if (options.detailed) {
      console.log(chalk.bold.cyan('Detailed Information'));
      console.log(chalk.gray('─────────────────────────────────────────'));
      console.log();

      // Fetch best prices
      spinner.start('Fetching best prices...');
      const bestPrices = await client.getBestPrices(slabAddress);
      spinner.stop();

      const pricesTable = new Table({
        head: [chalk.cyan('Side'), chalk.cyan('Price'), chalk.cyan('Size')],
        style: {
          head: [],
          border: ['gray'],
        },
      });

      const bidPriceSol = Number(bestPrices.bid.price.toString()) / 1_000_000;
      const askPriceSol = Number(bestPrices.ask.price.toString()) / 1_000_000;
      const spreadSol = Number(bestPrices.spread.toString()) / 1_000_000;
      const spreadBps = Number(bestPrices.spreadBps.toString()) / 100;

      pricesTable.push(
        [chalk.green('Bid'), `$${bidPriceSol.toFixed(2)}`, bestPrices.bid.size.toString()],
        [chalk.red('Ask'), `$${askPriceSol.toFixed(2)}`, bestPrices.ask.size.toString()],
        ['Spread', `$${spreadSol.toFixed(2)} (${spreadBps.toFixed(2)} bps)`, '']
      );

      console.log(pricesTable.toString());
      console.log();

      // Fetch instruments
      spinner.start('Fetching instruments...');
      const instruments = await client.getInstruments(slabAddress);
      spinner.stop();

      console.log(chalk.bold.cyan('Instruments'));
      console.log(chalk.gray('─────────────────────────────────────────'));
      console.log();

      instruments.forEach((inst, idx) => {
        console.log(chalk.cyan(`  ${idx + 1}. ${formatPubkey(inst.pubkey.toBase58(), 15)}`));
        console.log(chalk.gray(`     Mark Price: $${(Number(inst.markPx.toString()) / 1_000_000).toFixed(2)}`));
        console.log(chalk.gray(`     Contract Size: ${(Number(inst.contractSize.toString()) / 1_000_000).toFixed(6)}`));
        console.log(chalk.gray(`     Taker Fee: ${(Number(inst.takerFeeBps.toString()) / 100).toFixed(2)} bps`));
      });
      console.log();
    }

    // Tips
    console.log(chalk.gray('💡 Tips:'));
    console.log(chalk.gray('  • Use --detailed for more information'));
    if (wallet && slabState.lpOwner.equals(wallet.publicKey)) {
      console.log(chalk.gray('  • Update slab: barista-dlp slab:update --address <address>'));
      console.log(chalk.gray('  • Pause trading: barista-dlp slab:pause --address <address>'));
    }
    console.log();

  } catch (error) {
    spinner.fail();
    displayError(`Failed to fetch slab: ${error}`);
    process.exit(1);
  }
}
