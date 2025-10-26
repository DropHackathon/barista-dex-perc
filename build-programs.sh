#!/bin/bash
# Build Solana BPF programs individually to avoid test dependency issues

set -e

echo "Building Barista DEX programs for Solana BPF..."
echo ""

# Build router
echo "Building router program..."
cargo build-sbf --manifest-path programs/router/Cargo.toml

# Build slab
echo "Building slab program..."
cargo build-sbf --manifest-path programs/slab/Cargo.toml

# Build oracle
echo "Building oracle program..."
cargo build-sbf --manifest-path programs/oracle/Cargo.toml

# Build AMM
echo "Building AMM program..."
cargo build-sbf --manifest-path programs/amm/Cargo.toml

echo ""
echo "✓ All programs built successfully!"
echo "Program binaries are in target/deploy/"
