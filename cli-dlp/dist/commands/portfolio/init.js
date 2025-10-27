"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCommand = initCommand;
const web3_js_1 = require("@solana/web3.js");
const sdk_1 = require("@barista-dex/sdk");
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const wallet_1 = require("../../utils/wallet");
const network_1 = require("../../utils/network");
const display_1 = require("../../utils/display");
async function initCommand(options) {
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
        // Check if portfolio already exists
        spinner.text = 'Checking for existing portfolio...';
        const [portfolioPDA] = client.derivePortfolioPDA(wallet.publicKey);
        const portfolioInfo = await connection.getAccountInfo(portfolioPDA);
        if (portfolioInfo) {
            spinner.succeed();
            (0, display_1.displayInfo)('Portfolio already exists!');
            console.log(chalk_1.default.gray(`  Address: ${portfolioPDA.toBase58()}`));
            console.log();
            console.log(chalk_1.default.blue('ℹ'), 'View portfolio with:', chalk_1.default.cyan('barista-dlp portfolio'));
            process.exit(0);
        }
        // Build initialization transaction
        spinner.text = 'Building initialization transaction...';
        const ensurePortfolioIxs = await client.ensurePortfolioInstructions(wallet.publicKey);
        if (ensurePortfolioIxs.length === 0) {
            spinner.fail();
            (0, display_1.displayError)('Failed to generate portfolio initialization instructions');
            process.exit(1);
        }
        const tx = new web3_js_1.Transaction().add(...ensurePortfolioIxs);
        // Send transaction
        spinner.text = 'Sending transaction...';
        const signature = await connection.sendTransaction(tx, [wallet], {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
        });
        spinner.text = 'Confirming transaction...';
        await connection.confirmTransaction(signature, 'confirmed');
        spinner.succeed();
        // Display success
        console.log();
        (0, display_1.displaySuccess)('Portfolio initialized successfully!');
        console.log(chalk_1.default.gray(`  Address: ${portfolioPDA.toBase58()}`));
        console.log(chalk_1.default.gray(`  Signature: ${signature}`));
        console.log();
        // Next steps
        console.log(chalk_1.default.bold('Next Steps:'));
        console.log(chalk_1.default.cyan('  1.'), 'Deposit capital:', chalk_1.default.gray('barista-dlp deposit --amount 100000000000'));
        console.log(chalk_1.default.cyan('  2.'), 'Create a slab:', chalk_1.default.gray('barista-dlp slab create --market SOL-PERP'));
        console.log(chalk_1.default.cyan('  3.'), 'View portfolio:', chalk_1.default.gray('barista-dlp portfolio'));
        console.log();
    }
    catch (error) {
        spinner.fail();
        (0, display_1.displayError)(`Portfolio initialization failed: ${error}`);
        process.exit(1);
    }
}
//# sourceMappingURL=init.js.map