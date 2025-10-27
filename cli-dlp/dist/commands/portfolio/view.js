"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.viewCommand = viewCommand;
const sdk_1 = require("@barista-dex/sdk");
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const wallet_1 = require("../../utils/wallet");
const network_1 = require("../../utils/network");
const display_1 = require("../../utils/display");
async function viewCommand(options) {
    const spinner = (0, ora_1.default)('Initializing...').start();
    try {
        // Load wallet
        if (!options.keypair) {
            spinner.fail();
            (0, display_1.displayError)('--keypair is required');
            process.exit(1);
        }
        spinner.text = 'Loading wallet...';
        const wallet = (0, wallet_1.loadKeypair)(options.keypair);
        // Setup network
        const network = (options.network || 'localnet');
        const connection = (0, network_1.createConnection)(network, options.url);
        const { routerProgramId } = (0, network_1.getNetworkConfig)(network, options.url);
        spinner.text = 'Connecting to Solana...';
        // Create router client
        const client = new sdk_1.RouterClient(connection, routerProgramId, wallet);
        // Get portfolio
        spinner.text = 'Fetching portfolio...';
        const portfolio = await client.getPortfolio(wallet.publicKey);
        if (!portfolio) {
            spinner.fail();
            (0, display_1.displayError)('Portfolio not found. Create one with: barista-dlp deposit');
            process.exit(1);
        }
        spinner.succeed();
        // Display portfolio summary
        console.log();
        console.log(chalk_1.default.bold.cyan('═══════════════════════════════════════'));
        console.log(chalk_1.default.bold.cyan('         DLP Portfolio Summary         '));
        console.log(chalk_1.default.bold.cyan('═══════════════════════════════════════'));
        console.log();
        // Capital summary table
        const capitalTable = new cli_table3_1.default({
            head: [chalk_1.default.cyan('Metric'), chalk_1.default.cyan('Value')],
            colWidths: [30, 30],
            style: {
                head: [],
                border: ['gray'],
            },
        });
        const equity = BigInt(portfolio.equity.toString());
        const pnl = BigInt(portfolio.pnl.toString());
        const principal = equity - pnl;
        capitalTable.push(['Principal (Deposited)', (0, display_1.formatSolWithSuffix)(principal)], ['Realized PnL', (0, display_1.formatPnl)(pnl)], ['─────────────────────────────', '─────────────────────────────'], [chalk_1.default.bold('Total Equity'), chalk_1.default.bold((0, display_1.formatSolWithSuffix)(equity))]);
        console.log(capitalTable.toString());
        console.log();
        // Warning if PnL is negative (traders are winning)
        if (pnl < 0n) {
            console.log(chalk_1.default.yellow('⚠'), chalk_1.default.yellow('Warning: Negative PnL - Traders are currently winning'));
            console.log(chalk_1.default.gray('  This is normal variance, but monitor your risk exposure.'));
            console.log();
        }
        // Exposure summary (if detailed flag)
        if (options.detailed) {
            console.log(chalk_1.default.bold.cyan('Exposure Details'));
            console.log(chalk_1.default.gray('─────────────────────────────────────────'));
            console.log();
            // Note: In v0.5, exposure tracking is basic since DLP is sole counterparty
            // In v1+, this will show per-slab exposure, open interest, Greeks, etc.
            console.log(chalk_1.default.gray('  Model: DLP Counterparty (v0.5)'));
            console.log(chalk_1.default.gray('  Role: Sole liquidity provider for all trades'));
            console.log(chalk_1.default.gray('  Exposure: Direct counterparty to all open positions'));
            console.log();
            // Portfolio address info
            const portfolioAddress = await client.derivePortfolioAddress(wallet.publicKey);
            console.log(chalk_1.default.bold.cyan('Account Information'));
            console.log(chalk_1.default.gray('─────────────────────────────────────────'));
            console.log(chalk_1.default.gray(`  Owner: ${wallet.publicKey.toBase58()}`));
            console.log(chalk_1.default.gray(`  Portfolio Address: ${portfolioAddress.toBase58()}`));
            console.log();
        }
        // Quick tips
        console.log(chalk_1.default.gray('💡 Tips:'));
        console.log(chalk_1.default.gray('  • Use --detailed for more information'));
        console.log(chalk_1.default.gray('  • Create slabs with: barista-dlp slab create'));
        console.log(chalk_1.default.gray('  • View analytics with: barista-dlp analytics stats'));
        console.log();
    }
    catch (error) {
        spinner.fail();
        (0, display_1.displayError)(`Failed to fetch portfolio: ${error}`);
        process.exit(1);
    }
}
//# sourceMappingURL=view.js.map