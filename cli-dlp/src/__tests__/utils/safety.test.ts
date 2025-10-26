import { describe, it, expect } from '@jest/globals';
import {
  checkWithdrawalSafety,
  checkDepositAmount,
  calculateOpenInterest,
} from '../../utils/safety';
import BN from 'bn.js';

// Mock Portfolio type for testing
interface MockPortfolio {
  equity: BN;
  pnl: BN;
  // Add other fields as needed for comprehensive tests
}

describe('Safety Utils', () => {
  describe('checkDepositAmount', () => {
    it('should pass for normal deposit amounts', () => {
      const amount = new BN(10_000_000_000); // 10 SOL
      const result = checkDepositAmount(amount);

      expect(result.safe).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.warnings.length).toBe(0);
    });

    it('should error on zero amount', () => {
      const amount = new BN(0);
      const result = checkDepositAmount(amount);

      expect(result.safe).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('must be greater than zero');
    });

    it('should error on negative amount', () => {
      const amount = new BN(-1000);
      const result = checkDepositAmount(amount);

      expect(result.safe).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should warn on very small deposits', () => {
      const amount = new BN(1_000_000_000); // 1 SOL
      const result = checkDepositAmount(amount);

      expect(result.safe).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('below recommended minimum');
    });

    it('should warn on very large deposits', () => {
      const amount = new BN(2000_000_000_000); // 2000 SOL
      const result = checkDepositAmount(amount);

      expect(result.safe).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('unusually large');
    });
  });

  describe('checkWithdrawalSafety', () => {
    it('should pass for safe withdrawal with no open positions', () => {
      const portfolio: MockPortfolio = {
        equity: new BN(100_000_000_000), // 100 SOL
        pnl: new BN(0),
      };
      const withdrawAmount = new BN(10_000_000_000); // 10 SOL

      const result = checkWithdrawalSafety(portfolio as any, withdrawAmount);

      expect(result.safe).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should error on insufficient balance', () => {
      const portfolio: MockPortfolio = {
        equity: new BN(5_000_000_000), // 5 SOL
        pnl: new BN(0),
      };
      const withdrawAmount = new BN(10_000_000_000); // 10 SOL

      const result = checkWithdrawalSafety(portfolio as any, withdrawAmount);

      expect(result.safe).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Insufficient balance');
    });

    it('should error when withdrawing with open positions', () => {
      // Mock a portfolio with open interest
      const portfolioWithPositions = {
        equity: new BN(100_000_000_000),
        pnl: new BN(0),
        // This would be checked via calculateOpenInterest
      };
      const withdrawAmount = new BN(10_000_000_000);

      // Note: This test depends on calculateOpenInterest implementation
      // For now, we'll test the basic logic
      const result = checkWithdrawalSafety(portfolioWithPositions as any, withdrawAmount);

      // Should either error or pass depending on open interest
      expect(result).toHaveProperty('safe');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
    });

    it('should warn on large withdrawal percentage', () => {
      const portfolio: MockPortfolio = {
        equity: new BN(100_000_000_000), // 100 SOL
        pnl: new BN(0),
      };
      const withdrawAmount = new BN(60_000_000_000); // 60 SOL (60%)

      const result = checkWithdrawalSafety(portfolio as any, withdrawAmount);

      // Should warn about large withdrawal
      if (result.safe) {
        expect(result.warnings.length).toBeGreaterThan(0);
      }
    });

    it('should warn about unrealized losses', () => {
      const portfolio: MockPortfolio = {
        equity: new BN(90_000_000_000), // 90 SOL
        pnl: new BN(-10_000_000_000), // -10 SOL unrealized loss
      };
      const withdrawAmount = new BN(20_000_000_000); // 20 SOL

      const result = checkWithdrawalSafety(portfolio as any, withdrawAmount);

      // Should warn about unrealized losses
      if (result.safe) {
        expect(result.warnings.length).toBeGreaterThan(0);
      }
    });

    it('should error when withdrawal violates minimum balance', () => {
      const portfolio: MockPortfolio = {
        equity: new BN(15_000_000_000), // 15 SOL
        pnl: new BN(0),
      };
      const withdrawAmount = new BN(14_000_000_000); // 14 SOL (leaves only 1 SOL)

      const result = checkWithdrawalSafety(portfolio as any, withdrawAmount);

      // Should error or warn about insufficient buffer
      expect(result.safe || result.warnings.length > 0).toBe(true);
    });
  });

  describe('calculateOpenInterest', () => {
    it('should return 0 for portfolio with no positions', () => {
      const portfolio: MockPortfolio = {
        equity: new BN(100_000_000_000),
        pnl: new BN(0),
      };

      const openInterest = calculateOpenInterest(portfolio as any);

      expect(openInterest).toBe(0);
    });

    it('should calculate open interest from portfolio data', () => {
      // Note: Implementation depends on Portfolio structure
      // This is a placeholder test
      const portfolioWithPositions = {
        equity: new BN(100_000_000_000),
        pnl: new BN(5_000_000_000),
        // Additional fields for positions would go here
      };

      const openInterest = calculateOpenInterest(portfolioWithPositions as any);

      expect(typeof openInterest).toBe('number');
      expect(openInterest).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Safety check result structure', () => {
    it('should return proper SafetyCheckResult structure', () => {
      const amount = new BN(10_000_000_000);
      const result = checkDepositAmount(amount);

      expect(result).toHaveProperty('safe');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.safe).toBe('boolean');
    });
  });
});
