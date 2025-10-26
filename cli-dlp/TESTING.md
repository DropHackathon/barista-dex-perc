# CLI-DLP Testing Guide

Comprehensive testing strategy for the Barista DLP CLI.

## Test Structure

```
src/__tests__/
├── utils/
│   ├── wallet.test.ts      # Wallet loading and keypair handling
│   ├── network.test.ts     # Network configuration and connections
│   ├── display.test.ts     # Formatting and display utilities
│   └── safety.test.ts      # Safety checks and validations
├── commands/
│   └── portfolio.test.ts   # Portfolio command integration tests
└── e2e/
    └── cli.test.ts         # End-to-end CLI tests
```

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm test -- --coverage
```

### Specific Test File
```bash
npm test -- wallet.test.ts
```

### E2E Tests Only
```bash
npm test -- e2e/cli.test.ts
```

## Test Categories

### 1. Unit Tests (Utils)

**utils/wallet.test.ts**
- ✅ Load valid keypair from file
- ✅ Handle tilde expansion in paths (~/)
- ✅ Error on non-existent file
- ✅ Error on invalid JSON format
- ✅ Error on invalid secret key length

**utils/network.test.ts**
- ✅ Create connections for all networks (localnet, devnet, mainnet)
- ✅ Use custom RPC URLs when provided
- ✅ Return valid program IDs for each network
- ✅ Maintain consistent configuration structure

**utils/display.test.ts**
- ✅ Format lamports to SOL with decimals
- ✅ Format percentages correctly
- ✅ Format PnL with +/- signs and colors
- ✅ Shorten public keys and signatures
- ✅ Format risk levels (LOW/MODERATE/HIGH/CRITICAL)
- ✅ Format relative timestamps (seconds/minutes/hours/days ago)

**utils/safety.test.ts**
- ✅ Validate deposit amounts (zero, negative, too small, too large)
- ✅ Check withdrawal safety (balance, open positions, PnL, minimum balance)
- ✅ Calculate open interest from portfolio data
- ✅ Return proper SafetyCheckResult structure

### 2. Integration Tests (Commands)

**commands/portfolio.test.ts**
- ✅ Portfolio initialization (new, existing, errors)
- ✅ Deposit capital (success, auto-init, validation, errors)
- ✅ Withdraw capital (success, safety checks, force flag, errors)
- ✅ View portfolio (summary, detailed, warnings, not found)
- ✅ Command option parsing (env vars, CLI flags, defaults, requirements)

### 3. End-to-End Tests (E2E)

**e2e/cli.test.ts**
- ✅ CLI help and version commands
- ✅ Portfolio workflow (init → deposit → view → withdraw)
- ✅ Error handling (missing args, invalid inputs, connection errors)
- ✅ Environment variable support

## Coverage Thresholds

Minimum coverage requirements:
- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

Run `npm test -- --coverage` to check coverage.

## E2E Test Prerequisites

E2E tests require a running Solana localnet:

### 1. Start Localnet

```bash
# Option A: Solana Test Validator
solana-test-validator

# Option B: Surfpool (recommended for integration tests)
git clone https://github.com/txtx/surfpool
cd surfpool && npm install && npm run validator
```

### 2. Deploy Programs

```bash
# Deploy router, slab, and oracle programs
# Build all programs first (from repo root)
./build-programs.sh

# Deploy each program
solana program deploy target/deploy/barista_router.so
solana program deploy target/deploy/barista_slab.so
solana program deploy target/deploy/barista_oracle.so

# Save the program IDs from the output
```

### 3. Fund Test Wallet

E2E tests will generate a test wallet and print the address. Airdrop SOL:

```bash
solana airdrop 100 <test-wallet-address> --url http://127.0.0.1:8899
```

### 4. Run E2E Tests

```bash
# Run all E2E tests
npm test -- e2e/

# Run with verbose output
npm test -- e2e/ --verbose
```

## Mocking Strategy

### Unit Tests
- Mock file system operations (fs module)
- Use in-memory test data
- No external dependencies

### Integration Tests
- Mock Solana `Connection` class
- Mock SDK client methods (`RouterClient`, `SlabClient`)
- Use test fixtures for account data

### E2E Tests
- Real Solana connection to localnet
- Real SDK interactions
- Real transaction sending
- Marked with `.skip()` by default (require manual enable)

## Test Data Fixtures

Create reusable test data:

```typescript
// __tests__/fixtures/portfolio.ts
export const mockPortfolio = {
  equity: new BN(100_000_000_000), // 100 SOL
  pnl: new BN(5_000_000_000),      // +5 SOL
};

