"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.viewCommand = viewCommand;
const sdk_1 = require("@barista-dex/sdk");
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const boxen_1 = __importDefault(require("boxen"));
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
        spinner.succeed('Portfolio loaded');
        // Display portfolio summary with cleaner layout
        console.log('');
        // Show portfolio address
        const portfolioAddress = await client.derivePortfolioAddress(wallet.publicKey);
        console.log(chalk_1.default.gray(`Portfolio Address: ${chalk_1.default.cyan(portfolioAddress.toBase58())}`));
        console.log('');
        // Main balance box
        const equity = BigInt(portfolio.equity.toString());
        const pnl = BigInt(portfolio.pnl.toString());
        const principal = equity - pnl;
        const equityFormatted = (0, display_1.formatSolWithSuffix)(equity);
        const principalFormatted = (0, display_1.formatSolWithSuffix)(principal);
        const pnlFormatted = (0, display_1.formatPnl)(pnl);
        const balanceBox = (0, boxen_1.default)(chalk_1.default.bold.white(`Equity: ${chalk_1.default.green(equityFormatted)}\n`) +
            chalk_1.default.gray(`Principal: ${principalFormatted}  |  Realized PnL: ${pnlFormatted}`), {
            padding: { left: 2, right: 2, top: 0, bottom: 0 },
            margin: { top: 0, bottom: 1, left: 0, right: 0 },
            borderStyle: 'round',
            borderColor: 'cyan',
            title: '💰 DLP Balance',
            titleAlignment: 'left'
        });
        console.log(balanceBox);
        // Warning if PnL is negative (traders are winning)
        if (pnl < 0n) {
            const warningBox = (0, boxen_1.default)(chalk_1.default.yellow('Negative PnL - Traders are currently winning\n') +
                chalk_1.default.gray('This is normal variance, but monitor your risk exposure.'), {
                padding: { left: 2, right: 2, top: 0, bottom: 0 },
                margin: { top: 0, bottom: 1, left: 0, right: 0 },
                borderStyle: 'round',
                borderColor: 'yellow',
                title: '⚠️  Warning',
                titleAlignment: 'left'
            });
            console.log(warningBox);
        }
        // Exposure summary (if detailed flag)
        if (options.detailed) {
            const exposureBox = (0, boxen_1.default)(chalk_1.default.white('Model: DLP Counterparty (v0.5)\n') +
                chalk_1.default.gray('Role: Sole liquidity provider for all trades\n') +
                chalk_1.default.gray('Exposure: Direct counterparty to all open positions'), {
                padding: { left: 2, right: 2, top: 0, bottom: 0 },
                margin: { top: 0, bottom: 1, left: 0, right: 0 },
                borderStyle: 'round',
                borderColor: 'magenta',
                title: '📊 Exposure Details',
                titleAlignment: 'left'
            });
            console.log(exposureBox);
            // Account info
            const accountBox = (0, boxen_1.default)(chalk_1.default.gray(`Owner: ${wallet.publicKey.toBase58()}\n`) +
                chalk_1.default.gray(`Portfolio: ${portfolioAddress.toBase58()}`), {
                padding: { left: 2, right: 2, top: 0, bottom: 0 },
                margin: { top: 0, bottom: 1, left: 0, right: 0 },
                borderStyle: 'round',
                borderColor: 'gray',
                title: 'ℹ️  Account Information',
                titleAlignment: 'left'
            });
            console.log(accountBox);
        }
        // Quick tips
        console.log(chalk_1.default.gray('💡 Tips:'));
        console.log(chalk_1.default.gray('  • Use --detailed for more information'));
        console.log(chalk_1.default.gray('  • Create slabs: barista-dlp slab-create'));
        console.log(chalk_1.default.gray('  • View slab: barista-dlp slab-view --address <SLAB>'));
        console.log();
    }
    catch (error) {
        spinner.fail();
        (0, display_1.displayError)(`Failed to fetch portfolio: ${error}`);
        process.exit(1);
    }
}
//# sourceMappingURL=view.js.map