#!/usr/bin/env node

import { Command } from 'commander';
import { depositCommand } from './commands/router/deposit';
import { withdrawCommand } from './commands/router/withdraw';
import { portfolioCommand } from './commands/router/portfolio';
import { priceCommand as legacyPriceCommand } from './commands/market/price';
import { bookCommand } from './commands/market/book';
import { buyCommand } from './commands/trading/buy';
import { sellCommand } from './commands/trading/sell';
import { slabsCommand } from './commands/discovery/slabs';
import { slabInfoCommand } from './commands/discovery/slabInfo';
import { instrumentsCommand } from './commands/discovery/instruments';
import { priceCommand } from './commands/discovery/price';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('barista')
  .description('Command-line interface for Barista DEX - Trader CLI (v0)')
  .version(packageJson.version)
  .addHelpText('after', `
v0 Limitations:
  • Market orders only - executes instantly at oracle price (±0.5% slippage)
  • Limit orders execute instantly (NOT resting orders) - price validation only
  • Single slab execution - must specify --slab (v1+: cross-slab smart routing)
  • Single instrument per slab currently (v1+: up to 32 instruments per slab)
  • Atomic fills - no partial fills or order book
  • SOL collateral only (v1+: multi-collateral support)
  • PnL settles against single LP/DLP vault per slab (v1+: order book settlement)

Oracle Integration:
  • All trades validated against oracle prices
  • Oracles auto-fetched from SlabRegistry (no manual oracle parameters needed)
  • Market orders execute at live oracle price
  • Limit orders sanity-checked within ±20% of oracle (instant fill)

Examples:
  $ barista buy --slab <SLAB_ID> -q 1000              # Market order at oracle price
  $ barista sell --slab <SLAB_ID> -q 500 -l 5x        # Margin sell with 5x leverage
  $ barista portfolio                                  # View positions and health
  $ barista deposit -a 1000000000                      # Deposit 1 SOL
`);

// ============================================================
// Portfolio Commands
// ============================================================

program
  .command('portfolio')
  .description('View portfolio state')
  .option('-a, --address <address>', 'User address (defaults to keypair pubkey)')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .action(portfolioCommand);

program
  .command('deposit')
  .description('Deposit SOL to portfolio (SOL only for v0)')
  .requiredOption('-a, --amount <lamports>', 'Amount to deposit in lamports (1 SOL = 1000000000 lamports)')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'Custom RPC URL')
  .action(depositCommand);

program
  .command('withdraw')
  .description('Withdraw SOL from portfolio (SOL only for v0)')
  .requiredOption('-a, --amount <lamports>', 'Amount to withdraw in lamports (1 SOL = 1000000000 lamports)')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'Custom RPC URL')
  .action(withdrawCommand);

// ============================================================
// Trading Commands (v0 - Atomic Fills)
// ============================================================

program
  .command('buy')
  .description('Execute a buy order on a specific slab (v0: single slab only)')
  .requiredOption('--slab <address>', 'Slab market address (required in v0)')
  .option('--instrument <pubkey>', 'Instrument pubkey (optional, for v1+ multi-instrument slabs)')
  .requiredOption('-q, --quantity <amount>', 'Margin to commit (in base units). With leverage, actual position = quantity × leverage')
  .option('-p, --price <price>', 'Limit price (optional, omit for market order)')
  .option('-l, --leverage <multiplier>', 'Leverage multiplier (e.g., "5x", "10x"). Default: 1x (spot trading)')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .action(buyCommand);

program
  .command('sell')
  .description('Execute a sell order on a specific slab (v0: single slab only)')
  .requiredOption('--slab <address>', 'Slab market address (required in v0)')
  .option('--instrument <pubkey>', 'Instrument pubkey (optional, for v1+ multi-instrument slabs)')
  .requiredOption('-q, --quantity <amount>', 'Margin to commit (in base units). With leverage, actual position = quantity × leverage')
  .option('-p, --price <price>', 'Limit price (optional, omit for market order)')
  .option('-l, --leverage <multiplier>', 'Leverage multiplier (e.g., "5x", "10x"). Default: 1x (spot trading)')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .action(sellCommand);

// ============================================================
// Discovery Commands
// ============================================================

program
  .command('slabs')
  .description('List all available LP-run slabs')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .action(slabsCommand);

program
  .command('slab')
  .description('Show detailed information about a slab')
  .requiredOption('--slab <address>', 'Slab address')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .action(slabInfoCommand);

program
  .command('instruments')
  .description('List instruments (markets) in a slab (v0: returns 1, future: up to 32)')
  .requiredOption('--slab <address>', 'Slab address')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .action(instrumentsCommand);

// ============================================================
// Market Data Commands
// ============================================================

program
  .command('price')
  .description('Get current price (market or oracle)')
  .option('--slab <address>', 'Slab address (for market price)')
  .option('--oracle <address>', 'Oracle/Pyth feed address (for oracle price)')
  .option('--instrument <address>', 'Instrument address (derives custom oracle - localnet only)')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .addHelpText('after', `
Examples:
  # Market price (order book bid/ask - future)
  $ barista price --slab <SLAB_ADDRESS>

  # Pyth oracle price (mainnet/devnet)
  $ barista price --oracle <PYTH_FEED_ADDRESS>

  # Custom oracle price (localnet testing)
  $ barista price --instrument <INSTRUMENT_ADDRESS>
  $ barista price --oracle <CUSTOM_ORACLE_ADDRESS>

Notes:
  • Mainnet/devnet: Use Pyth price feeds with --oracle
  • Localnet: Use custom oracle for testing with --instrument or --oracle
  • Future versions will use order book prices (--slab)
`)
  .action(priceCommand);

program
  .command('book')
  .description('View order book depth (v0: stub - no persistent orders)')
  .requiredOption('--slab <address>', 'Slab address')
  .option('-l, --levels <number>', 'Number of price levels to display (default: 10)')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .action(bookCommand);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