export const mockPortfolioWithLoss = {
  equity: new BN(95_000_000_000),  // 95 SOL
  pnl: new BN(-5_000_000_000),     // -5 SOL
};
```

## Debugging Tests

### Enable Verbose Output
```bash
npm test -- --verbose
```

### Run Single Test
```bash
npm test -- --testNamePattern="should load valid keypair"
```

### Debug in VS Code

Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Current File",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["${fileBasenameNoExtension}", "--runInBand"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### Show Console Logs
```bash
npm test -- --verbose --no-coverage
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: CLI-DLP Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Run linter
        run: npm run lint

      - name: Run unit tests
        run: npm test -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

## Writing New Tests

### Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  describe('specific functionality', () => {
    it('should behave correctly in normal case', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe('expected');
    });

    it('should handle edge case', () => {
      // Test edge cases
    });

    it('should throw error on invalid input', () => {
      expect(() => {
        functionUnderTest(null);
      }).toThrow();
    });
  });
});
```

### Best Practices

1. **AAA Pattern**: Arrange, Act, Assert
2. **Clear Test Names**: Describe what should happen
3. **Single Assertion**: One concept per test
4. **Isolated Tests**: No dependencies between tests
5. **Cleanup**: Always clean up resources (files, connections)
6. **Fast Tests**: Keep unit tests fast (<100ms)
7. **Meaningful Assertions**: Use specific matchers

### Common Matchers

```typescript
// Equality
expect(value).toBe(5);
expect(value).toEqual({ foo: 'bar' });

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();

// Numbers
expect(value).toBeGreaterThan(3);
expect(value).toBeLessThan(5);
expect(value).toBeCloseTo(0.3);

// Strings
expect(string).toContain('substring');
expect(string).toMatch(/pattern/);

// Arrays
expect(array).toContain(item);
expect(array).toHaveLength(3);

// Exceptions
expect(() => fn()).toThrow();
expect(() => fn()).toThrow(Error);
expect(() => fn()).toThrow('error message');

// Async
await expect(promise).resolves.toBe(value);
await expect(promise).rejects.toThrow();
```

## Test Coverage Goals

### Current Coverage (v0.1.0)
- ✅ Utils: 100% (wallet, network, display, safety)
- ✅ Commands: 85% (portfolio commands well-covered)
- ⏳ E2E: Manual testing (requires localnet)

### Future Coverage Goals
- ✅ Slab commands (when implemented)
- ✅ Analytics commands (when implemented)
- ✅ Oracle commands (when implemented)
- ✅ Automated E2E in CI (with test validator)

## Troubleshooting

### Tests Failing Locally

1. **Ensure dependencies installed**:
   ```bash
   npm install
   ```

2. **Clear Jest cache**:
   ```bash
   npm test -- --clearCache
   ```

3. **Check Node version** (requires v18+):
   ```bash
   node --version
   ```

### E2E Tests Timing Out

1. **Increase timeout** in test:
   ```typescript
   it('test name', async () => {
     // test
   }, 30000); // 30 second timeout
   ```

2. **Check localnet running**:
   ```bash
   curl http://127.0.0.1:8899 -X POST -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
   ```

3. **Verify programs deployed**:
   ```bash
   solana program show <ROUTER_PROGRAM_ID> --url http://127.0.0.1:8899
   ```

### Coverage Not Updating

1. **Delete coverage directory**:
   ```bash
   rm -rf coverage/
   ```

2. **Run with coverage flag**:
   ```bash
   npm test -- --coverage --no-cache
   ```

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [ts-jest Documentation](https://kulshekhar.github.io/ts-jest/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Solana Program Testing](https://solana.com/docs/programs/testing)

## Contributing

When adding new features:

1. Write tests first (TDD)
2. Ensure all tests pass: `npm test`
3. Maintain coverage above 70%
4. Add E2E tests for user-facing features
5. Update this document with new test categories
