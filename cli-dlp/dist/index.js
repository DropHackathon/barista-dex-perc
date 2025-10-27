#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const view_1 = require("./commands/portfolio/view");
const init_1 = require("./commands/portfolio/init");
const deposit_1 = require("./commands/portfolio/deposit");
const withdraw_1 = require("./commands/portfolio/withdraw");
const create_1 = require("./commands/slab/create");
const view_2 = require("./commands/slab/view");
const chalk_1 = __importDefault(require("chalk"));
const fs_1 = require("fs");
const path_1 = require("path");
// Read version from package.json
const packageJson = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(__dirname, '../package.json'), 'utf-8'));
const program = new commander_1.Command();
program
    .name('barista-dlp')
    .description('Barista DEX CLI for Liquidity Providers (DLPs)')
    .version(packageJson.version);
// Global options
program
    .option('--keypair <path>', 'Path to DLP wallet keypair', process.env.BARISTA_DLP_KEYPAIR)
    .option('--network <network>', 'Network to use (localnet/devnet/mainnet-beta)', process.env.BARISTA_DLP_NETWORK || 'localnet')
    .option('--url <url>', 'Custom RPC URL', process.env.BARISTA_DLP_RPC_URL);
// Portfolio commands
program
    .command('portfolio')
    .description('View DLP portfolio details')
    .option('--keypair <path>', 'Path to DLP wallet keypair', process.env.BARISTA_DLP_KEYPAIR)
    .option('--network <network>', 'Network to use', process.env.BARISTA_DLP_NETWORK || 'localnet')
    .option('--url <url>', 'Custom RPC URL', process.env.BARISTA_DLP_RPC_URL)
    .option('--detailed', 'Show detailed per-slab exposure breakdown')
    .action(view_1.viewCommand);
program
    .command('portfolio:init')
    .description('Initialize a new DLP portfolio')
    .option('--keypair <path>', 'Path to DLP wallet keypair', process.env.BARISTA_DLP_KEYPAIR)
    .option('--network <network>', 'Network to use', process.env.BARISTA_DLP_NETWORK || 'localnet')
    .option('--url <url>', 'Custom RPC URL', process.env.BARISTA_DLP_RPC_URL)
    .action(init_1.initCommand);
program
    .command('deposit')
    .description('Deposit SOL capital to portfolio')
    .requiredOption('--amount <lamports>', 'Amount in lamports to deposit')
    .option('--keypair <path>', 'Path to DLP wallet keypair', process.env.BARISTA_DLP_KEYPAIR)
    .option('--network <network>', 'Network to use', process.env.BARISTA_DLP_NETWORK || 'localnet')
    .option('--url <url>', 'Custom RPC URL', process.env.BARISTA_DLP_RPC_URL)
    .action(deposit_1.depositCommand);
program
    .command('withdraw')
    .description('Withdraw SOL from portfolio')
    .requiredOption('--amount <lamports>', 'Amount in lamports to withdraw')
    .option('--keypair <path>', 'Path to DLP wallet keypair', process.env.BARISTA_DLP_KEYPAIR)
    .option('--network <network>', 'Network to use', process.env.BARISTA_DLP_NETWORK || 'localnet')
    .option('--url <url>', 'Custom RPC URL', process.env.BARISTA_DLP_RPC_URL)
    .option('--force', 'Skip safety checks (dangerous!)')
    .action(withdraw_1.withdrawCommand);
// Slab commands
program
    .command('slab:create')
    .description('Create a new slab')
    .option('--instrument <address>', 'Instrument (perp market) address')
    .option('--mark-price <price>', 'Mark price in USD (e.g., 100.50)')
    .option('--taker-fee <bps>', 'Taker fee in basis points (e.g., 10)')
    .option('--contract-size <size>', 'Contract size (e.g., 1.0)')
    .option('--keypair <path>', 'Path to DLP wallet keypair', process.env.BARISTA_DLP_KEYPAIR)
    .option('--network <network>', 'Network to use', process.env.BARISTA_DLP_NETWORK || 'localnet')
    .option('--url <url>', 'Custom RPC URL', process.env.BARISTA_DLP_RPC_URL)
    .option('--yes', 'Skip confirmation prompts')
    .action(create_1.createSlabCommand);
program
    .command('slab:view')
    .description('View slab details')
    .requiredOption('--address <pubkey>', 'Slab address')
    .option('--keypair <path>', 'Path to DLP wallet keypair', process.env.BARISTA_DLP_KEYPAIR)
    .option('--network <network>', 'Network to use', process.env.BARISTA_DLP_NETWORK || 'localnet')
    .option('--url <url>', 'Custom RPC URL', process.env.BARISTA_DLP_RPC_URL)
    .option('--detailed', 'Show detailed information')
    .action(view_2.viewSlabCommand);
// Add welcome message for no args
if (process.argv.length === 2) {
    console.log(chalk_1.default.bold('\n🏪 Barista DEX - DLP CLI\n'));
    console.log('Manage your liquidity provider operations on Barista DEX\n');
    console.log('Usage:');
    console.log('  barista-dlp <command> [options]\n');
    console.log('Available commands:');
    console.log('  portfolio:init   Initialize new portfolio');
    console.log('  portfolio        View portfolio details');
    console.log('  deposit          Deposit SOL capital');
    console.log('  withdraw         Withdraw SOL');
    console.log('  slab:create      Create a new slab');
    console.log('  slab:view        View slab details');
    console.log('\nFor oracle management, use percolator-keeper:');
    console.log('  percolator-keeper oracle init --instrument BTC-PERP --price 50000');
    console.log('  percolator-keeper oracle crank --oracle <address> --interval 5');
    console.log('\nFor help:');
    console.log('  barista-dlp --help');
    console.log('  barista-dlp <command> --help\n');
    process.exit(0);
}
program.parse(process.argv);
//# sourceMappingURL=index.js.map