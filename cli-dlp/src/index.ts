#!/usr/bin/env node

import { Command } from 'commander';
import { viewCommand } from './commands/portfolio/view';
import { initCommand } from './commands/portfolio/init';
import { depositCommand } from './commands/portfolio/deposit';
import { withdrawCommand } from './commands/portfolio/withdraw';
import { createSlabCommand } from './commands/slab/create';
import { viewSlabCommand } from './commands/slab/view';
import { initOracleCommand } from './commands/oracle/init';
import { viewOracleCommand } from './commands/oracle/view';
import { updateOracleCommand } from './commands/oracle/update';
import chalk from 'chalk';

const program = new Command();

program
  .name('barista-dlp')
  .description('Barista DEX CLI for Liquidity Providers (DLPs)')
  .version('0.1.0');

// Global options
program
  .option('--keypair <path>', 'Path to DLP wallet keypair', process.env.BARISTA_DLP_KEYPAIR)
  .option(
    '--network <network>',
    'Network to use (localnet/devnet/mainnet-beta)',
    process.env.BARISTA_DLP_NETWORK || 'localnet'
  )
  .option('--url <url>', 'Custom RPC URL', process.env.BARISTA_DLP_RPC_URL);

// Portfolio commands
program
  .command('portfolio')
  .description('View DLP portfolio details')
  .option('--detailed', 'Show detailed per-slab exposure breakdown')
  .action(viewCommand);

program
  .command('portfolio:init')
  .description('Initialize a new DLP portfolio')
  .action(initCommand);

program
  .command('deposit')
  .description('Deposit SOL capital to portfolio')
  .requiredOption('--amount <lamports>', 'Amount in lamports to deposit')
  .action(depositCommand);

program
  .command('withdraw')
  .description('Withdraw SOL from portfolio')
  .requiredOption('--amount <lamports>', 'Amount in lamports to withdraw')
  .option('--force', 'Skip safety checks (dangerous!)')
  .action(withdrawCommand);

// Slab commands
program
  .command('slab:create')
  .description('Create a new slab')
  .option('--instrument <address>', 'Instrument (perp market) address')
  .option('--mark-price <price>', 'Mark price in USD (e.g., 100.50)')
  .option('--taker-fee <bps>', 'Taker fee in basis points (e.g., 10)')
  .option('--contract-size <size>', 'Contract size (e.g., 1.0)')
  .option('--yes', 'Skip confirmation prompts')
  .action(createSlabCommand);

program
  .command('slab:view')
  .description('View slab details')
  .requiredOption('--address <pubkey>', 'Slab address')
  .option('--detailed', 'Show detailed information')
  .action(viewSlabCommand);

// Oracle commands
program
  .command('oracle:init')
  .description('Initialize a new price oracle')
  .option('--instrument <address>', 'Instrument address')
  .option('--initial-price <price>', 'Initial price in USD (e.g., 50000.00)')
  .option('--oracle-program <address>', 'Oracle program ID')
  .option('--yes', 'Skip confirmation prompts')
  .action(initOracleCommand);

program
  .command('oracle:view')
  .description('View oracle details')
  .requiredOption('--address <pubkey>', 'Oracle address')
  .action(viewOracleCommand);

program
  .command('oracle:update')
  .description('Update oracle price')
  .requiredOption('--address <pubkey>', 'Oracle address')
  .option('--price <price>', 'New price in USD (e.g., 51000.00)')
  .option('--confidence <amount>', 'Confidence interval in USD (e.g., 100.00)')
  .option('--oracle-program <address>', 'Oracle program ID')
  .option('--yes', 'Skip confirmation prompts')
  .action(updateOracleCommand);

// Add welcome message for no args
if (process.argv.length === 2) {
  console.log(chalk.bold('\n🏪 Barista DEX - DLP CLI\n'));
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
  console.log('  oracle:init      Initialize price oracle');
  console.log('  oracle:view      View oracle details');
  console.log('  oracle:update    Update oracle price');
  console.log('\nFor help:');
  console.log('  barista-dlp --help');
  console.log('  barista-dlp <command> --help\n');
  process.exit(0);
}

program.parse(process.argv);
