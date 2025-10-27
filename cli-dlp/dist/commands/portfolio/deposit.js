"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.depositCommand = depositCommand;
const web3_js_1 = require("@solana/web3.js");
const sdk_1 = require("@barista-dex/sdk");
const bn_js_1 = __importDefault(require("bn.js"));
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const wallet_1 = require("../../utils/wallet");
const network_1 = require("../../utils/network");
const display_1 = require("../../utils/display");
const safety_1 = require("../../utils/safety");
async function depositCommand(options) {
    const spinner = (0, ora_1.default)('Initializing...').start();
    try {
        // Validate amount
        const amount = new bn_js_1.default(options.amount);
        if (amount.lte(new bn_js_1.default(0))) {
            spinner.fail();
            (0, display_1.displayError)('Amount must be greater than 0');
            process.exit(1);
        }
        // Safety check
        const safetyCheck = (0, safety_1.checkDepositAmount)(amount);
        if (safetyCheck.warnings.length > 0) {
            spinner.stop();
            (0, safety_1.displaySafetyResults)(safetyCheck);
            console.log(); // Empty line
            spinner.start('Proceeding with deposit...');
        }
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
        // Check if portfolio exists
        spinner.text = 'Checking portfolio...';
        const portfolioAddress = await client.derivePortfolioAddress(wallet.publicKey);
        const portfolioInfo = await connection.getAccountInfo(portfolioAddress);
        const needsInit = !portfolioInfo;
        // Build transaction
        spinner.text = needsInit ? 'Creating portfolio and depositing...' : 'Building deposit transaction...';
        const tx = new web3_js_1.Transaction();
        // Add portfolio initialization if needed
        if (needsInit) {
            const ensurePortfolioIxs = await client.ensurePortfolioInstructions(wallet.publicKey);
            tx.add(...ensurePortfolioIxs);
        }
        // Add deposit instruction
        const depositIx = await client.buildDepositInstruction(amount, wallet.publicKey);
        tx.add(depositIx);
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
        (0, display_1.displaySuccess)(`Deposited ${(0, display_1.formatSolWithSuffix)(amount)} to portfolio!`);
        console.log(chalk_1.default.gray(`  Signature: ${signature}`));
        console.log(chalk_1.default.gray(`  Portfolio: ${portfolioAddress.toBase58()}`));
        if (needsInit) {
            console.log();
            console.log(chalk_1.default.blue('ℹ'), 'Portfolio created successfully (first-time setup)');
        }
        console.log();
        console.log('Next steps:');
        console.log('  1. View your portfolio: barista-dlp portfolio');
        console.log('  2. Create a slab: barista-dlp slab create (coming soon)');
    }
    catch (error) {
        spinner.fail();
        (0, display_1.displayError)(`Deposit failed: ${error}`);
        process.exit(1);
    }
}
//# sourceMappingURL=deposit.js.map