# Barista DEX - Project Development History

**Author**: Sean
**Period**: Initial commit through current (54 commits)
**Focus**: TypeScript SDK, CLI, Oracle Integration, and Leverage Trading

---

## Table of Contents

1. [Phase 1: TypeScript SDK Foundation](#phase-1-typescript-sdk-foundation)
2. [Phase 2: CLI Development](#phase-2-cli-development)
3. [Phase 3: Network & Discovery](#phase-3-network--discovery)
4. [Phase 4: Oracle Integration](#phase-4-oracle-integration)
5. [Phase 5: Leverage Trading](#phase-5-leverage-trading)
6. [Phase 6: PnL Settlement (v0.5)](#phase-6-pnl-settlement-v05)
7. [Summary Statistics](#summary-statistics)

---

## Phase 1: TypeScript SDK Foundation

### Commits: `ee9b7c7` → `e60778b`

**Goal**: Build production-ready TypeScript SDK for Barista DEX

### Initial SDK Implementation (`ee9b7c7`)

**Files Added** (14 files, 2,501 lines):
- `sdk/src/clients/RouterClient.ts` - 527 lines
- `sdk/src/clients/SlabClient.ts` - 362 lines
- `sdk/src/types/router.ts` - 103 lines
- `sdk/src/types/slab.ts` - 91 lines
- `sdk/src/utils/serialization.ts` - 116 lines
- `sdk/src/utils/formatting.ts` - 75 lines
- Test files for all clients and utils

**Key Features**:

#### RouterClient (Portfolio & Cross-Margin)
```typescript
class RouterClient {
  // PDA Derivation
  derivePortfolioPDA(user: PublicKey): [PublicKey, number]
  deriveVaultPDA(mint: PublicKey): [PublicKey, number]
  deriveRegistryPDA(): [PublicKey, number]

  // Account Fetching
  getPortfolio(portfolioPDA: PublicKey): Promise<Portfolio | null>
  getVault(vaultPDA: PublicKey): Promise<Vault | null>

  // Instruction Builders
  buildInitializeInstruction(payer: PublicKey)
  buildDepositInstruction(mint, amount, user, userTokenAccount)
  buildWithdrawInstruction(mint, amount, user, userTokenAccount)
  buildExecuteCrossSlabInstruction(user, splits[], slabProgram)
  buildLiquidateUserInstruction(params)
}
```

#### SlabClient (Order Book & LP Management)
```typescript
class SlabClient {
  // PDA Derivation
  deriveSlabPDA(lpOwner, instrument): [PublicKey, number]
  deriveFillReceiptPDA(slab, seqno): [PublicKey, number]

  // Account Fetching
  getSlabState(slab): Promise<SlabState | null>
  getFillReceipt(slab, seqno): Promise<FillReceipt | null>

  // Instruction Builders
  buildInitializeSlabInstruction(lpOwner, instrument, params)
  buildUpdateSlabInstruction(slab, params)
  buildPlaceOrderInstruction(params)
  buildCancelOrderInstruction(params)
}
```

**Test Coverage**:
- 266 lines of RouterClient tests
- 252 lines of SlabClient tests
- 171 lines of formatting tests
- 169 lines of serialization tests
- **Total: 858 lines of test code**

### Documentation Enhancement (`b1c025b`)

**Changes**: 655 additions, 161 deletions to README.md

**Added Sections**:
1. **Installation & Quick Start**
   - npm install instructions
   - Basic example code
   - Environment setup

2. **Core Concepts**
   - Cross-margin portfolio system
   - Slab-based atomic fills
   - PDA architecture

3. **API Reference**
   - Complete method documentation
   - Parameter descriptions
   - Return type specifications

4. **Production Examples**
   ```typescript
   // Portfolio Management Example
   const client = new RouterClient(connection, programId, wallet);
   const [portfolioPDA] = client.derivePortfolioPDA(user);
   const portfolio = await client.getPortfolio(portfolioPDA);

   // Trading Example
   const splits = [{
     slabMarket,
     isBuy: true,
     size: new BN(1000000),
     price: new BN(50000000)
   }];
   const ix = client.buildExecuteCrossSlabInstruction(user, splits, slabProgram);
   ```

5. **Error Handling Patterns**
6. **Testing Guide**

### Package Configuration (`e60778b`)

**Files Added**:
- `sdk/package.json` - 52 lines
- `sdk/tsconfig.json` - 18 lines
- `sdk/package-lock.json` - 5,516 lines

**Key Configuration**:
```json
{
  "name": "@barista-dex/sdk",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@solana/web3.js": "^1.87.6",
    "bn.js": "^5.2.1"
  }
}
```

---

## Phase 2: CLI Development

### Commits: `1cb6578` → `14ffa03`

**Goal**: Build trader-focused command-line interface

### Initial CLI Package (`1cb6578`)

**Files Added** (17 files, 1,111 lines):

**Command Structure**:
```
barista/
├── portfolio              # View portfolio state
├── deposit               # Deposit collateral
├── withdraw              # Withdraw collateral (planned)
├── price                 # Get market price
├── book                  # View order book (planned)
├── init                  # Initialize router (planned)
└── trade                 # Execute trades (planned)
```

**Implementation Highlights**:

#### Portfolio Command
```typescript
// cli/src/commands/router/portfolio.ts (78 lines)
export async function portfolioCommand(options: PortfolioOptions) {
  const client = new RouterClient(connection, programId, wallet);
  const [portfolioPDA] = client.derivePortfolioPDA(userAddress);
  const portfolio = await client.getPortfolio(portfolioPDA);

  // Display formatted portfolio data
  displayPortfolio(portfolio);
}
```

#### Deposit Command
```typescript
// cli/src/commands/router/deposit.ts (97 lines)
export async function depositCommand(options: DepositOptions) {
  const ix = client.buildDepositInstruction(
    mint, amount, user, userTokenAccount
  );
  const signature = await sendAndConfirmTransaction(connection, tx, [wallet]);
  displaySuccess(`Deposited ${amount} successfully`);
}
```

#### Price Command
```typescript
// cli/src/commands/market/price.ts (87 lines)
export async function priceCommand(options: PriceOptions) {
  const slabClient = new SlabClient(connection, slabProgramId);
  const state = await slabClient.getSlabState(slabMarket);

  console.log(`Mark Price: ${formatPrice(state.markPx)}`);
}
```

**Utilities**:

```typescript
// cli/src/utils/wallet.ts (71 lines)
export function loadKeypair(path: string): Keypair
export function getDefaultKeypairPath(): string

// cli/src/utils/display.ts (82 lines)
export function displaySuccess(message: string)
export function displayError(message: string)
export function displayPortfolio(portfolio: Portfolio)
```

**Test Suite**:
- Integration tests: 53 lines
- Display utility tests: 108 lines
- Wallet utility tests: 117 lines
- **Total: 278 lines of test code**

### CLI Expansion (`964b559`)

**Added Commands** (535 lines added):

1. **Book Command** (`cli/src/commands/market/book.ts` - 112 lines)
   - View order book depth
   - Display bid/ask levels
   - v0 stub (no persistent orders)

2. **Init Command** (`cli/src/commands/router/init.ts` - 75 lines)
   - Initialize router registry
   - Create authority PDA
   - Admin-only operation

3. **Withdraw Command** (`cli/src/commands/router/withdraw.ts` - 97 lines)
   - Withdraw collateral from vault
   - Validates available balance
   - Updates portfolio state

4. **Trade Command** (`cli/src/commands/router/trade.ts` - 122 lines)
   - Execute cross-slab atomic fills
   - Support buy/sell sides
   - v0 atomic execution only

**README Updates**: 130 lines → comprehensive command documentation

### CLI Refactoring (`14ffa03`)

**Simplified to 5 Core Trader Commands**:

**Removed** (276 lines deleted):
- `init` command - Admin-only, not trader-focused
- `trade` command - Too generic, replaced with specific buy/sell

**Final v0 CLI**:
```bash
barista portfolio    # View portfolio
barista deposit      # Add collateral
barista withdraw     # Remove collateral
barista price        # Get market price
barista book         # View order book
```

**Rationale**: Focus on essential trader operations for v0 launch

---

## Phase 3: Network & Discovery

### Commits: `bdd7921` → `8364c08`

**Goal**: Multi-network support and market discovery features

### Network Configuration (`bdd7921`)

**Files Added**:
- `sdk/src/constants.ts` (50 lines)

**Implementation**:
```typescript
export interface NetworkConfig {
  name: string;
  rpcUrl: string;
  routerProgramId: PublicKey;
  slabProgramId: PublicKey;
  commitment: Commitment;
}

export const NETWORKS = {
  'mainnet-beta': {
    name: 'Mainnet Beta',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    routerProgramId: new PublicKey('RouterProgramId'),
    slabProgramId: new PublicKey('SlabProgramId'),
    commitment: 'confirmed'
  },
  'devnet': { /* ... */ },
  'localnet': { /* ... */ }
};
```

### Environment Variables (`5157937`)

**Files Modified**: 8 files, 76 additions, 66 deletions

**Key Changes**:

```typescript
// cli/src/utils/wallet.ts
export function getDefaultKeypairPath(): string {
  return process.env.BARISTA_KEYPAIR_PATH ||
         path.join(os.homedir(), '.config/solana/id.json');
}

// Updated all commands to support:
// - BARISTA_NETWORK (mainnet-beta | devnet | localnet)
// - BARISTA_RPC_URL (override default)
// - BARISTA_KEYPAIR_PATH (custom wallet location)
```

**Commands Updated**:
- deposit, withdraw, portfolio - Network flag support
- price, book - Network flag support
- All commands now use `getNetworkConfig(network)` helper

### Testing (`15229c7`)

**Test Enhancements** (77 additions, 32 deletions):

```typescript
describe('Environment Variables', () => {
  it('should use BARISTA_KEYPAIR_PATH when set')
  it('should fall back to default path')
  it('should use BARISTA_NETWORK for network selection')
  it('should override with BARISTA_RPC_URL')
});
```

### Comprehensive Discovery (`8364c08`)

**Files Added** (962 lines):

#### 1. Network Configuration System
```typescript
// cli/src/config/networks.ts (83 lines)
export function getNetworkConfig(network?: string): NetworkConfig {
  const selectedNetwork =
    network ||
    process.env.BARISTA_NETWORK ||
    'mainnet-beta';

  const config = NETWORKS[selectedNetwork];

  // Override RPC if env var set
  if (process.env.BARISTA_RPC_URL) {
    config.rpcUrl = process.env.BARISTA_RPC_URL;
  }

  return config;
}
```

#### 2. Discovery Commands

**Slabs Command** (`cli/src/commands/discovery/slabs.ts` - 80 lines):
```bash
$ barista slabs --network devnet
# Lists all LP-run slabs on devnet
```

**Slab Info Command** (`cli/src/commands/discovery/slabInfo.ts` - 75 lines):
```bash
$ barista slab --slab <address>
# Shows detailed slab information
```

**Instruments Command** (`cli/src/commands/discovery/instruments.ts` - 86 lines):
```bash
$ barista instruments --slab <address>
# Lists instruments (markets) in a slab
# v0: returns 1, future: up to 32
```

**Price Discovery** (`cli/src/commands/discovery/price.ts` - 77 lines):
```bash
$ barista price --slab <address>
# Gets best bid/ask from slab
```

#### 3. Trading Commands

**Buy Command** (`cli/src/commands/trading/buy.ts` - 104 lines):
```bash
$ barista buy --slab <addr> -q 1000000 -p 50000000
# Execute atomic buy order
```

**Sell Command** (`cli/src/commands/trading/sell.ts` - 104 lines):
```bash
$ barista sell --slab <addr> -q 500000 -p 51000000
# Execute atomic sell order
```

#### 4. SDK Enhancements

**RouterClient Additions** (161 lines):
```typescript
// Slab Discovery
async getAllSlabs(slabProgramId: PublicKey): Promise<SlabInfo[]>
async getSlabsForInstrument(instrumentId: PublicKey): Promise<PublicKey[]>

// Helper Methods
buildBuyInstruction(user, slab, quantity, price, slabProgram)
buildSellInstruction(user, slab, quantity, price, slabProgram)
```

**SlabClient Additions** (65 lines):
```typescript
async getBestPrices(slabAddress: PublicKey): Promise<BestPrices>
async getInstruments(slabAddress: PublicKey): Promise<InstrumentInfo[]>
```

**New Types** (`sdk/src/types/discovery.ts` - 53 lines):
```typescript
interface SlabInfo {
  address: PublicKey;
  lpOwner: PublicKey;
  instrument: PublicKey;
  markPx: BN;
  takerFeeBps: BN;
  contractSize: BN;
  seqno: number;
}

interface BestPrices {
  bestBid: BN | null;
  bestAsk: BN | null;
  markPrice: BN;
  spread: BN | null;
}

interface InstrumentInfo {
  address: PublicKey;
  symbol: string;
  slabs: PublicKey[];
}
```

### TODO Markers (`3a5cb59`)

**Added development notes** (12 additions, 6 deletions):

```typescript
// cli/src/config/networks.ts
routerProgramId: new PublicKey('TODO_ROUTER_PROGRAM_ID')
slabProgramId: new PublicKey('TODO_SLAB_PROGRAM_ID')

// sdk/src/constants.ts
// TODO: Replace with actual deployed program IDs
// These are placeholders for development
```

---

## Phase 4: Oracle Integration

### Commits: `7f6b879` → `2df76a0`

**Goal**: Price feed infrastructure for localnet/devnet testing and production

### Oracle CLI Planning (`7f6b879`)

**Massive Addition**: 4,185 lines across 9 files

**Documentation**:

1. **Implementation Summary** (`thoughts/ORACLE_CLI_IMPLEMENTATION_SUMMARY.md` - 595 lines)
   - Architecture overview
   - Command specifications
   - Data structures
   - Error handling patterns

2. **Integration Plan** (`thoughts/ORACLE_INTEGRATION_PLAN.md` - 1,860 lines)
   - Phase 1: Custom oracle (localnet/devnet)
   - Phase 2: Pyth integration (devnet/mainnet)
   - Phase 3: Switchboard integration (optional)
   - Migration strategies

3. **Localnet/Devnet Guide** (`thoughts/ORACLE_LOCALNET_DEVNET_GUIDE.md` - 953 lines)
   - Complete setup instructions
   - Testing workflows
   - Troubleshooting guide

**TypeScript Implementation** (777 lines):

#### Commands

**Init Command** (`cli/src/commands/oracle/init.ts` - 133 lines):
```typescript
export async function oracleInitCommand(options: OracleInitOptions) {
  // Create oracle account
  // Set initial price
  // Initialize metadata
  // Return oracle address
}
```

**Show Command** (`cli/src/commands/oracle/show.ts` - 123 lines):
```typescript
export async function oracleShowCommand(options: OracleShowOptions) {
  // Fetch oracle account
  // Parse price data
  // Display formatted output:
  //   - Price: 50.123456
  //   - Confidence: ±0.01
  //   - Timestamp: 2024-01-15 10:30:00
  //   - Status: TRADING
}
```

**Update Command** (`cli/src/commands/oracle/update.ts` - 122 lines):
```typescript
export async function oracleUpdateCommand(options: OracleUpdateOptions) {
  // Validate price data
  // Build update instruction
  // Send transaction
  // Confirm update
}
```

**README** (`cli/src/commands/oracle/README.md` - 129 lines):
- Command usage examples
- Price source integration
- Automated update patterns

#### Oracle Updater Service

**Crank Service** (`cli/src/crank/oracle-updater.ts` - 214 lines):
```typescript
class OracleUpdater {
  constructor(config: OracleUpdaterConfig) {
    this.priceSource = config.source; // 'coingecko' | 'binance' | 'mock'
    this.updateInterval = config.interval || 10_000; // 10s default
  }

  async start() {
    setInterval(async () => {
      const price = await this.fetchPrice();
      await this.updateOracle(price);
    }, this.updateInterval);
  }

  async fetchPrice(): Promise<OraclePrice> {
    switch (this.priceSource) {
      case 'coingecko':
        return await fetchCoinGeckoPrice(this.symbol);
      case 'binance':
        return await fetchBinancePrice(this.symbol);
      case 'mock':
        return this.generateMockPrice();
    }
  }
}
```

**CLI Integration** (56 lines added to `cli/src/index.ts`):
```bash
barista oracle init --symbol SOL --price 100
barista oracle show --oracle <address>
barista oracle update --oracle <address> --price 101.5
barista oracle crank --oracle <address> --source coingecko
```

### Rust Keeper Migration (`f2c8dbe`)

**Massive Refactor**: 910 additions, 844 deletions

**Rationale**: Move from TypeScript to Rust for:
- Better performance
- Solana SDK compatibility
- Type safety for on-chain data
- Unified codebase with programs

**Files Removed** (TypeScript):
- `cli/src/commands/oracle/` (3 files, 378 lines)
- `cli/src/crank/oracle-updater.ts` (214 lines)
- Oracle commands from `cli/src/index.ts` (56 lines)

**Files Added** (Rust):

#### Keeper CLI (`keeper/src/cli.rs` - 134 lines):
```rust
pub struct CliArgs {
    #[command(subcommand)]
    pub command: Commands,
}

pub enum Commands {
    Oracle {
        #[command(subcommand)]
        command: OracleCommand,
    },
}

pub enum OracleCommand {
    Init(InitArgs),
    Show(ShowArgs),
    Update(UpdateArgs),
    Crank(CrankArgs),
}
```

#### Oracle Commands (`keeper/src/oracle/commands.rs` - 229 lines):
```rust
pub async fn init_oracle(args: InitArgs) -> Result<(), Box<dyn Error>> {
    let client = RpcClient::new(args.rpc_url);
    let keypair = read_keypair_file(&args.keypair)?;

    // Create oracle account
    let oracle_keypair = Keypair::new();

    // Initialize with price data
    let price_data = CustomOraclePrice {
        price: args.price,
        timestamp: Clock::get()?.unix_timestamp,
        confidence: args.confidence.unwrap_or(0),
        status: OracleStatus::Trading,
    };

    // Send transaction
    let sig = send_and_confirm(&client, &tx, &[&keypair, &oracle_keypair])?;

    println!("Oracle created: {}", oracle_keypair.pubkey());
    Ok(())
}

pub async fn show_oracle(args: ShowArgs) -> Result<(), Box<dyn Error>> {
    let client = RpcClient::new(args.rpc_url);
    let account = client.get_account(&args.oracle)?;

    // Parse oracle data
    let oracle_data: CustomOraclePrice = deserialize(&account.data)?;

    // Display formatted output
    println!("Oracle: {}", args.oracle);
    println!("Price: {}", format_price(oracle_data.price));
    println!("Confidence: ±{}", oracle_data.confidence);
    println!("Timestamp: {}", format_timestamp(oracle_data.timestamp));
    println!("Status: {:?}", oracle_data.status);

    Ok(())
}
```

#### Price Sources (`keeper/src/oracle/price_sources.rs` - 171 lines):
```rust
#[async_trait]
pub trait PriceSource {
    async fn fetch_price(&self, symbol: &str) -> Result<OraclePrice, PriceError>;
}

pub struct CoinGeckoSource {
    client: reqwest::Client,
    api_key: Option<String>,
}

impl PriceSource for CoinGeckoSource {
    async fn fetch_price(&self, symbol: &str) -> Result<OraclePrice, PriceError> {
        let url = format!(
            "https://api.coingecko.com/api/v3/simple/price?ids={}&vs_currencies=usd",
            symbol.to_lowercase()
        );

        let response: serde_json::Value = self.client
            .get(&url)
            .send()
            .await?
            .json()
            .await?;

        let price = response[symbol]["usd"]
            .as_f64()
            .ok_or(PriceError::ParseError)?;

        Ok(OraclePrice {
            price: (price * 1_000_000.0) as i64,
            confidence: 0,
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)?
                .as_secs() as i64,
            status: OracleStatus::Trading,
        })
    }
}

pub struct BinanceSource { /* ... */ }
pub struct MockSource { /* ... */ }
```

#### Module Organization (`keeper/src/oracle/mod.rs` - 72 lines):
```rust
pub mod commands;
pub mod price_sources;

pub use commands::{init_oracle, show_oracle, update_oracle, start_crank};
pub use price_sources::{PriceSource, CoinGeckoSource, BinanceSource, MockSource};
```

**Main Binary** (`keeper/src/main.rs` - 227 lines):
```rust
#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let args = CliArgs::parse();

    match args.command {
        Commands::Oracle { command } => {
            match command {
                OracleCommand::Init(args) => init_oracle(args).await,
                OracleCommand::Show(args) => show_oracle(args).await,
                OracleCommand::Update(args) => update_oracle(args).await,
                OracleCommand::Crank(args) => start_crank(args).await,
            }
        }
    }
}
```

**Dependencies** (`keeper/Cargo.toml` - 9 additions):
```toml
[dependencies]
clap = { version = "4.4", features = ["derive"] }
solana-client = "1.17"
solana-sdk = "1.17"
tokio = { version = "1.35", features = ["full"] }
reqwest = { version = "0.11", features = ["json"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
anyhow = "1.0"
```

### Keeper Documentation (`8e28d21`)

**README** (`keeper/README.md` - 272 lines):

```markdown
# Barista Keeper

Infrastructure service for oracle price feeds and system maintenance.

## Commands

### Oracle Management

#### Initialize Oracle
keeper oracle init --symbol SOL --price 100.0 --keypair ~/.config/solana/id.json

#### Show Oracle State
keeper oracle show --oracle <address>

#### Manual Update
keeper oracle update --oracle <address> --price 101.5

#### Start Crank (Auto-Update)
keeper oracle crank \
  --oracle <address> \
  --source coingecko \
  --symbol solana \
  --interval 10

## Price Sources

- **CoinGecko**: Free API, 10-50 calls/minute
- **Binance**: WebSocket streaming, real-time
- **Mock**: Simulated prices for testing

## Examples

### Localnet Testing
# 1. Start localnet
solana-test-validator

# 2. Initialize oracle
keeper oracle init --symbol SOL --price 100 --network localnet

# 3. Start auto-updater
keeper oracle crank --oracle <addr> --source mock --interval 5

### Devnet Testing
keeper oracle init \
  --symbol SOL \
  --price 95.50 \
  --confidence 10000 \
  --network devnet

keeper oracle crank \
  --oracle <addr> \
  --source coingecko \
  --symbol solana \
  --interval 10 \
  --network devnet
```

### Compilation Fix (`b02e7c9`)

**Error**: Missing trait import
**Fix** (10 additions, 8 deletions):

```rust
// keeper/src/oracle/price_sources.rs
use async_trait::async_trait; // Added
use std::error::Error;

// Fixed async trait implementation
#[async_trait]
impl PriceSource for CoinGeckoSource {
    async fn fetch_price(&self, symbol: &str) -> Result<OraclePrice, Box<dyn Error>> {
        // Implementation
    }
}
```

### Cargo Lock Update (`56e058c`)

**Dependencies Added**: 384 additions, 31 deletions

Major crates:
- `tokio` - Async runtime
- `reqwest` - HTTP client
- `serde_json` - JSON parsing
- `solana-client` - RPC client
- `async-trait` - Async trait support

### On-Chain Oracle Architecture (`01714fe`)

**Major Addition**: 643 lines across 7 files

#### Oracle Adapter Pattern

**Trait Definition** (`programs/router/src/oracle/adapter.rs` - 52 lines):
```rust
pub trait OracleAdapter {
    /// Read current price from oracle account
    fn read_price(&self, oracle_account: &AccountInfo) -> Result<OraclePrice, OracleError>;

    /// Validate oracle account (owner, discriminator, etc.)
    fn validate_account(&self, oracle_account: &AccountInfo) -> Result<(), OracleError>;

    /// Get price scale (e.g., 1e6 for USDC-like precision)
    fn get_price_scale(&self) -> u32;
}

pub struct OraclePrice {
    pub price: i64,           // Scaled price (e.g., 50.123456 USDC = 50_123_456)
    pub confidence: u64,      // Confidence interval (optional)
    pub timestamp: i64,       // Unix timestamp
    pub expo: i32,            // Price exponent (for normalization)
}

pub enum OracleError {
    InvalidAccount,
    PriceUnavailable,
    StalePrice,
    InvalidConfidence,
}
```

#### Custom Oracle Implementation

**Custom Oracle** (`programs/router/src/oracle/custom.rs` - 142 lines):
```rust
/// Custom oracle format for localnet/devnet testing
/// Account layout (128 bytes):
///   - Discriminator: 8 bytes ("oracle")
///   - Version: 4 bytes (u32)
///   - Symbol: 32 bytes (null-terminated string)
///   - Decimals: 1 byte (u8)
///   - Reserved: 7 bytes
///   - Timestamp: 8 bytes (i64, unix timestamp)
///   - Price: 8 bytes (i64, scaled by decimals)
///   - Confidence: 8 bytes (u64, optional)
///   - Status: 4 bytes (u32: 0=unknown, 1=trading, 2=halted)
///   - Reserved: 48 bytes (future use)

pub struct CustomAdapter;

impl OracleAdapter for CustomAdapter {
    fn read_price(&self, oracle_account: &AccountInfo) -> Result<OraclePrice, OracleError> {
        // Validate account ownership
        if oracle_account.owner != &EXPECTED_PROGRAM_ID {
            return Err(OracleError::InvalidAccount);
        }

        let data = oracle_account.try_borrow_data()?;

        // Verify discriminator
        let disc = &data[0..8];
        if disc != b"oracle\0\0" {
            return Err(OracleError::InvalidAccount);
        }

        // Parse fields at specific offsets
        let timestamp = i64::from_le_bytes(data[80..88].try_into()?);
        let price = i64::from_le_bytes(data[88..96].try_into()?);
        let confidence = u64::from_le_bytes(data[96..104].try_into()?);
        let status = u32::from_le_bytes(data[104..108].try_into()?);

        // Validate freshness (5 minute threshold)
        let now = Clock::get()?.unix_timestamp;
        if now - timestamp > 300 {
            return Err(OracleError::StalePrice);
        }

        // Validate status
        if status != 1 {
            return Err(OracleError::PriceUnavailable);
        }

        Ok(OraclePrice {
            price,
            confidence,
            timestamp,
            expo: -6, // 1e6 precision
        })
    }

    fn validate_account(&self, oracle_account: &AccountInfo) -> Result<(), OracleError> {
        if oracle_account.data_len() != 128 {
            return Err(OracleError::InvalidAccount);
        }
        Ok(())
    }

    fn get_price_scale(&self) -> u32 {
        1_000_000 // 1e6
    }
}
```

#### Pyth Oracle Stub

**Pyth Adapter** (`programs/router/src/oracle/pyth.rs` - 108 lines):
```rust
/// Pyth Network oracle integration
/// Format: Pyth V1 price account (3312 bytes)
/// Documentation: https://docs.pyth.network/documentation/pythnet-price-feeds

pub struct PythAdapter;

impl OracleAdapter for PythAdapter {
    fn read_price(&self, oracle_account: &AccountInfo) -> Result<OraclePrice, OracleError> {
        // TODO: Implement Pyth parsing
        // For now, return placeholder
        Err(OracleError::PriceUnavailable)
    }

    fn validate_account(&self, oracle_account: &AccountInfo) -> Result<(), OracleError> {
        // TODO: Validate Pyth account format
        Ok(())
    }

    fn get_price_scale(&self) -> u32 {
        1_000_000
    }
}
```

#### Module Organization

**Module Definition** (`programs/router/src/oracle/mod.rs` - 15 lines):
```rust
pub mod adapter;
pub mod custom;
pub mod pyth;

pub use adapter::{OracleAdapter, OraclePrice, OracleError};
pub use custom::CustomAdapter;
pub use pyth::PythAdapter;

/// Factory function to get appropriate adapter
pub fn get_adapter(oracle_type: OracleType) -> Box<dyn OracleAdapter> {
    match oracle_type {
        OracleType::Custom => Box::new(CustomAdapter),
        OracleType::Pyth => Box::new(PythAdapter),
    }
}
```

**Program Integration** (`programs/router/src/lib.rs`):
```rust
pub mod oracle;

use oracle::{OracleAdapter, CustomAdapter, PythAdapter};
```

**Cargo Configuration** (`programs/router/Cargo.toml`):
```toml
[dependencies]
pinocchio = { workspace = true }
percolator-common = { path = "../common" }
model_safety = { path = "../../crates/model_safety" }
# No external oracle SDK dependencies
```

#### Documentation

**Integration Status** (`thoughts/PYTH_INTEGRATION_STATUS.md` - 323 lines):

Major sections:
1. **Architecture Overview**
   - Adapter pattern rationale
   - Custom vs Pyth oracle comparison
   - Account format specifications

2. **Custom Oracle** (Implemented ✅)
   - 128-byte format specification
   - Field-by-field layout
   - Keeper integration examples

3. **Pyth Integration** (Stub ⚠️)
   - V1 price account format (3312 bytes)
   - Key field offsets
   - SDK integration notes
   - Manual parsing approach

4. **Next Steps**
   - Complete Pyth implementation
   - Add Switchboard support
   - Testing strategy
   - Devnet feed IDs

### Pyth Oracle Implementation (`2df76a0`)

**Completion**: 142 additions, 24 deletions

**Full Implementation** (`programs/router/src/oracle/pyth.rs`):

```rust
/// Pyth V1 Price Account Manual Parser
///
/// Account Layout (3312 bytes total):
/// - Magic: 4 bytes (0xa1b2c3d4)
/// - Version: 4 bytes (1)
/// - Type: 4 bytes (3 for price)
/// - Size: 4 bytes
/// - Product account: 32 bytes
/// - Next price account: 32 bytes
/// - Aggregate price: 8 bytes @ offset 80 (i64)
/// - Aggregate confidence: 8 bytes @ offset 88 (u64)
/// - Aggregate status: 4 bytes @ offset 96 (u32)
/// - Exponent: 4 bytes @ offset 112 (i32)
/// - Timestamp: 8 bytes @ offset 176 (i64)
/// ... (publisher prices, etc.)

pub struct PythAdapter;

impl OracleAdapter for PythAdapter {
    fn read_price(&self, oracle_account: &AccountInfo) -> Result<OraclePrice, OracleError> {
        let data = oracle_account.try_borrow_data()?;

        // Validate minimum size
        if data.len() < 200 {
            return Err(OracleError::InvalidAccount);
        }

        // Parse magic number
        let magic = u32::from_le_bytes(data[0..4].try_into()?);
        if magic != 0xa1b2c3d4 {
            return Err(OracleError::InvalidAccount);
        }

        // Parse version
        let version = u32::from_le_bytes(data[4..8].try_into()?);
        if version != 1 {
            return Err(OracleError::InvalidAccount);
        }

        // Parse aggregate price at offset 80
        let price = i64::from_le_bytes(data[80..88].try_into()?);

        // Parse confidence at offset 88
        let conf = u64::from_le_bytes(data[88..96].try_into()?);

        // Parse status at offset 96
        let status_u32 = u32::from_le_bytes(data[96..100].try_into()?);
        let status = match status_u32 {
            0 => return Err(OracleError::PriceUnavailable), // Unknown
            1 => OraclePriceStatus::Trading,
            2 => return Err(OracleError::PriceUnavailable), // Halted
            3 => return Err(OracleError::PriceUnavailable), // Auction
            _ => return Err(OracleError::InvalidAccount),
        };

        // Parse exponent at offset 112
        let expo = i32::from_le_bytes(data[112..116].try_into()?);

        // Parse timestamp at offset 176
        let timestamp = i64::from_le_bytes(data[176..184].try_into()?);

        // Validate freshness (60 second threshold for Pyth)
        let now = Clock::get()?.unix_timestamp;
        if now - timestamp > 60 {
            return Err(OracleError::StalePrice);
        }

        // Validate confidence ratio (price/conf > 100)
        let price_abs = price.abs() as u64;
        if conf > 0 && price_abs / conf < 100 {
            return Err(OracleError::InvalidConfidence);
        }

        // Normalize to 1e6 scale
        let normalized_price = if expo < -6 {
            // Scale down: price * 10^(expo + 6)
            let scale_factor = 10i64.pow((-expo - 6) as u32);
            price / scale_factor
        } else if expo > -6 {
            // Scale up: price * 10^(expo + 6)
            let scale_factor = 10i64.pow((expo + 6) as u32);
            price * scale_factor
        } else {
            price
        };

        Ok(OraclePrice {
            price: normalized_price,
            confidence: conf,
            timestamp,
            expo: -6, // Always return as 1e6 scale
        })
    }

    fn validate_account(&self, oracle_account: &AccountInfo) -> Result<(), OracleError> {
        if oracle_account.data_len() < 200 {
            return Err(OracleError::InvalidAccount);
        }

        let data = oracle_account.try_borrow_data()?;
        let magic = u32::from_le_bytes(data[0..4].try_into()
            .map_err(|_| OracleError::InvalidAccount)?);

        if magic != 0xa1b2c3d4 {
            return Err(OracleError::InvalidAccount);
        }

        Ok(())
    }

    fn get_price_scale(&self) -> u32 {
        1_000_000
    }
}

#[repr(u32)]
enum PythPriceStatus {
    Unknown = 0,
    Trading = 1,
    Halted = 2,
    Auction = 3,
}

impl PythPriceStatus {
    fn from_u32(value: u32) -> Result<Self, OracleError> {
        match value {
            0 => Ok(Self::Unknown),
            1 => Ok(Self::Trading),
            2 => Ok(Self::Halted),
            3 => Ok(Self::Auction),
            _ => Err(OracleError::InvalidAccount),
        }
    }
}
```

**Key Features**:
1. **No SDK Dependency**: Manual binary parsing avoids `solana_program::AccountInfo` vs `pinocchio::AccountInfo` type conflicts
2. **Complete V1 Format**: All critical fields parsed (price, confidence, status, expo, timestamp)
3. **Robust Validation**:
   - Magic number check
   - Version verification
   - Staleness check (60s threshold)
   - Confidence ratio validation
   - Status validation
4. **Price Normalization**: Automatic scaling to 1e6 precision
5. **Error Handling**: Comprehensive error types for all failure modes

**Cargo Update** (`programs/router/Cargo.toml`):
```toml
# Comment explaining no pyth-sdk dependency needed
# Manual parsing approach avoids type conflicts
```

---

## Phase 5: Leverage Trading

### Commits: `b2049c1` → `379e931`

**Goal**: Intuitive leverage trading with market order support

### Initial Leverage Implementation (`b2049c1`)

**Added**: 504 lines across 5 files

**Problem Identified**: Unintuitive UX where quantity represented actual position size, not margin committed

#### SDK Helpers (Initial - Later Redesigned)

**RouterClient Extensions** (136 lines):
```typescript
calculateRequiredMargin(notional: BN, leverage: number = 1): BN {
  if (leverage === 1) {
    return notional; // Spot: full notional required
  }
  // Margin: notional * 0.1 / leverage
  return notional.mul(new BN(10)).div(new BN(leverage * 100));
}

async validateLeveragedPosition(
  user: PublicKey,
  quantity: BN,
  price: BN,
  leverage: number = 1
): Promise<ValidationResult> {
  const notional = quantity.mul(price).div(new BN(1_000_000));
  const requiredMargin = this.calculateRequiredMargin(notional, leverage);

  const portfolio = await this.getPortfolio(user);
  const valid = portfolio.equity >= requiredMargin;

  return { valid, requiredMargin, notional, leverage };
}

async calculateMaxQuantity(
  user: PublicKey,
  price: BN,
  leverage: number = 1
): Promise<BN> {
  const portfolio = await this.getPortfolio(user);

  if (leverage === 1) {
    return portfolio.equity.mul(new BN(1_000_000)).div(price);
  }

  // Max with leverage: equity * leverage / (IMR * price)
  return portfolio.equity
    .mul(new BN(leverage * 100))
    .div(new BN(10))
    .mul(new BN(1_000_000))
    .div(price);
}
```

#### CLI Enhancements

**Buy Command** (96 additions):
```typescript
// Added --leverage flag
interface BuyOptions {
  slab: string;
  quantity: string;
  price: string;
  leverage?: string; // "5x", "10x"
}

// Validation before execution
const leverage = parseLeverage(options.leverage || "1x");
const validation = await client.validateLeveragedPosition(
  user, quantity, price, leverage
);

if (!validation.valid) {
  console.error("Insufficient margin");
  console.log(`Required: ${validation.requiredMargin}`);
  console.log(`Available: ${validation.availableEquity}`);
  process.exit(1);
}

// Position summary
console.log("Position Summary:");
console.log(`  Mode: ${leverage === 1 ? 'Spot' : `Margin (${leverage}x)`}`);
console.log(`  Notional: ${validation.notional}`);
console.log(`  Required margin: ${validation.requiredMargin}`);

// Confirmation for margin trades
if (leverage > 1) {
  const answer = await promptYN("Continue with margin trade?");
  if (!answer) process.exit(0);
}
```

**Sell Command**: Same pattern (96 additions)

**CLI Index**: Added `-l, --leverage` flag to both commands

#### Documentation

**Implementation Guide** (`LEVERAGE_IMPLEMENTATION.md` - 178 lines):
- Design philosophy
- SDK API reference
- CLI usage examples
- Migration notes
- On-chain compatibility

### Leverage Redesign + Market Orders (`f6483fe`)

**Redesign**: 507 additions, 127 deletions

**User Feedback**: "quantity should represent margin committed, leverage multiplies it"

**Breaking Change**: Complete leverage model overhaul

#### New Leverage Model

**Before (Unintuitive)**:
```bash
# quantity = actual position size
barista buy -q 500 -p 10 -l 5x
# Confusing: opens 500-unit position, requires 100 margin
```

**After (Intuitive)**:
```bash
# quantity = margin to commit
barista buy -q 100 -p 10 -l 5x
# Clear: commit 100×10=1000 margin, open 5000 position (500 contracts)
```

#### SDK Redesign

**New Methods** (`sdk/src/clients/RouterClient.ts` - 134 net change):

```typescript
calculatePositionSize(marginCommitted: BN, leverage: number = 1): BN {
  return marginCommitted.mul(new BN(leverage));
}

calculateActualQuantity(quantityInput: BN, price: BN, leverage: number = 1): BN {
  // actual_quantity = quantityInput * leverage
  return quantityInput.mul(new BN(leverage));
}

async validateLeveragedPosition(
  user: PublicKey,
  quantityInput: BN,  // NOW: margin to commit (not position size)
  price: BN,
  leverage: number = 1
): Promise<{
  valid: boolean;
  availableEquity: BN;
  marginCommitted: BN;     // NEW
  actualQuantity: BN;      // NEW
  positionSize: BN;        // NEW
  leverage: number;
  mode: 'spot' | 'margin';
}> {
  const marginCommitted = quantityInput.mul(price).div(new BN(1_000_000));
  const positionSize = this.calculatePositionSize(marginCommitted, leverage);
  const actualQuantity = this.calculateActualQuantity(quantityInput, price, leverage);

  const portfolio = await this.getPortfolio(user);
  const valid = portfolio.equity >= marginCommitted;

  return {
    valid,
    availableEquity: portfolio.equity,
    marginCommitted,
    actualQuantity,
    positionSize,
    leverage,
    mode: leverage === 1 ? 'spot' : 'margin'
  };
}

calculateMaxQuantityInput(
  user: PublicKey,
  price: BN,
  leverage: number = 1
): Promise<BN> {
  const portfolio = await this.getPortfolio(user);

  // max_input = equity / price (same for all leverage!)
  // leverage just multiplies the position opened
  return portfolio.equity.mul(new BN(1_000_000)).div(price);
}

async getMarketPrice(slabMarket: PublicKey, slabProgramId: PublicKey): Promise<BN> {
  const account = await this.connection.getAccountInfo(slabMarket);

  // Parse mark_px from slab state at offset 176
  const offset = 8 + 4 + 4 + 32 + 32 + 32 + 32 + 8 + 8 + 8;
  const markPx = new BN(account.data.readBigInt64LE(offset).toString());

  return markPx;
}
```

#### CLI Market Orders

**Buy/Sell Commands** (83 changes each):

```typescript
interface BuyOptions {
  slab: string;
  quantity: string;
  price?: string;  // NOW OPTIONAL - omit for market order
  leverage?: string;
}

export async function buyCommand(options: BuyOptions) {
  const quantityInput = new BN(options.quantity);

  // Market vs limit order
  let price: BN;
  if (!options.price) {
    // Market order - fetch current price
    price = await client.getMarketPrice(slabMarket, slabProgram);
    console.log(`Market price: ${price}`);
  } else {
    // Limit order
    price = new BN(options.price);
  }

  // Validate with new model
  const validation = await client.validateLeveragedPosition(
    user,
    quantityInput,  // Margin to commit
    price,
    leverage
  );

  // Display clear summary
  console.log("Trade Summary:");
  console.log(`  Order type: ${!options.price ? 'Market' : 'Limit'}`);
  console.log(`  Mode: ${validation.mode}`);
  console.log(`  Quantity input: ${quantityInput}`);
  console.log(`  Margin committed: ${validation.marginCommitted}`);
  console.log(`  → Actual position: ${validation.positionSize} (${validation.actualQuantity} contracts)`);

  // Confirm for market orders or margin
  if (!options.price || leverage > 1) {
    const answer = await promptYN("Execute?");
    if (!answer) process.exit(0);
  }

  // Build with ACTUAL quantity (leveraged)
  const buyIx = client.buildBuyInstruction(
    user,
    slabMarket,
    validation.actualQuantity,  // Use leveraged quantity!
    price,
    slabProgram
  );
}
```

**CLI Index** (12 changes):
```typescript
program
  .command('buy')
  .description('Execute a buy order (market or limit)')
  .requiredOption('--slab <address>', 'Slab market address')
  .requiredOption('-q, --quantity <amount>',
    'Margin to commit. With leverage, actual position = quantity × leverage')
  .option('-p, --price <price>',
    'Limit price (optional, omit for market order)')
  .option('-l, --leverage <multiplier>',
    'Leverage multiplier (e.g., "5x"). Default: 1x (spot)')
```

#### Comprehensive Documentation

**Redesign Guide** (`LEVERAGE_REDESIGN.md` - 322 lines):

Major sections:
1. **Summary**: Key changes overview
2. **New Model**: Intuitive mechanics explanation
3. **Examples**: Step-by-step walkthroughs
4. **Detailed Mechanics**: Calculation flow
5. **CLI Output Examples**: All scenarios
6. **SDK Changes**: API reference
7. **Migration Guide**: Before/after comparison
8. **On-Chain Compatibility**: No changes needed
9. **Technical Details**: Formulas and algorithms
10. **Benefits**: Why this is better

Key example:
```markdown
## Example Walkthrough

barista buy --slab SOL-PERP -q 50 -p 10 -l 5x

Step-by-step:
1. User inputs: quantity = 50, price = 10, leverage = 5
2. Margin committed: 50 × 10 = 500 USDC
3. Position size: 500 × 5 = 2500 USDC
4. Actual quantity: 50 × 5 = 250 contracts
5. Check: Do I have ≥500 USDC equity? ✓
6. Execute: Buy 250 contracts at price 10

Result: Opened 2500 USDC position using 500 USDC margin (5x effective leverage)
```

### Test Suite (`379e931`)

**Coverage**: 191 additions across test file

**Test Categories**:

#### 1. calculatePositionSize (4 tests)
```typescript
it('should calculate correct position size for spot (1x)', () => {
  const margin = new BN(1000);
  const position = client.calculatePositionSize(margin, 1);
  expect(position.toString()).toBe('1000');
});

it('should calculate correct position size for 5x leverage', () => {
  const margin = new BN(1000);
  const position = client.calculatePositionSize(margin, 5);
  expect(position.toString()).toBe('5000');
});
```

#### 2. calculateActualQuantity (4 tests)
```typescript
it('should calculate actual quantity for 5x leverage', () => {
  const input = new BN(100);
  const price = new BN(10_000_000);
  const actual = client.calculateActualQuantity(input, price, 5);
  expect(actual.toString()).toBe('500'); // 100 * 5
});
```

#### 3. Validation (3 tests)
```typescript
it('should throw error for invalid leverage range', async () => {
  await expect(
    client.validateLeveragedPosition(user, qty, price, 0)
  ).rejects.toThrow('Leverage must be between 1x and 10x');

  await expect(
    client.validateLeveragedPosition(user, qty, price, 15)
  ).rejects.toThrow('Leverage must be between 1x and 10x');
});
```

#### 4. End-to-End Examples (4 tests)
```typescript
it('should correctly model 5x leverage trading', () => {
  const quantityInput = new BN(100);
  const price = new BN(10_000_000);
  const leverage = 5;

  const marginCommitted = quantityInput.mul(price).div(new BN(1_000_000));
  const positionSize = client.calculatePositionSize(marginCommitted, leverage);
  const actualQuantity = client.calculateActualQuantity(quantityInput, price, leverage);

  expect(marginCommitted.toString()).toBe('1000'); // 100 * 10
  expect(positionSize.toString()).toBe('5000');    // 1000 * 5
  expect(actualQuantity.toString()).toBe('500');   // 100 * 5
});

it('should demonstrate leverage independence from max quantity input', () => {
  const equity = new BN(1000);
  const price = new BN(10_000_000);

  const maxInput = equity.mul(new BN(1_000_000)).div(price);
  expect(maxInput.toString()).toBe('100'); // Same for all leverage

  const pos1x = client.calculateActualQuantity(maxInput, price, 1);
  expect(pos1x.toString()).toBe('100');

  const pos5x = client.calculateActualQuantity(maxInput, price, 5);
  expect(pos5x.toString()).toBe('500'); // 5x multiplier

  const pos10x = client.calculateActualQuantity(maxInput, price, 10);
  expect(pos10x.toString()).toBe('1000'); // 10x multiplier
});
```

**Results**:
```
Test Suites: 1 passed, 1 total
Tests:       32 passed, 32 total (14 new tests for leverage)
```

---

## Summary Statistics

### Commit Breakdown

**Total Commits**: 54 (by Sean)
- Merge commits: 8
- Feature commits: 34
- Fix/chore commits: 7
- Documentation commits: 5

### Lines of Code

**Added**:
- TypeScript (SDK): ~3,500 lines
- TypeScript (CLI): ~2,800 lines
- Rust (On-chain): ~850 lines
- Rust (Keeper): ~650 lines
- Tests: ~1,350 lines
- Documentation: ~5,200 lines
- **Total: ~14,350 lines**

**Deleted/Modified**:
- Refactored: ~1,150 lines
- **Net Addition: ~13,200 lines**

### File Statistics

**Files Created**: 58
**Files Modified**: 47
**Files Deleted**: 7

### Key Metrics

#### Test Coverage
- SDK tests: 858 lines
- CLI tests: 278 lines
- **Total: 1,136 test lines**
- **Coverage**: All core functionality

#### Documentation
- SDK README: 816 lines
- CLI README: 168 lines
- Keeper README: 272 lines
- Thoughts docs: 3,944 lines
- **Total: 5,200 documentation lines**

### Technology Stack

**Languages**:
- TypeScript: 8,300 lines
- Rust: 1,500 lines
- Markdown: 5,200 lines

**Dependencies Added**:
- `@solana/web3.js` - Solana SDK
- `bn.js` - Big number math
- `commander` - CLI framework
- `chalk` - Terminal colors
- `ora` - Spinners
- `jest` - Testing
- `tokio` - Async runtime (Rust)
- `reqwest` - HTTP client (Rust)
- `clap` - CLI parsing (Rust)

### Major Milestones

1. **SDK Foundation** (ee9b7c7) - 2,501 lines
   - Complete RouterClient implementation
   - Complete SlabClient implementation
   - Comprehensive test suite

2. **CLI Package** (1cb6578) - 1,111 lines
   - 5 trader-focused commands
   - Network configuration
   - Test infrastructure

3. **Discovery System** (8364c08) - 962 lines
   - Market discovery commands
   - Multi-network support
   - Enhanced SDK helpers

4. **Oracle Infrastructure** (f2c8dbe) - 910 lines
   - Rust keeper service
   - Price feed automation
   - Multi-source support

5. **Oracle Integration** (01714fe + 2df76a0) - 785 lines
   - On-chain adapter pattern
   - Custom oracle (128 bytes)
   - Pyth oracle (3312 bytes)
   - Manual binary parsing

6. **Leverage Trading** (f6483fe) - 507 lines
   - Intuitive leverage model
   - Market order support
   - Comprehensive validation

7. **Test Coverage** (379e931) - 191 lines
   - 14 new leverage tests
   - End-to-end examples
   - 100% API coverage

### Development Patterns

**Iterative Refinement**:
- CLI simplified from 7 → 5 commands
- TypeScript oracle → Rust keeper
- Leverage model redesigned based on feedback

**Test-Driven**:
- Tests written alongside features
- Comprehensive edge case coverage
- Integration and unit tests

**Documentation-First**:
- Detailed planning docs in `thoughts/`
- README updates with each feature
- Migration guides for breaking changes

**Quality Focus**:
- Type safety throughout
- Error handling patterns
- User-friendly CLI output

---

## Phase 6: Upstream Integration & Portfolio UX

### Overview

**Goal**: Merge upstream changes, fix breaking changes, and improve portfolio initialization UX

### Upstream Merge & Portfolio Fixes

**Context**: Upstream introduced major changes to Portfolio struct, breaking SDK deserialization

**Portfolio Struct Changes**:
- Added PnL vesting fields (`principal`, `pnl`, `vested_pnl`, `last_slot`, `pnl_index_checkpoint`)
- Added liquidation tracking (`health`, `last_liquidation_ts`, `cooldown_seconds`)
- Restructured exposure tracking with LP buckets
- Size grew to ~136KB (requires `create_with_seed` instead of PDA)

**SDK Updates** (`sdk/src/clients/RouterClient.ts`):

```typescript
// NEW: Fixed portfolio derivation (uses create_with_seed, not PDA)
async derivePortfolioAddress(user: PublicKey): Promise<PublicKey> {
  return await PublicKey.createWithSeed(
    user,
    'portfolio',
    this.programId
  );
}

// NEW: Portfolio initialization with large account creation
async buildInitializePortfolioInstructions(
  user: PublicKey,
  portfolioSize: number = 139264  // ~136KB
): Promise<TransactionInstruction[]> {
  const portfolioAddress = await this.derivePortfolioAddress(user);
  const rentExemption = await this.connection.getMinimumBalanceForRentExemption(portfolioSize);

  // Instruction 1: Create large account (bypasses 10KB CPI limit)
  const createAccountIx = SystemProgram.createAccountWithSeed({
    fromPubkey: user,
    newAccountPubkey: portfolioAddress,
    basePubkey: user,
    seed: 'portfolio',
    lamports: rentExemption,
    space: portfolioSize,
    programId: this.programId,
  });

  // Instruction 2: Initialize portfolio
  const instructionData = Buffer.alloc(33);
  instructionData.writeUInt8(RouterInstruction.InitializePortfolio, 0);
  user.toBuffer().copy(instructionData, 1);

  const initializeIx = new TransactionInstruction({
    programId: this.programId,
    keys: [
      { pubkey: portfolioAddress, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
    ],
    data: instructionData,
  });

  return [createAccountIx, initializeIx];
}

// NEW: Auto-create portfolio if needed
async ensurePortfolioInstructions(user: PublicKey): Promise<TransactionInstruction[]> {
  const portfolioAddress = await this.derivePortfolioAddress(user);
  const accountInfo = await this.connection.getAccountInfo(portfolioAddress);

  // Portfolio already exists
  if (accountInfo && accountInfo.owner.equals(this.programId)) {
    return [];
  }

  // Portfolio doesn't exist, return initialization instructions
  return await this.buildInitializePortfolioInstructions(user);
}
```

**Portfolio Deserialization** (`sdk/src/clients/RouterClient.ts`):

```typescript
deserializePortfolio(data: Buffer): Portfolio {
  let offset = 0;

  // Basic fields (32 + 32 + 16 + 16 + 16 + 16 + 8 + 2 + 1 + 5 = 144 bytes)
  const routerId = deserializePubkey(data, offset); offset += 32;
  const user = deserializePubkey(data, offset); offset += 32;
  const equity = deserializeI128(data, offset); offset += 16;
  const im = deserializeU128(data, offset); offset += 16;
  const mm = deserializeU128(data, offset); offset += 16;
  const freeCollateral = deserializeI128(data, offset); offset += 16;
  const lastMarkTs = deserializeU64(data, offset); offset += 8;
  const exposureCount = data.readUInt16LE(offset); offset += 2;
  const bump = data.readUInt8(offset); offset += 1;
  offset += 5; // _padding

  // NEW: Liquidation tracking (16 + 8 + 8 + 8 = 40 bytes)
  const health = deserializeI128(data, offset); offset += 16;
  const lastLiquidationTs = deserializeU64(data, offset); offset += 8;
  const cooldownSeconds = deserializeU64(data, offset); offset += 8;
  offset += 8; // _padding2

  // NEW: PnL vesting state (16 + 16 + 16 + 8 + 16 + 8 = 80 bytes)
  const principal = deserializeI128(data, offset); offset += 16;
  const pnl = deserializeI128(data, offset); offset += 16;
  const vestedPnl = deserializeI128(data, offset); offset += 16;
  const lastSlot = deserializeU64(data, offset); offset += 8;
  const pnlIndexCheckpoint = deserializeI128(data, offset); offset += 16;
  offset += 8; // _padding4

  // Exposures array (8 bytes per entry * MAX_SLABS * MAX_INSTRUMENTS)
  const exposures: Exposure[] = [];
  for (let i = 0; i < MAX_SLABS * MAX_INSTRUMENTS; i++) {
    const slabIdx = data.readUInt16LE(offset); offset += 2;
    const instrumentIdx = data.readUInt16LE(offset); offset += 2;
    const qty = deserializeI64(data, offset); offset += 8;

    if (slabIdx !== 0 || instrumentIdx !== 0 || !qty.isZero()) {
      exposures.push({ slabIdx, instrumentIdx, qty });
    }
  }

  // NEW: LP buckets (variable size entries * MAX_LP_BUCKETS)
  const lpBuckets: LpBucket[] = [];
  for (let i = 0; i < MAX_LP_BUCKETS; i++) {
    // Parse venue ID, LP amounts, etc.
    // ... (detailed parsing logic)
  }

  const lpBucketCount = data.readUInt16LE(offset); offset += 2;

  return {
    routerId, user, equity, im, mm, freeCollateral,
    lastMarkTs, exposureCount, bump,
    health, lastLiquidationTs, cooldownSeconds,  // NEW
    principal, pnl, vestedPnl, lastSlot, pnlIndexCheckpoint,  // NEW
    exposures, lpBuckets, lpBucketCount  // UPDATED
  };
}
```

**CLI Auto-Portfolio Creation**:

All CLI commands now automatically create portfolios on first use:

```typescript
// cli-client/src/commands/router/deposit.ts
export async function depositCommand(options: DepositOptions): Promise<void> {
  // ... setup ...

  // NEW: Ensure portfolio exists (auto-create if needed)
  spinner.text = 'Checking portfolio...';
  const ensurePortfolioIxs = await client.ensurePortfolioInstructions(wallet.publicKey);

  if (ensurePortfolioIxs.length > 0) {
    spinner.text = 'Creating portfolio (first-time setup)...';
  }

  const depositIx = client.buildDepositInstruction(/* ... */);

  const transaction = new Transaction()
    .add(...ensurePortfolioIxs)  // Auto-create if needed
    .add(depositIx);

  // ... send transaction ...
}
```

Same pattern applied to:
- `cli-client/src/commands/trading/buy.ts`
- `cli-client/src/commands/trading/sell.ts`
- `cli-client/src/commands/router/withdraw.ts`

### Documentation Updates

**LOCALNET_DEPLOYMENT_GUIDE.md**:
- Clarified router initialization (protocol operator task, one-time)
- Explained portfolio creation (automatic on first use)
- Updated all `cli/` references to `cli-client/`
- Removed non-existent CLI commands (`init`)
- Listed actually available CLI commands

**Key Clarifications**:

**Router vs Portfolio Initialization**:
- **Router Initialization**: One-time protocol setup, creates `SlabRegistry` (risk params, governance, insurance)
- **Portfolio Creation**: Per-user, automatic on first deposit/trade

**Technical Details**:
- Portfolio uses `create_with_seed` (NOT PDA) to bypass 10KB CPI limit
- Portfolio size: ~136KB (too large for CPI account creation)
- Account created client-side, then initialized by program

### User Experience Improvement

**Before**:
```bash
# Users had to somehow manually initialize portfolio (confusing!)
# Then could deposit/trade
```

**After**:
```bash
# Just use the CLI - portfolio creates automatically!
barista deposit --mint <MINT> --amount 1000 --network localnet
# ✓ Checking portfolio...
# ✓ Creating portfolio (first-time setup)...
# ✓ Deposit successful!
```

**Key Benefits**:
1. **Zero Manual Setup**: Users don't think about portfolio initialization
2. **Atomic Creation**: Portfolio created in same transaction as first action
3. **Industry Standard**: Similar to associated token accounts in Solana
4. **Clear Messaging**: CLI shows "first-time setup" message when creating

### Files Modified

**SDK** (`sdk/src/clients/RouterClient.ts`):
- `derivePortfolioAddress()` - Fixed to use `create_with_seed`
- `buildInitializePortfolioInstructions()` - Handles large account creation
- `ensurePortfolioInstructions()` - Auto-check and create helper
- `getPortfolio()` - Fixed address derivation
- `deserializePortfolio()` - Complete rewrite (17+ new fields)

**CLI** (`cli-client/src/commands/`):
- `router/deposit.ts` - Auto-create portfolio
- `trading/buy.ts` - Auto-create portfolio
- `trading/sell.ts` - Auto-create portfolio

**Documentation** (`thoughts/`):
- `LOCALNET_DEPLOYMENT_GUIDE.md` - Comprehensive updates
- `IMPLEMENTATION_PLAN_SDK_CLI.md` - Fixed directory references

### Testing & Validation

**SDK Tests** (108 passing):
- Portfolio deserialization with new fields
- PDA vs `create_with_seed` derivation
- Instruction building

**CLI Tests** (36 passing):
- Command integration tests
- Network configuration

**Total Test Coverage**: 144 tests passing

### Impact

**Code Changes**:
- SDK: ~300 lines modified/added
- CLI: ~30 lines modified (3 files)
- Documentation: ~200 lines updated

**User-Facing Changes**:
- ✅ Portfolio creation is now automatic
- ✅ CLI works correctly with upstream changes
- ✅ Clear documentation of router vs portfolio initialization

**Developer-Facing Changes**:
- ✅ SDK `ensurePortfolioInstructions()` helper for custom integrations
- ✅ Proper `create_with_seed` usage for large accounts
- ✅ Deprecated old PDA-based methods

---

## Phase 7: SOL-Only Architecture & Package Publishing

### Commits: `b04985f` → `de245d8` → Package Publish

**Goal**: Fix critical deposit/withdraw mismatch and publish updated packages to npm

### Critical Discovery: Deposit/Withdraw Mismatch (`b04985f`)

**Context**: User discovered fundamental architecture mismatch between Rust program and TypeScript SDK/CLI

**The Problem**:
- **Rust program**: SOL-only deposits (3 accounts: Portfolio, User, SystemProgram)
- **TypeScript SDK/CLI**: Built for SPL tokens (7 accounts with mint, vault, token accounts)
- **Data format**: Rust expects u64 lamports, SDK was sending u128 token amounts
- **Result**: SDK/CLI would completely fail - wrong account layout, wrong data format, wrong everything

**User Insight**:
> "What is deposit actually? Since user is bringing their own wallet (using key.json), why do we need a deposit command?"
> "Why the hell do we have --mint flag?"
> "Fix it."

**Root Cause**: SDK was built assuming future SPL token support that doesn't exist in v0

### SDK Architectural Fix

**Before (WRONG - Would Never Work)**:
```typescript
buildDepositInstruction(
  mint: PublicKey,
  amount: BN,
  user: PublicKey,
  userTokenAccount: PublicKey
): TransactionInstruction {
  const [portfolioPDA] = this.derivePortfolioPDA(user);
  const [vaultPDA] = this.deriveVaultPDA(mint);
  const [registryPDA] = this.deriveRegistryPDA();

  const data = createInstructionData(
    RouterInstruction.Deposit,
    serializeU128(amount)  // ❌ Wrong: u128
  );

  return new TransactionInstruction({
    programId: this.programId,
    keys: [
      { pubkey: portfolioPDA, isSigner: false, isWritable: true },
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: registryPDA, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: false },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],  // ❌ Wrong: 7 accounts
    data,
  });
}
```

**After (CORRECT - Matches Rust Exactly)**:
```typescript
async buildDepositInstruction(
  amount: BN,
  user: PublicKey
): Promise<TransactionInstruction> {
  const portfolioAddress = await this.derivePortfolioAddress(user);

  const data = createInstructionData(
    RouterInstruction.Deposit,
    serializeU64(amount)  // ✅ Correct: u64 lamports
  );

  return new TransactionInstruction({
    programId: this.programId,
    keys: [
      { pubkey: portfolioAddress, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],  // ✅ Correct: 3 accounts matching Rust
    data,
  });
}
```

**Rust Implementation (Source of Truth)**:
```rust
// programs/router/src/instructions/deposit.rs
/// Process deposit instruction (SOL only for MVP)
///
/// Expected accounts:
/// 0. `[writable]` Portfolio account (receives SOL)
/// 1. `[signer, writable]` User account (sends SOL)
/// 2. `[]` System program
///
/// Expected data layout (8 bytes):
/// - amount: u64 (8 bytes, lamports)
pub fn process_deposit(
    portfolio_account: &AccountInfo,
    portfolio: &mut Portfolio,
    user_account: &AccountInfo,
    system_program: &AccountInfo,
    amount: u64,  // lamports, not u128!
) -> ProgramResult {
    // Transfer SOL from user to portfolio account
    invoke(
        &system_instruction::transfer(
            user_account.key,
            portfolio_account.key,
            amount,
        ),
        &[user_account.clone(), portfolio_account.clone()],
    )?;

    // Update portfolio state
    portfolio.principal += amount as i128;
    portfolio.equity += amount as i128;

    Ok(())
}
```

**Same Fix Applied to Withdraw**:
```typescript
async buildWithdrawInstruction(
  amount: BN,  // lamports
  user: PublicKey
): Promise<TransactionInstruction> {
  const portfolioAddress = await this.derivePortfolioAddress(user);

  const data = createInstructionData(
    RouterInstruction.Withdraw,
    serializeU64(amount)  // u64 lamports
  );

  return new TransactionInstruction({
    programId: this.programId,
    keys: [
      { pubkey: portfolioAddress, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}
```

### CLI Breaking Changes

**Removed `--mint` Flag**:

**Before**:
```bash
barista deposit --mint EPjFWdd5... --amount 1000000000
barista withdraw --mint EPjFWdd5... --amount 500000000
```

**After**:
```bash
barista deposit --amount 1000000000  # 1 SOL in lamports
barista withdraw --amount 500000000  # 0.5 SOL in lamports
```

**Updated Command Registration**:
```typescript
// cli-client/src/index.ts
program
  .command('deposit')
  .description('Deposit SOL to portfolio (SOL only for v0)')
  .requiredOption('-a, --amount <lamports>',
    'Amount to deposit in lamports (1 SOL = 1000000000 lamports)')
  .option('-n, --network <network>',
    'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'Custom RPC URL')
  .action(depositCommand);
```

**Updated Implementation**:
```typescript
// cli-client/src/commands/router/deposit.ts
interface DepositOptions {
  amount: string;  // Lamports only (no mint!)
  keypair?: string;
  url?: string;
  network?: string;
}

export async function depositCommand(options: DepositOptions): Promise<void> {
  // Parse amount and show SOL
  const amount = new BN(options.amount);
  const solAmount = amount.toNumber() / LAMPORTS_PER_SOL;

  spinner.text = `Building deposit transaction (${solAmount} SOL)...`;

  // Auto-create portfolio if needed
  const ensurePortfolioIxs = await client.ensurePortfolioInstructions(wallet.publicKey);

  // Build SOL-only deposit (no mint parameter!)
  const depositIx = await client.buildDepositInstruction(amount, wallet.publicKey);

  const transaction = new Transaction()
    .add(...ensurePortfolioIxs)
    .add(depositIx);

  const signature = await connection.sendTransaction(transaction, [wallet]);
  await connection.confirmTransaction(signature);

  displaySuccess(`Deposited ${solAmount} SOL to portfolio!`);
  console.log(chalk.gray(`Transaction: ${signature}`));
}
```

**Error Messaging**:
```typescript
if (!options.amount) {
  displayError('Missing required option: --amount <lamports>');
  console.log(chalk.gray('\nExamples:'));
  console.log(chalk.cyan('  barista deposit --amount 1000000000  # 1 SOL'));
  console.log(chalk.cyan('  barista deposit --amount 500000000   # 0.5 SOL'));
  console.log(chalk.gray('\n💡 Note: v0 supports SOL deposits only (USDC coming in v1+)\n'));
  process.exit(1);
}
```

### Portfolio Not Found Message Updates

**Evolution Through User Feedback**:

**Iteration 1** - Too generic:
```
Portfolio not found. The user may not have initialized their portfolio yet.
```

**Iteration 2** - Added initialization examples but confusing:
```
Portfolio not found. Initialize with:
  barista deposit --mint <TOKEN> --amount <AMOUNT>
```

**User Feedback**: "Those instructions are only for localnet? I think on devnet or mainnet, user can't mint anything right"

**Iteration 3** - Network-aware but still had mint references:
```
Portfolio not found.
Localnet: barista deposit --mint <MINT> --amount <AMOUNT>
Devnet/Mainnet: Users can't mint tokens
```

**User Feedback**: "That makes no sense still. Why would users mint in mainnet-beta or devnet"

**Iteration 4** - Removed mint confusion:
```
Portfolio not found.
Initialize by depositing collateral or trading.
```

**User Question**: "Why does the end-user like the user of the TypeScript CLI worry about initializing their portfolio?"

**Final Version** - Emphasizes auto-creation:
```typescript
// cli-client/src/commands/router/portfolio.ts
if (!portfolio) {
  spinner.fail();
  console.log(chalk.yellow('\n⚠️  Portfolio not found\n'));
  console.log(chalk.gray('Your portfolio will be automatically created on first use.'));

  const network = options.network || 'mainnet-beta';

  console.log(chalk.gray('\nTo initialize your portfolio, deposit SOL:'));
  console.log(chalk.cyan('  barista deposit --amount <LAMPORTS> --network ' + network));
  console.log(chalk.gray('  (1 SOL = 1000000000 lamports)'));
  console.log(chalk.gray('\nExamples:'));
  console.log(chalk.cyan('  barista deposit --amount 1000000000 --network ' + network + '  # 1 SOL'));
  console.log(chalk.cyan('  barista deposit --amount 500000000 --network ' + network + '   # 0.5 SOL'));

  console.log(chalk.gray('\nOr start trading (also auto-creates portfolio):'));
  console.log(chalk.cyan('  barista buy --slab <SLAB> -q <QUANTITY> --network ' + network));
  console.log(chalk.cyan('  barista sell --slab <SLAB> -q <QUANTITY> --network ' + network));

  console.log(chalk.gray('\n💡 Note: v0 supports SOL deposits only (USDC coming in v1+)\n'));
  process.exit(1);
}
```

### Documentation Updates

**SDK README.md** - Comprehensive SOL-only rewrite:

**Deposit Example**:
```typescript
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

async function depositCollateral(solAmount: number) {
  // Convert SOL to lamports
  const amount = new BN(solAmount * LAMPORTS_PER_SOL);

  // Automatically creates portfolio if it doesn't exist
  const ensurePortfolioIxs = await router.ensurePortfolioInstructions(wallet.publicKey);
  const depositIx = await router.buildDepositInstruction(amount, wallet.publicKey);

  const tx = new Transaction()
    .add(...ensurePortfolioIxs)
    .add(depositIx);

  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log(`Deposited ${solAmount} SOL:`, signature);
}

// Example: Deposit 10 SOL
await depositCollateral(10);
```

**API Reference Updates**:
```typescript
// OLD (removed)
buildDepositInstruction(mint, amount, user, userTokenAccount): TransactionInstruction

// NEW
buildDepositInstruction(amount: BN, user: PublicKey): Promise<TransactionInstruction>
// SOL only in v0

buildWithdrawInstruction(amount: BN, user: PublicKey): Promise<TransactionInstruction>
// SOL only in v0

ensurePortfolioInstructions(user: PublicKey): Promise<TransactionInstruction[]>
// Auto-creates portfolio if needed
```

**CLI README.md** - SOL-only examples:

```bash
# Deposit Collateral (SOL Only in v0)
barista deposit --amount <lamports>

# Example: Deposit 1 SOL (1000000000 lamports)
barista deposit --amount 1000000000

# Example: Deposit 0.5 SOL
barista deposit --amount 500000000
```

**Note added to both READMEs**:
> **Note**: v0 supports SOL deposits only. USDC and other SPL tokens will be supported in v1+.

### Package Publishing

**Version Bumps**:
- SDK: `0.1.2` → `0.1.3` (patch increment only)
- CLI: `0.1.0` → `0.1.1` (patch increment only)

**Publishing Process**:

1. **Version Updates**:
```json
// sdk/package.json
{
  "name": "@barista-dex/sdk",
  "version": "0.1.3"
}

// cli-client/package.json
{
  "name": "@barista-dex/cli",
  "version": "0.1.1",
  "dependencies": {
    "@barista-dex/sdk": "^0.1.3"
  }
}
```

2. **Build & Test**:
```bash
# SDK
cd sdk && npm run build
# ✓ TypeScript compilation successful

# CLI
cd cli-client && npm run build
# ✓ TypeScript compilation successful

# CLI tests
cd cli-client && npm test
# ✓ 36 tests passing (after fixing localnet program ID in tests)
```

3. **Test Fix**:
```typescript
// cli-client/src/__tests__/utils/wallet.test.ts
// BEFORE (outdated program ID)
expect(config.routerProgramId).toBe('RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr');

// AFTER (correct localnet ID from SDK constants)
expect(config.routerProgramId).toBe('Hp6yAnuBFS7mU2P9c3euNrJv4h2oKvNmyWMUHKccB3wx');
expect(config.slabProgramId).toBe('Hq5XLwLMcEnoGQJbYBeNaTBuTecEoSryavnpYWes8jdW');
```

4. **NPM Publish**:
```bash
# Publish SDK
cd sdk && npm publish --access public
# ✓ @barista-dex/sdk@0.1.3 published

# Publish CLI
cd cli-client && npm publish --access public
# ✓ @barista-dex/cli@0.1.1 published
```

**Published Packages**:
- **@barista-dex/sdk@0.1.3**: [npmjs.com/package/@barista-dex/sdk](https://www.npmjs.com/package/@barista-dex/sdk)
- **@barista-dex/cli@0.1.1**: [npmjs.com/package/@barista-dex/cli](https://www.npmjs.com/package/@barista-dex/cli)

### Additional Documentation

**Created**: `thoughts/PERPETUAL_FUTURES_MECHANICS.md` (114 lines)

Comprehensive guide covering:
1. **What Are Perpetual Futures**: Virtual positions, never expire, settle in margin currency
2. **SOL-Margined Trading**: How to trade BTC-PERP with SOL collateral
3. **Virtual Position Tracking**: On-chain state (Exposure struct)
4. **Market Impact**: Direct vs indirect effects on spot prices
5. **Cross-Margin Architecture**: Single collateral pool, multiple instruments
6. **Liquidation Cascades**: How perp crashes can affect spot markets
7. **Historical Examples**: FTX, Luna/UST, March 2020 COVID crash
8. **Funding Rates**: Not yet implemented in v0
9. **Account Structure**: Portfolio layout, deposit/withdraw mechanics
10. **Risk Management**: Cross-margin benefits and risks

**Key Insight Documented**:
> "Can perp crashes cause spot crashes? **Mechanically**: No (different markets, no delivery). **Practically**: Yes (through liquidations, arbitrage, psychology, and cross-market holdings). The coupling is **behavioral and financial**, not **mechanical**."

### Impact Summary

**Breaking Changes**:
- ❌ `--mint` flag removed from deposit/withdraw
- ❌ Mint parameter removed from SDK deposit/withdraw methods
- ❌ Changed from u128 to u64 for amounts (lamports)
- ❌ Changed from 7 accounts to 3 accounts
- ❌ Changed from TokenProgram to SystemProgram

**New Capabilities**:
- ✅ Deposit/withdraw actually works (matches Rust implementation)
- ✅ SOL-only trading fully functional
- ✅ Clear lamport-based UX
- ✅ Updated documentation reflects reality

**Files Modified**:
- `sdk/src/clients/RouterClient.ts` - Deposit/withdraw rewrite
- `cli-client/src/commands/router/deposit.ts` - Removed mint, added SOL examples
- `cli-client/src/commands/router/withdraw.ts` - Removed mint, added SOL examples
- `cli-client/src/commands/router/portfolio.ts` - Improved error message (4 iterations)
- `cli-client/src/index.ts` - Updated command descriptions
- `cli-client/src/__tests__/utils/wallet.test.ts` - Fixed program ID test
- `sdk/README.md` - Comprehensive SOL-only updates
- `cli-client/README.md` - SOL-only examples and workflow

**Test Coverage**:
- SDK: 108 tests passing
- CLI: 36 tests passing
- **Total: 144 tests passing**

**User Experience**:

**Before (Broken)**:
```bash
# Would fail with account mismatch errors
barista deposit --mint USDC --amount 1000000
# Error: Expected 7 accounts, got 3
# Error: Invalid instruction data
```

**After (Working)**:
```bash
# Actually works!
barista deposit --amount 1000000000
# ✓ Deposited 1 SOL to portfolio!
```

**Technical Lessons**:
1. **Always verify Rust <> TypeScript parity**: SDK assumptions must match on-chain reality
2. **User questions reveal bugs**: "Why do we have --mint?" uncovered fundamental mismatch
3. **Test with actual deployment**: Type-level correctness doesn't guarantee runtime success
4. **Document v0 limitations**: Clear messaging about SOL-only prevents user confusion

---

## Phase 6: PnL Settlement (v0.5)

### Goal: Implement Real PnL Settlement with DLP Counterparties

**Problem**: v0 had no real PnL settlement - only virtual accounting. When users closed profitable positions, there was no mechanism to transfer actual SOL from a counterparty.

**Solution**: Implement DLP Portfolio-based settlement where DLPs act as counterparties for all trades on their slabs.

### Architecture Decision: DLP Portfolio = Trader Portfolio

**Key Design Choice**: Use the same Portfolio structure for both traders and DLPs.

**Benefits**:
1. **Zero migration impact**: v0.5 → v1 order book requires no account changes
2. **Simple implementation**: Reuse existing Portfolio struct and PDA derivation
3. **Same infrastructure**: DLPs use trader CLI commands (deposit, portfolio, withdraw)
4. **Future-proof**: v0.5 tracks counterparty PnL, v1 will track LP inventory PnL (same account)

**Trade-offs Considered**:
- ✅ **Chosen**: Portfolio-to-Portfolio (simple, reusable, v1-compatible)
- ❌ **Rejected**: Vault-based (wrong architecture - Vault is for SPL tokens, not SOL)
- ❌ **Rejected**: Cross-slab routing (too complex - requires splitting PnL across multiple DLP Portfolios)

### Implementation Details

#### Router Program Changes

**File**: `programs/router/src/entrypoint.rs`

**Account Layout Update** (execute_cross_slab):
```rust
// BEFORE (v0 - No Settlement)
// 0. user_portfolio
// 1. user_authority
// 2. vault              ← REMOVED (not needed for SOL)
// 3. registry
// 4. router_authority
// 5+ slabs, receipts, oracles

// AFTER (v0.5 - Real Settlement)
// 0. user_portfolio
// 1. user_authority
// 2. dlp_portfolio      ← NEW: Counterparty
// 3. registry
// 4. router_authority
// 5. system_program     ← NEW: For SOL transfers
// 6+ slabs, receipts, oracles
```

**File**: `programs/router/src/instructions/execute_cross_slab.rs`

**Settlement Logic**:
```rust
fn settle_pnl(
    user_portfolio_account: &AccountInfo,
    user_portfolio: &mut Portfolio,
    dlp_portfolio_account: &AccountInfo,
    dlp_portfolio: &mut Portfolio,
    system_program: &AccountInfo,
    realized_pnl: i128,
) -> Result<(), PercolatorError> {
    // Update accounting
    user_portfolio.pnl += realized_pnl;
    dlp_portfolio.pnl -= realized_pnl;

    // Real SOL transfer via System Program CPI
    if realized_pnl > 0 {
        // User won → DLP pays
        transfer_sol(dlp → user)
    } else {
        // User lost → User pays DLP
        transfer_sol(user → dlp)
    }
}
```

**Single-Slab Enforcement**:
```rust
// v0.5 Limitation: Only single slab execution
if slab_accounts.len() != 1 {
    msg!("Error: v0 only supports single slab execution");
    return Err(PercolatorError::InvalidInstruction);
}
```

#### SDK Changes

**File**: `sdk/src/clients/RouterClient.ts`

**New Method**: `getDlpOwnerForSlab()`
```typescript
async getDlpOwnerForSlab(slabMarket: PublicKey): Promise<PublicKey | null> {
  const accountInfo = await this.connection.getAccountInfo(slabMarket);
  // Slab header layout: discriminator(8) + lp_owner(32) + ...
  const lpOwnerBytes = accountInfo.data.slice(8, 40);
  return new PublicKey(lpOwnerBytes);
}
```

**Updated Method**: `buildExecuteCrossSlabInstruction()`
```typescript
buildExecuteCrossSlabInstruction(
  user: PublicKey,
  splits: SlabSplit[],
  orderType: ExecutionType = ExecutionType.Limit
): TransactionInstruction {
  // v0.5: Single slab only
  if (splits.length !== 1) {
    throw new Error('v0.5 only supports single slab execution');
  }

  // Derive DLP Portfolio from slab.lp_owner
  const [dlpPortfolioPDA] = this.derivePortfolioPDA(splits[0].dlpOwner);

  // Build account list
  const keys = [
    { pubkey: userPortfolioPDA, isSigner: false, isWritable: true },
    { pubkey: user, isSigner: true, isWritable: false },
    { pubkey: dlpPortfolioPDA, isSigner: false, isWritable: true },  // NEW
    { pubkey: registryPDA, isSigner: false, isWritable: true },
    { pubkey: authorityPDA, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },  // NEW
    // ... slabs, receipts, oracles
  ];
}
```

**Auto-Fetch in Buy/Sell**:
```typescript
async buildBuyInstruction(...) {
  const oracleAccount = await this.getOracleForSlab(slabMarket);
  const dlpOwner = await this.getDlpOwnerForSlab(slabMarket);  // NEW

  const split: SlabSplit = {
    slabMarket,
    side: 0,
    qty: quantity,
    limitPx: limitPrice,
    oracle: oracleAccount,
    dlpOwner,  // NEW: Required for v0.5
  };
}
```

**Type Update**: `sdk/src/types/router.ts`
```typescript
export interface SlabSplit {
  slabMarket: PublicKey;
  side: number;
  qty: BN;
  limitPx: BN;
  oracle: PublicKey;
  dlpOwner?: PublicKey;  // NEW: Required for v0.5 PnL settlement
}
```

#### CLI Changes

**No changes needed** - CLI uses SDK methods which now auto-fetch DLP owner.

#### Documentation Updates

**Files Modified**:
- `thoughts/DLP_LOCALNET_SETUP_GUIDE.md` - Updated for v0.5 counterparty model
- `thoughts/LOCALNET_DEPLOYMENT_GUIDE.md` - Added PnL settlement section
- `cli-client/src/index.ts` - Updated v0 limitations help text

**Key DLP Documentation**:
- Capital requirements: Min 10 SOL, recommended 100+ SOL
- Setup: Portfolio auto-created on first deposit
- Risk: Zero-sum game - DLP takes opposite side of all trader positions
- Commands: Same as traders (deposit, portfolio, withdraw)

### Zero-Sum Settlement Model

**Trader Profit Example**:
1. Trader opens long position at $100, closes at $110 → +$10 profit
2. Router calculates: `realized_pnl = +10 (in lamports)`
3. Settlement executes:
   - `user_portfolio.pnl += 10`
   - `dlp_portfolio.pnl -= 10`
   - Transfer 10 SOL: DLP Portfolio → User Portfolio (via System Program CPI)

**Trader Loss Example**:
1. Trader opens long position at $100, closes at $90 → -$10 loss
2. Router calculates: `realized_pnl = -10`
3. Settlement executes:
   - `user_portfolio.pnl -= 10`
   - `dlp_portfolio.pnl += 10`
   - Transfer 10 SOL: User Portfolio → DLP Portfolio

### Single-Slab Limitation (v0.5)

**Why cross-slab routing is disabled**:

**Problem**: Each slab has a different `lp_owner` (different DLP Portfolio).

**Example**:
- Route $100 trade across 2 slabs: SlabA ($60) + SlabB ($40)
- SlabA.lp_owner = DLP_A
- SlabB.lp_owner = DLP_B
- Realized PnL = +$10

**Question**: Who pays the $10?
- DLP_A pays $6? DLP_B pays $4? (Pro-rata by split)
- Both pay $10? (Overpayment)
- First slab pays all? (Unfair)

**Solution for v0.5**: Enforce single-slab execution → single DLP counterparty → simple settlement.

**v1 Order Book**: Cross-slab routing re-enabled because PnL comes from matched orders (traders vs traders), not DLP Portfolios.

### Migration Path to v1

**Zero Breaking Changes**:

**v0.5 (Counterparty Model)**:
- DLP creates Portfolio
- Portfolio.pnl = Net counterparty PnL
- Settlement: User ↔ DLP Portfolio

**v1 (Order Book Model)**:
- Same DLP Portfolio account
- Portfolio.pnl = LP inventory PnL (mark-to-market on LP positions)
- Settlement: User ↔ Matched traders (via order book)

**Key Insight**: Portfolio serves dual purpose:
1. v0.5: Tracks DLP's counterparty exposure
2. v1: Tracks DLP's LP inventory exposure

Same account, same fields, different usage pattern.

### Files Modified

**Router Program**:
- `programs/router/src/entrypoint.rs` - Account layout update
- `programs/router/src/instructions/execute_cross_slab.rs` - Settlement implementation

**SDK**:
- `sdk/src/clients/RouterClient.ts` - DLP lookup + instruction building
- `sdk/src/types/router.ts` - SlabSplit type update

**CLI**:
- `cli-client/src/index.ts` - Help text update

**Documentation**:
- `thoughts/DLP_LOCALNET_SETUP_GUIDE.md` - Complete rewrite for v0.5
- `thoughts/LOCALNET_DEPLOYMENT_GUIDE.md` - Added PnL section
- `thoughts/PROJECT_DEVELOPMENT_HISTORY.md` - This phase
- `thoughts/V1_ROADMAP.md` - Updated settlement migration notes

### Impact Summary

**Breaking Changes**:
- ❌ Cross-slab routing disabled (v0.5 limitation)
- ❌ `--slab` flag now required in buy/sell commands
- ❌ Vault account removed from execute_cross_slab

**New Capabilities**:
- ✅ Real PnL settlement with SOL transfers
- ✅ DLP counterparty model functional
- ✅ DLPs can use trader CLI for portfolio management
- ✅ Zero-sum profit/loss settlement working
- ✅ Single-slab execution enforced

**User Experience**:

**DLP Setup (v0.5)**:
```bash
# Create DLP Portfolio + deposit capital (auto-created)
barista deposit --amount 100000000000 --keypair ~/.config/solana/dlp-wallet.json

# Create slab (links to DLP via lp_owner)
percolator-keeper slab create --lp-owner <DLP_PUBKEY> ...

# Monitor DLP exposure
barista portfolio --keypair ~/.config/solana/dlp-wallet.json
# Shows:
#   Principal: 100 SOL
#   PnL: -5 SOL (if traders are winning)
#   Equity: 95 SOL
```

**Trader Flow (No Changes)**:
```bash
# Traders don't need to know about DLP settlement
barista buy --slab <SLAB> -q 1000
# Behind the scenes:
# 1. SDK fetches slab.lp_owner → DLP address
# 2. Derives DLP Portfolio PDA
# 3. Passes DLP Portfolio to router instruction
# 4. Settlement transfers SOL between portfolios
```

### Technical Lessons

1. **Architecture Reuse**: Same Portfolio for traders + DLPs = massive simplification
2. **Future-Proofing**: Design v0.5 with v1 migration in mind = zero breaking changes
3. **Constraint Propagation**: Single-slab limitation in v0.5 → cleaner architecture
4. **Auto-Fetching**: SDK hides complexity (DLP lookup, oracle lookup) from CLI users
5. **Zero-Sum Validation**: User profit = DLP loss (verified in formal model)

---

## Future Enhancements

Based on TODO markers and documentation:

1. **Program IDs**: Replace placeholders with deployed addresses
2. **Switchboard**: Add third oracle provider
3. **LP Commands**: Implement liquidity provider operations
4. **Portfolio Leverage Display**: Show current effective leverage
5. **Max Buy Helper**: `barista max-buy` command
6. **Keeper Monitoring**: Add system health checks
7. **Advanced Orders**: Stop-loss, take-profit (v1+)
8. **Router Initialization CLI**: Add to TypeScript CLI or document Rust CLI usage

---

**Document Generated**: 2025-10-26
**Commits Analyzed**: 54+ (all by Sean)
**Time Period**: Initial commit → Current HEAD
**Latest Update**: Upstream integration, portfolio UX improvements
