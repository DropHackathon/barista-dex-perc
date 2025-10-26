# Changelog

All notable changes to `@barista-dex/cli-dlp` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-10-26

### Added
- **Slab Management Commands**
  - `slab:create` - Create new slab with interactive parameter collection
  - `slab:view` - View slab details with optional detailed mode
- Interactive prompts for slab creation (instrument, mark price, taker fee, contract size)
- Slab ownership detection in view command
- Best prices and instruments display in detailed view mode
- Comprehensive test suite for slab commands
- PDA derivation and existence checking for slabs

### Changed
- Updated version to 0.2.0
- Enhanced README with slab command documentation
- Updated implementation summary to reflect Phase 2 completion

### Technical
- Uses `SlabClient.buildInitializeSlabInstruction()` for slab creation
- Uses `SlabClient.getSlabState()`, `getBestPrices()`, `getInstruments()` for viewing
- Proper error handling for invalid addresses and non-existent slabs
- Input validation for all slab parameters

## [0.1.0] - 2025-10-26

### Added
- **Initial Release**
- **Portfolio Management Commands**
  - `portfolio:init` - Initialize new DLP portfolio account
  - `portfolio` - View portfolio details with capital summary
  - `deposit` - Deposit SOL capital with auto-initialization
  - `withdraw` - Withdraw SOL with comprehensive safety checks
- **Safety Features**
  - Deposit validation and warnings
  - Withdrawal safety checks (balance, open positions, PnL, utilization)
  - Interactive confirmation prompts
  - Force override flag for advanced users
- **User Experience**
  - Beautiful CLI with colors (Chalk), spinners (Ora), and tables (cli-table3)
  - Interactive prompts (Inquirer) for confirmations
  - Environment variable support (BARISTA_DLP_KEYPAIR, BARISTA_DLP_NETWORK, BARISTA_DLP_RPC_URL)
  - Global options (--keypair, --network, --url)
  - Detailed help and version commands
- **Testing Infrastructure**
  - Comprehensive unit tests (wallet, network, display, safety)
  - Integration tests for portfolio commands
  - E2E test framework
  - Jest configuration with 70% coverage threshold
  - Test documentation (TESTING.md)
- **Documentation**
  - Complete README with usage examples
  - Implementation summary
  - Troubleshooting guide
  - Architecture overview

### Technical
- TypeScript-based CLI using Commander.js framework
- SDK integration (@barista-dex/sdk)
- Support for localnet, devnet, and mainnet-beta networks
- Proper error handling and user-friendly messages
- Build system with TypeScript compiler
- ESLint for code quality

## [Unreleased]

### Planned
- `slab:update` - Update slab parameters (fees, limits)
- `slab:pause` - Pause trading on a slab
- `slab:resume` - Resume trading on a paused slab
- `analytics:exposure` - View PnL exposure across slabs
- `analytics:stats` - Performance metrics (volume, fees, APY)
- `analytics:trades` - Recent trade history
- Oracle management commands
- Batch operations support
- Historical PnL tracking

---

[0.2.0]: https://github.com/barista-dex/barista-dex/releases/tag/cli-dlp-v0.2.0
[0.1.0]: https://github.com/barista-dex/barista-dex/releases/tag/cli-dlp-v0.1.0
