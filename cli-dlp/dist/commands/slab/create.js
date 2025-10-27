"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSlabCommand = createSlabCommand;
const web3_js_1 = require("@solana/web3.js");
const sdk_1 = require("@barista-dex/sdk");
const bn_js_1 = __importDefault(require("bn.js"));
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const inquirer_1 = __importDefault(require("inquirer"));
const wallet_1 = require("../../utils/wallet");
const network_1 = require("../../utils/network");
const display_1 = require("../../utils/display");
async function createSlabCommand(options) {
    const spinner = (0, ora_1.default)('Initializing...').start();
    try {
        // Debug: log options
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
        const { routerProgramId, slabProgramId } = (0, network_1.getNetworkConfig)(network, options.url);
        spinner.text = 'Connecting to Solana...';
        // Create clients
        const routerClient = new sdk_1.RouterClient(connection, routerProgramId, wallet);
        const slabClient = new sdk_1.SlabClient(connection, slabProgramId, wallet);
        // Check portfolio exists
        spinner.text = 'Checking portfolio...';
        const portfolio = await routerClient.getPortfolio(wallet.publicKey);
        if (!portfolio) {
            spinner.fail();
            (0, display_1.displayError)('Portfolio not found. Create one with: barista-dlp deposit');
            process.exit(1);
        }
        spinner.stop();
        // Interactive parameter collection
        let instrumentAddr;
        let markPrice;
        let takerFee;
        let contractSize;
        console.log();
        if (!options.instrument) {
            const { instrumentInput } = await inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'instrumentInput',
                    message: 'Instrument address (perp market):',
                    validate: (input) => {
                        try {
                            new web3_js_1.PublicKey(input);
                            return true;
                        }
                        catch (e) {
                            return 'Invalid public key';
                        }
                    },
                },
            ]);
            instrumentAddr = new web3_js_1.PublicKey(instrumentInput);
        }
        else {
            instrumentAddr = new web3_js_1.PublicKey(options.instrument);
        }
        if (!options.markPrice) {
            const { markPriceInput } = await inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'markPriceInput',
                    message: 'Mark price (USD, e.g., 100.50):',
                    default: '100.00',
                    validate: (input) => {
                        const price = parseFloat(input);
                        return !isNaN(price) && price > 0 ? true : 'Invalid price';
                    },
                },
            ]);
            markPrice = new bn_js_1.default(parseFloat(markPriceInput) * 1000000);
        }
        else {
            markPrice = new bn_js_1.default(parseFloat(options.markPrice) * 1000000);
        }
        if (!options.takerFee) {
            const { takerFeeInput } = await inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'takerFeeInput',
                    message: 'Taker fee (bps, e.g., 10 = 0.1%):',
                    default: '10',
                    validate: (input) => {
                        const fee = parseInt(input);
                        return !isNaN(fee) && fee >= 0 ? true : 'Invalid fee';
                    },
                },
            ]);
            takerFee = new bn_js_1.default(parseInt(takerFeeInput) * 100); // Convert bps to 1e6 scale
        }
        else {
            takerFee = new bn_js_1.default(parseInt(options.takerFee) * 100);
        }
        if (!options.contractSize) {
            const { contractSizeInput } = await inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'contractSizeInput',
                    message: 'Contract size (e.g., 1.0):',
                    default: '1.0',
                    validate: (input) => {
                        const size = parseFloat(input);
                        return !isNaN(size) && size > 0 ? true : 'Invalid size';
                    },
                },
            ]);
            contractSize = new bn_js_1.default(parseFloat(contractSizeInput) * 1000000);
        }
        else {
            contractSize = new bn_js_1.default(parseFloat(options.contractSize) * 1000000);
        }
        console.log();
        console.log(chalk_1.default.cyan('Creating new slab:'));
        console.log(chalk_1.default.gray(`  LP Owner (DLP): ${wallet.publicKey.toBase58()}`));
        console.log(chalk_1.default.gray(`  Instrument: ${instrumentAddr.toBase58()}`));
        console.log(chalk_1.default.gray(`  Mark Price: $${(Number(markPrice.toString()) / 1000000).toFixed(2)}`));
        console.log(chalk_1.default.gray(`  Taker Fee: ${(Number(takerFee.toString()) / 100).toFixed(2)} bps`));
        console.log(chalk_1.default.gray(`  Contract Size: ${(Number(contractSize.toString()) / 1000000).toFixed(6)}`));
        console.log(chalk_1.default.gray(`  Network: ${network}`));
        console.log();
        // Confirm if not --yes
        if (!options.yes) {
            const { confirmed } = await inquirer_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'confirmed',
                    message: 'Create slab with these settings?',
                    default: true,
                },
            ]);
            if (!confirmed) {
                (0, display_1.displayInfo)('Slab creation cancelled');
                process.exit(0);
            }
        }
        // Derive slab PDA
        spinner.start('Deriving slab address...');
        const [slabPDA, bump] = slabClient.deriveSlabPDA(wallet.publicKey, instrumentAddr);
        console.log(chalk_1.default.gray(`  Slab PDA: ${slabPDA.toBase58()}`));
        // Check if slab already exists
        spinner.text = 'Checking if slab already exists...';
        const existingSlab = await slabClient.getSlabState(slabPDA);
        if (existingSlab) {
            spinner.fail();
            (0, display_1.displayError)('Slab already exists for this LP Owner + Instrument combination');
            console.log(chalk_1.default.gray(`  Slab address: ${slabPDA.toBase58()}`));
            console.log();
            console.log(chalk_1.default.blue('ℹ'), 'View slab:', chalk_1.default.cyan(`barista-dlp slab:view --address ${slabPDA.toBase58()}`));
            process.exit(1);
        }
        // Build slab initialization transaction
        // Note: The slab program will create the PDA account if it doesn't exist
        spinner.text = 'Building slab initialization transaction...';
        const initSlabIx = slabClient.buildInitializeSlabInstruction(wallet.publicKey, // lpOwner
        routerProgramId, // routerId
        instrumentAddr, // instrument
        markPrice, // markPx
        takerFee, // takerFeeBps
        contractSize, // contractSize
        wallet.publicKey // payer
        );
        const tx = new web3_js_1.Transaction().add(initSlabIx);
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
        (0, display_1.displaySuccess)('Slab created successfully!');
        console.log(chalk_1.default.gray(`  Slab Address: ${slabPDA.toBase58()}`));
        console.log(chalk_1.default.gray(`  Signature: ${signature}`));
        console.log();
        // Next steps
        console.log(chalk_1.default.bold('Next Steps:'));
        console.log(chalk_1.default.cyan('  1.'), 'View slab:', chalk_1.default.gray(`barista-dlp slab:view --address ${slabPDA.toBase58()}`));
        console.log(chalk_1.default.cyan('  2.'), 'View portfolio:', chalk_1.default.gray('barista-dlp portfolio --detailed'));
        console.log();
        console.log(chalk_1.default.yellow('⚠'), 'Save this slab address! You\'ll need it to manage this slab');
        console.log(chalk_1.default.gray(`  ${slabPDA.toBase58()}`));
        console.log();
    }
    catch (error) {
        spinner.fail();
        (0, display_1.displayError)(`Slab creation failed: ${error}`);
        process.exit(1);
    }
}
//# sourceMappingURL=create.js.map