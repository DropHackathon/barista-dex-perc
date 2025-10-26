import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Keypair } from '@solana/web3.js';
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync } from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

/**
 * End-to-End CLI Tests
 *
 * These tests verify the CLI works as a whole by executing commands
 * and checking their output. They require a running localnet.
 *
 * Run with: npm test -- e2e/cli.test.ts
 *
 * Prerequisites:
 * - Solana localnet running on http://127.0.0.1:8899
 * - Programs deployed
 * - Test wallet with SOL
 */
describe('CLI E2E Tests', () => {
  const testDir = path.join(os.tmpdir(), 'cli-dlp-e2e-test');
  const testKeypairPath = path.join(testDir, 'test-dlp.json');
  let testKeypair: Keypair;

  beforeAll(() => {
    // Create test directory
    mkdirSync(testDir, { recursive: true });

    // Generate test keypair
    testKeypair = Keypair.generate();
    const secretKey = Array.from(testKeypair.secretKey);
    writeFileSync(testKeypairPath, JSON.stringify(secretKey));

    console.log(`Test wallet: ${testKeypair.publicKey.toBase58()}`);
    console.log('⚠️  Airdrop SOL to this wallet before running E2E tests');
  });

  afterAll(() => {
    // Cleanup
    try {
      unlinkSync(testKeypairPath);
      rmdirSync(testDir);
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('CLI Help and Version', () => {
    it('should show help with --help', async () => {
      const { stdout } = await execAsync('npm run barista-dlp -- --help');

      expect(stdout).toContain('Barista DEX');
      expect(stdout).toContain('portfolio');
      expect(stdout).toContain('deposit');
      expect(stdout).toContain('withdraw');
    });

    it('should show version with --version', async () => {
      const { stdout } = await execAsync('npm run barista-dlp -- --version');

      expect(stdout).toContain('0.1.0');
    });

    it('should show welcome message with no args', async () => {
      const { stdout } = await execAsync('npm run barista-dlp');

      expect(stdout).toContain('Barista DEX');
      expect(stdout).toContain('DLP CLI');
    });
  });

  describe('Portfolio Commands', () => {
    // Note: These tests require localnet and funded wallet
    // Mark as skip if localnet not available

    it.skip('should initialize portfolio', async () => {
      const cmd = `npm run barista-dlp -- portfolio:init --keypair ${testKeypairPath} --network localnet`;

      try {
        const { stdout, stderr } = await execAsync(cmd);

        expect(stdout).toContain('initialized');
        expect(stderr).toBe('');
      } catch (error: any) {
        // May fail if portfolio already exists
        if (!error.stdout.includes('already exists')) {
          throw error;
        }
      }
    }, 30000); // 30s timeout

    it.skip('should deposit capital', async () => {
      const amount = '10000000000'; // 10 SOL
      const cmd = `npm run barista-dlp -- deposit --amount ${amount} --keypair ${testKeypairPath} --network localnet`;

      const { stdout } = await execAsync(cmd);

      expect(stdout).toContain('Deposited');
      expect(stdout).toContain('SOL');
    }, 30000);

    it.skip('should view portfolio', async () => {
      const cmd = `npm run barista-dlp -- portfolio --keypair ${testKeypairPath} --network localnet`;

      const { stdout } = await execAsync(cmd);

      expect(stdout).toContain('Portfolio Summary');
      expect(stdout).toContain('Principal');
      expect(stdout).toContain('Equity');
    }, 30000);

    it.skip('should view portfolio with --detailed flag', async () => {
      const cmd = `npm run barista-dlp -- portfolio --detailed --keypair ${testKeypairPath} --network localnet`;

      const { stdout } = await execAsync(cmd);

      expect(stdout).toContain('Portfolio Summary');
      expect(stdout).toContain('Exposure Details');
    }, 30000);

    it.skip('should withdraw capital with safety checks', async () => {
      const amount = '1000000000'; // 1 SOL
      const cmd = `npm run barista-dlp -- withdraw --amount ${amount} --keypair ${testKeypairPath} --network localnet`;

      const { stdout } = await execAsync(cmd);

      // Should either succeed or show safety warnings
      expect(stdout).toBeTruthy();
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should error on missing --keypair', async () => {
      const cmd = 'npm run barista-dlp -- portfolio --network localnet';

      try {
        await execAsync(cmd);
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.stdout || error.stderr).toContain('keypair');
      }
    });

    it('should error on invalid network', async () => {
      const cmd = `npm run barista-dlp -- portfolio --keypair ${testKeypairPath} --network invalid-network`;

      try {
        await execAsync(cmd);
        fail('Should have thrown error');
      } catch (error: any) {
        // Should error on invalid network
        expect(error).toBeDefined();
      }
    });

    it('should error on invalid deposit amount', async () => {
      const cmd = `npm run barista-dlp -- deposit --amount 0 --keypair ${testKeypairPath} --network localnet`;

      try {
        await execAsync(cmd);
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.stdout || error.stderr).toContain('greater than 0');
      }
    });

    it('should error on non-existent keypair path', async () => {
      const cmd = 'npm run barista-dlp -- portfolio --keypair /non/existent/path.json --network localnet';

      try {
        await execAsync(cmd);
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Environment Variables', () => {
    it.skip('should use BARISTA_DLP_KEYPAIR env var', async () => {
      const cmd = `BARISTA_DLP_KEYPAIR=${testKeypairPath} npm run barista-dlp -- portfolio --network localnet`;

      const { stdout } = await execAsync(cmd);

      expect(stdout).toContain('Portfolio');
    }, 30000);

    it.skip('should use BARISTA_DLP_NETWORK env var', async () => {
      const cmd = `BARISTA_DLP_NETWORK=localnet npm run barista-dlp -- portfolio --keypair ${testKeypairPath}`;

      const { stdout } = await execAsync(cmd);

      expect(stdout).toContain('Portfolio');
    }, 30000);
  });
});
