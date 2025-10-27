"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.viewSlabCommand = viewSlabCommand;
const web3_js_1 = require("@solana/web3.js");
const sdk_1 = require("@barista-dex/sdk");
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const wallet_1 = require("../../utils/wallet");
const network_1 = require("../../utils/network");
const display_1 = require("../../utils/display");
async function viewSlabCommand(options) {
    const spinner = (0, ora_1.default)('Initializing...').start();
    try {
        // Validate address
        if (!options.address) {
            spinner.fail();
            (0, display_1.displayError)('--address is required');
            console.log(chalk_1.default.gray('  Usage: barista-dlp slab:view --address <slab-pubkey>'));
            process.exit(1);
        }
        let slabAddress;
        try {
            slabAddress = new web3_js_1.PublicKey(options.address);
        }
        catch (e) {
            spinner.fail();
            (0, display_1.displayError)('Invalid slab address');
            process.exit(1);
        }
        // Setup network
        const network = (options.network || 'localnet');
        const connection = (0, network_1.createConnection)(network, options.url);
        const { slabProgramId } = (0, network_1.getNetworkConfig)(network, options.url);
        spinner.text = 'Connecting to Solana...';
        // Load wallet if provided (for checking if you own this slab)
        let wallet;
        if (options.keypair) {
            wallet = (0, wallet_1.loadKeypair)(options.keypair);
        }
        // Create slab client
        const client = new sdk_1.SlabClient(connection, slabProgramId, wallet);
        // Fetch slab state
        spinner.text = 'Fetching slab state...';
        const slabState = await client.getSlabState(slabAddress);
        if (!slabState) {
            spinner.fail();
            (0, display_1.displayError)('Slab not found');
            console.log(chalk_1.default.gray(`  Address: ${slabAddress.toBase58()}`));
            console.log();
            console.log(chalk_1.default.yellow('⚠'), 'Make sure the slab address is correct and deployed');
            process.exit(1);
        }
        spinner.succeed();
        // Display slab information
        console.log();
        console.log(chalk_1.default.bold.cyan('═══════════════════════════════════════'));
        console.log(chalk_1.default.bold.cyan('           Slab Information            '));
        console.log(chalk_1.default.bold.cyan('═══════════════════════════════════════'));
        console.log();
        // Basic info table
        const infoTable = new cli_table3_1.default({
            head: [chalk_1.default.cyan('Field'), chalk_1.default.cyan('Value')],
            colWidths: [25, 55],
            style: {
                head: [],
                border: ['gray'],
            },
        });
        infoTable.push(['Slab Address', (0, display_1.formatPubkey)(slabAddress.toBase58(), 20)], ['LP Owner (DLP)', (0, display_1.formatPubkey)(slabState.lpOwner.toBase58(), 20)], ['Router ID', (0, display_1.formatPubkey)(slabState.routerId.toBase58(), 20)], ['Instrument', (0, display_1.formatPubkey)(slabState.instrument.toBase58(), 20)]);
        // Check if you own this slab
        if (wallet && slabState.lpOwner.equals(wallet.publicKey)) {
            infoTable.push(['', chalk_1.default.green('✓ You own this slab')]);
        }
        console.log(infoTable.toString());
        console.log();
        // Parameters table
        const paramsTable = new cli_table3_1.default({
            head: [chalk_1.default.cyan('Parameter'), chalk_1.default.cyan('Value')],
            colWidths: [25, 55],
            style: {
                head: [],
                border: ['gray'],
            },
        });
        // Format prices (1e6 scale)
        const markPxSol = Number(slabState.markPx.toString()) / 1000000;
        const contractSizeSol = Number(slabState.contractSize.toString()) / 1000000;
        const takerFeeBps = Number(slabState.takerFeeBps.toString()) / 100; // Convert to actual bps
        paramsTable.push(['Mark Price', `$${markPxSol.toFixed(2)}`], ['Contract Size', `${contractSizeSol.toFixed(6)}`], ['Taker Fee', `${takerFeeBps.toFixed(2)} bps`], ['Sequence Number', slabState.seqno.toString()], ['Bump', slabState.bump.toString()]);
        console.log(paramsTable.toString());
        console.log();
        // Detailed view
        if (options.detailed) {
            console.log(chalk_1.default.bold.cyan('Detailed Information'));
            console.log(chalk_1.default.gray('─────────────────────────────────────────'));
            console.log();
            // Fetch best prices
            spinner.start('Fetching best prices...');
            const bestPrices = await client.getBestPrices(slabAddress);
            spinner.stop();
            const pricesTable = new cli_table3_1.default({
                head: [chalk_1.default.cyan('Side'), chalk_1.default.cyan('Price'), chalk_1.default.cyan('Size')],
                style: {
                    head: [],
                    border: ['gray'],
                },
            });
            if (bestPrices.bid && bestPrices.ask && bestPrices.spread && bestPrices.spreadBps) {
                const bidPriceSol = Number(bestPrices.bid.price.toString()) / 1000000;
                const askPriceSol = Number(bestPrices.ask.price.toString()) / 1000000;
                const spreadSol = Number(bestPrices.spread.toString()) / 1000000;
                const spreadBps = Number(bestPrices.spreadBps.toString()) / 100;
                pricesTable.push([chalk_1.default.green('Bid'), `$${bidPriceSol.toFixed(2)}`, bestPrices.bid.size.toString()], [chalk_1.default.red('Ask'), `$${askPriceSol.toFixed(2)}`, bestPrices.ask.size.toString()], ['Spread', `$${spreadSol.toFixed(2)} (${spreadBps.toFixed(2)} bps)`, '']);
            }
            else {
                pricesTable.push(['No prices available', '', '']);
            }
            console.log(pricesTable.toString());
            console.log();
            // Fetch instruments
            spinner.start('Fetching instruments...');
            const instruments = await client.getInstruments(slabAddress);
            spinner.stop();
            console.log(chalk_1.default.bold.cyan('Instruments'));
            console.log(chalk_1.default.gray('─────────────────────────────────────────'));
            console.log();
            instruments.forEach((inst, idx) => {
                console.log(chalk_1.default.cyan(`  ${idx + 1}. ${(0, display_1.formatPubkey)(inst.pubkey.toBase58(), 15)}`));
                console.log(chalk_1.default.gray(`     Mark Price: $${(Number(inst.markPx.toString()) / 1000000).toFixed(2)}`));
                console.log(chalk_1.default.gray(`     Contract Size: ${(Number(inst.contractSize.toString()) / 1000000).toFixed(6)}`));
                console.log(chalk_1.default.gray(`     Taker Fee: ${(Number(inst.takerFeeBps.toString()) / 100).toFixed(2)} bps`));
            });
            console.log();
        }
        // Tips
        console.log(chalk_1.default.gray('💡 Tips:'));
        console.log(chalk_1.default.gray('  • Use --detailed for more information'));
        if (wallet && slabState.lpOwner.equals(wallet.publicKey)) {
            console.log(chalk_1.default.gray('  • Update slab: barista-dlp slab:update --address <address>'));
            console.log(chalk_1.default.gray('  • Pause trading: barista-dlp slab:pause --address <address>'));
        }
        console.log();
    }
    catch (error) {
        spinner.fail();
        (0, display_1.displayError)(`Failed to fetch slab: ${error}`);
        process.exit(1);
    }
}
//# sourceMappingURL=view.js.map