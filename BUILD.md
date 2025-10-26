# Building Barista DEX Programs

This guide explains how to build the Solana programs for Barista DEX.

## Prerequisites

- Rust 1.70+
- Solana CLI 1.18+ (for `cargo build-sbf` command)

Install Solana CLI:
```bash
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
```

Verify installation:
```bash
solana --version
cargo build-sbf --version
```

## Building Programs

### Quick Build (Recommended)

Use the provided build script:

```bash
./build-programs.sh
```

This builds all four programs:
- Router (`programs/router`)
- Slab (`programs/slab`)
- Oracle (`programs/oracle`)
- AMM (`programs/amm`)

Output files will be in `target/deploy/`:
- `barista_router.so`
- `barista_slab.so`
- `barista_oracle.so`
- `barista_amm.so`

### Manual Build

Build each program individually to avoid workspace dependency issues:

```bash
# Router program
cargo build-sbf --manifest-path programs/router/Cargo.toml

# Slab program
cargo build-sbf --manifest-path programs/slab/Cargo.toml

# Oracle program
cargo build-sbf --manifest-path programs/oracle/Cargo.toml

# AMM program
cargo build-sbf --manifest-path programs/amm/Cargo.toml
```

### Why Build Individually?

The workspace includes test crates (`tests/integration`, `tests/e2e`) that depend on `solana-program-test`, which has dependencies (`getrandom`, `ahash`) that don't support the Solana BPF target. Building programs individually avoids this issue.

## Native Build (for tests)

To build native Rust (not BPF) for running tests:

```bash
cargo build --lib
```

Or run tests directly:

```bash
cargo test --lib
```

## Deploying Programs

After building, deploy to localnet:

```bash
# Start localnet
solana-test-validator --reset

# Deploy programs
solana program deploy target/deploy/barista_router.so
solana program deploy target/deploy/barista_slab.so
solana program deploy target/deploy/barista_oracle.so
solana program deploy target/deploy/barista_amm.so
```

Save the program IDs from the output - you'll need them for configuration.

## Common Issues

### `error: no such command: build-sbf`

**Solution**: Install Solana CLI tools:
```bash
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
```

### `getrandom` target not supported

**Solution**: This happens when building the entire workspace. Use the build script or build programs individually:
```bash
./build-programs.sh
```

### Profile warnings

You may see:
```
warning: profiles for the non root package will be ignored
```

This is safe to ignore - it's due to program-specific profiles that are overridden by workspace settings.

## See Also

- [Makefile](Makefile) - Additional build targets
- [LOCALNET_TRADING_SIMULATOR_GUIDE](thoughts/LOCALNET_TRADING_SIMULATOR_GUIDE.md) - Full setup guide
- [keeper/README.md](keeper/README.md) - Keeper binary for oracle management
