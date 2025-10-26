import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync } from 'fs';
import { loadKeypair } from '../../utils/wallet';
import { Keypair } from '@solana/web3.js';
import * as path from 'path';
import * as os from 'os';

describe('Wallet Utils', () => {
  const testDir = path.join(os.tmpdir(), 'cli-dlp-test');
  const testKeypairPath = path.join(testDir, 'test-keypair.json');

  beforeEach(() => {
    // Create test directory
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    try {
      unlinkSync(testKeypairPath);
      rmdirSync(testDir);
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('loadKeypair', () => {
    it('should load a valid keypair from file', () => {
      // Generate and save a test keypair
      const testKeypair = Keypair.generate();
      const secretKey = Array.from(testKeypair.secretKey);
      writeFileSync(testKeypairPath, JSON.stringify(secretKey));

      // Load it
      const loaded = loadKeypair(testKeypairPath);

      expect(loaded.publicKey.toBase58()).toBe(testKeypair.publicKey.toBase58());
    });

    it('should handle tilde expansion in path', () => {
      // This test assumes home directory exists
      const homeDir = os.homedir();
      const relativePath = path.relative(homeDir, testKeypairPath);
      const tildeePath = `~/${relativePath}`;

      // Generate and save keypair
      const testKeypair = Keypair.generate();
      const secretKey = Array.from(testKeypair.secretKey);
      writeFileSync(testKeypairPath, JSON.stringify(secretKey));

      // Load with tilde path
      const loaded = loadKeypair(tildeePath);

      expect(loaded.publicKey.toBase58()).toBe(testKeypair.publicKey.toBase58());
    });

    it('should throw error for non-existent file', () => {
      expect(() => {
        loadKeypair('/non/existent/path/keypair.json');
      }).toThrow();
    });

    it('should throw error for invalid keypair format', () => {
      // Write invalid JSON
      writeFileSync(testKeypairPath, 'invalid json');

      expect(() => {
        loadKeypair(testKeypairPath);
      }).toThrow();
    });

    it('should throw error for invalid secret key length', () => {
      // Write array with wrong length
      writeFileSync(testKeypairPath, JSON.stringify([1, 2, 3]));

      expect(() => {
        loadKeypair(testKeypairPath);
      }).toThrow();
    });
  });
});
