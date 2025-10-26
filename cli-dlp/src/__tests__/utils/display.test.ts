import { describe, it, expect } from '@jest/globals';
import {
  formatSol,
  formatSolWithSuffix,
  formatPercent,
  formatPnl,
  formatPubkey,
  formatSignature,
  formatRiskLevel,
  formatTimeAgo,
} from '../../utils/display';
import BN from 'bn.js';

describe('Display Utils', () => {
  describe('formatSol', () => {
    it('should format lamports to SOL with default decimals', () => {
      expect(formatSol(1_000_000_000)).toBe('1.0');
      expect(formatSol(500_000_000)).toBe('0.5');
      expect(formatSol(1_500_000_000)).toBe('1.5');
    });

    it('should handle BN input', () => {
      expect(formatSol(new BN(1_000_000_000))).toBe('1.0');
    });

    it('should handle bigint input', () => {
      expect(formatSol(1_000_000_000n)).toBe('1.0');
    });

    it('should format with custom decimals', () => {
      expect(formatSol(1_234_567_890, 2)).toBe('1.23');
      expect(formatSol(1_234_567_890, 4)).toBe('1.2346');
    });

    it('should handle zero', () => {
      expect(formatSol(0)).toBe('0.0');
    });

    it('should handle large amounts', () => {
      expect(formatSol(1_000_000_000_000)).toBe('1000.0');
    });
  });

  describe('formatSolWithSuffix', () => {
    it('should append SOL suffix', () => {
      expect(formatSolWithSuffix(1_000_000_000)).toBe('1.0 SOL');
      expect(formatSolWithSuffix(500_000_000)).toBe('0.5 SOL');
    });
  });

  describe('formatPercent', () => {
    it('should format decimal to percentage', () => {
      expect(formatPercent(0.1)).toBe('10.00%');
      expect(formatPercent(0.5)).toBe('50.00%');
      expect(formatPercent(1.0)).toBe('100.00%');
    });

    it('should format with custom decimals', () => {
      expect(formatPercent(0.12345, 0)).toBe('12%');
      expect(formatPercent(0.12345, 1)).toBe('12.3%');
      expect(formatPercent(0.12345, 4)).toBe('12.3450%');
    });

    it('should handle zero', () => {
      expect(formatPercent(0)).toBe('0.00%');
    });
  });

  describe('formatPnl', () => {
    it('should format positive PnL with plus sign', () => {
      const result = formatPnl(1_000_000_000, false);
      expect(result).toContain('+');
      expect(result).toContain('1.0 SOL');
    });

    it('should format negative PnL with minus sign', () => {
      const result = formatPnl(-1_000_000_000, false);
      expect(result).toContain('-');
      expect(result).toContain('1.0 SOL');
    });

    it('should format zero without sign', () => {
      const result = formatPnl(0, false);
      expect(result).not.toContain('+');
      expect(result).not.toContain('-');
    });

    it('should handle BN input', () => {
      const result = formatPnl(new BN(1_000_000_000), false);
      expect(result).toContain('+1.0 SOL');
    });

    it('should handle bigint input', () => {
      const result = formatPnl(1_000_000_000n, false);
      expect(result).toContain('+1.0 SOL');
    });

    it('should handle string input', () => {
      const result = formatPnl('1000000000', false);
      expect(result).toContain('+1.0 SOL');
    });

    // Note: Color tests would require testing ANSI codes
    // which is complex. We test the logic with includeColor=false
  });

  describe('formatPubkey', () => {
    it('should shorten long public keys', () => {
      const pubkey = '7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJeK';
      const result = formatPubkey(pubkey, 4);
      expect(result).toBe('7EqQ...wJeK');
    });

    it('should use default 8 chars if not specified', () => {
      const pubkey = '7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJeK';
      const result = formatPubkey(pubkey);
      expect(result).toBe('7EqQdEUL...pvcMwJeK');
    });

    it('should return full string if shorter than threshold', () => {
      const short = 'short';
      expect(formatPubkey(short, 8)).toBe('short');
    });
  });

  describe('formatSignature', () => {
    it('should format signatures like pubkeys', () => {
      const sig = '5j8dqXJBZYg1v5cjTQG8pBEGTQm3gKZmP3qxEqZ6YXvJ8TGr6HCqvKkKjU5r7QkPv8u2qTZJhL3xU6tCmPrYjk9Z';
      const result = formatSignature(sig, 6);
      expect(result).toContain('...');
    });
  });

  describe('formatRiskLevel', () => {
    it('should return LOW for low risk ratios', () => {
      const result = formatRiskLevel(0.03);
      expect(result).toContain('LOW');
    });

    it('should return MODERATE for moderate risk ratios', () => {
      const result = formatRiskLevel(0.07);
      expect(result).toContain('MODERATE');
    });

    it('should return HIGH for high risk ratios', () => {
      const result = formatRiskLevel(0.15);
      expect(result).toContain('HIGH');
    });

    it('should return CRITICAL for critical risk ratios', () => {
      const result = formatRiskLevel(0.25);
      expect(result).toContain('CRITICAL');
    });

    it('should handle boundary values correctly', () => {
      expect(formatRiskLevel(0.05)).toContain('MODERATE');
      expect(formatRiskLevel(0.1)).toContain('HIGH');
      expect(formatRiskLevel(0.2)).toContain('CRITICAL');
    });
  });

  describe('formatTimeAgo', () => {
    it('should format seconds ago', () => {
      const now = Date.now() / 1000;
      const timestamp = now - 30;
      expect(formatTimeAgo(timestamp)).toBe('30s ago');
    });

    it('should format minutes ago', () => {
      const now = Date.now() / 1000;
      const timestamp = now - 120;
      expect(formatTimeAgo(timestamp)).toBe('2m ago');
    });

    it('should format hours ago', () => {
      const now = Date.now() / 1000;
      const timestamp = now - 7200;
      expect(formatTimeAgo(timestamp)).toBe('2h ago');
    });

    it('should format days ago', () => {
      const now = Date.now() / 1000;
      const timestamp = now - 172800;
      expect(formatTimeAgo(timestamp)).toBe('2d ago');
    });

    it('should round down to nearest unit', () => {
      const now = Date.now() / 1000;
      const timestamp = now - 90;
      expect(formatTimeAgo(timestamp)).toBe('1m ago');
    });
  });
});
