"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawCommand = withdrawCommand;
const web3_js_1 = require("@solana/web3.js");
const sdk_1 = require("@barista-dex/sdk");
const bn_js_1 = __importDefault(require("bn.js"));
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const inquirer_1 = __importDefault(require("inquirer"));
const wallet_1 = require("../../utils/wallet");
const network_1 = require("../../utils/network");
const display_1 = require("../../utils/display");
const safety_1 = require("../../utils/safety");
async function withdrawCommand(options) {
    const spinner = (0, ora_1.default)('Initializing...').start();
    try {
        // Validate amount
        const amount = new bn_js_1.default(options.amount);
        if (amount.lte(new bn_js_1.default(0))) {
            spinner.fail();
            (0, display_1.displayError)('Amount must be greater than 0');
            process.exit(1);
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
        // Get portfolio
        spinner.text = 'Fetching portfolio...';
        const portfolio = await client.getPortfolio(wallet.publicKey);
        if (!portfolio) {
            spinner.fail();
            (0, display_1.displayError)('Portfolio not found. Create one with: barista-dlp deposit');
            process.exit(1);
        }
        // Safety checks
        if (!options.force) {
            spinner.text = 'Running safety checks...';
            const safetyCheck = (0, safety_1.checkWithdrawalSafety)(portfolio, amount);
            if (!safetyCheck.safe || safetyCheck.warnings.length > 0) {
                spinner.stop();
                console.log();
                (0, safety_1.displaySafetyResults)(safetyCheck);
                if (!safetyCheck.safe) {
                    console.log();
                    (0, display_1.displayError)('Withdrawal blocked by safety checks');
                    console.log(chalk_1.default.gray('  Override with --force (not recommended)'));
                    process.exit(1);
                }
                // Warnings only - prompt for confirmation
                if (safetyCheck.warnings.length > 0) {
                    console.log();
                    const { confirmed } = await inquirer_1.default.prompt([
                        {
                            type: 'confirm',
                            name: 'confirmed',
                            message: 'Proceed with withdrawal despite warnings?',
                            default: false,
                        },
                    ]);
                    if (!confirmed) {
                        (0, display_1.displayInfo)('Withdrawal cancelled');
                        process.exit(0);
                    }
                    spinner.start('Proceeding with withdrawal...');
                }
            }
        }
        // Build transaction
        spinner.text = 'Building withdrawal transaction...';
        const withdrawIx = await client.buildWithdrawInstruction(amount, wallet.publicKey);
        const tx = new web3_js_1.Transaction().add(withdrawIx);
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
        (0, display_1.displaySuccess)(`Withdrew ${(0, display_1.formatSolWithSuffix)(amount)} from portfolio!`);
        console.log(chalk_1.default.gray(`  Signature: ${signature}`));
        // Show remaining balance
        const equity = new bn_js_1.default(portfolio.equity.toString());
        const remaining = equity.sub(amount);
        console.log();
        console.log(chalk_1.default.blue('ℹ'), `Remaining balance: ${(0, display_1.formatSolWithSuffix)(remaining)}`);
    }
    catch (error) {
        spinner.fail();
        (0, display_1.displayError)(`Withdrawal failed: ${error}`);
        process.exit(1);
    }
}
//# sourceMappingURL=withdraw.js.map