import BN from 'bn.js';
import { Portfolio } from '@barista-dex/sdk';
import chalk from 'chalk';

/**
 * Safety check result
 */
export interface SafetyCheckResult {
  safe: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Check if withdrawal is safe
 */
export function checkWithdrawalSafety(
  portfolio: Portfolio,
  withdrawAmount: BN
): SafetyCheckResult {
  const result: SafetyCheckResult = {
    safe: true,
    warnings: [],
    errors: [],
  };

  // Check 1: Portfolio has sufficient balance
  const equity = new BN(portfolio.equity.toString());
  if (equity.lt(withdrawAmount)) {
    result.safe = false;
    result.errors.push(
      `Insufficient balance: Portfolio equity is ${equity.toString()} lamports, but withdrawal is ${withdrawAmount.toString()} lamports`
    );
    return result;
  }

  // Check 2: Open positions
  const openInterest = calculateOpenInterest(portfolio);
  if (openInterest > 0) {
    result.safe = false;
    result.errors.push(
      `Cannot withdraw with open positions. Open interest: ${openInterest} (${portfolio.exposure_count} exposures)`
    );
    return result;
  }

  // Check 3: Unrealized PnL
  const unrealizedPnl = new BN(portfolio.pnl.toString());
  if (!unrealizedPnl.isZero()) {
    result.warnings.push(
      `Portfolio has unrealized PnL: ${unrealizedPnl.toString()} lamports`
    );
  }

  // Check 4: Capital utilization after withdrawal
  const equityAfter = equity.sub(withdrawAmount);
  const safetyBuffer = withdrawAmount.mul(new BN(10)).div(new BN(100)); // 10% buffer

  if (equityAfter.lt(safetyBuffer)) {
    result.warnings.push(
      `Low remaining balance after withdrawal: ${equityAfter.toString()} lamports`
    );
  }

  // Check 5: Minimum capital threshold
  const minCapital = new BN(10_000_000_000); // 10 SOL
  if (equityAfter.lt(minCapital)) {
    result.warnings.push(
      `Remaining capital below recommended minimum (10 SOL): ${equityAfter.toString()} lamports`
    );
  }

  return result;
}

/**
 * Check deposit amount
 */
export function checkDepositAmount(amount: BN): SafetyCheckResult {
  const result: SafetyCheckResult = {
    safe: true,
    warnings: [],
    errors: [],
  };

  // Check minimum deposit
  const minDeposit = new BN(1_000_000_000); // 1 SOL
  if (amount.lt(minDeposit)) {
    result.warnings.push(
      'Deposit amount is less than 1 SOL. Consider depositing more for meaningful liquidity.'
    );
  }

  // Check recommended minimum
  const recMinDeposit = new BN(10_000_000_000); // 10 SOL
  if (amount.lt(recMinDeposit)) {
    result.warnings.push(
      'Deposit amount is below recommended minimum (10 SOL) for testing.'
    );
  }

  return result;
}

/**
 * Calculate open interest from portfolio exposures
 */
export function calculateOpenInterest(portfolio: Portfolio): number {
  let totalOpenInterest = 0;

  // Sum up absolute values of all exposures
  for (let i = 0; i < portfolio.exposure_count; i++) {
    const exposure = portfolio.exposures[i];
    if (exposure) {
      // exposure[2] is the qty field (position_qty)
      totalOpenInterest += Math.abs(Number(exposure[2]));
    }
  }

  return totalOpenInterest;
}

/**
 * Calculate risk ratio (unrealized PnL / equity)
 */
export function calculateRiskRatio(portfolio: Portfolio): number {
  const equity = Number(portfolio.equity.toString());
  if (equity === 0) return 0;

  const unrealizedPnl = Math.abs(Number(portfolio.pnl.toString()));
  return unrealizedPnl / equity;
}

/**
 * Display safety check results
 */
export function displaySafetyResults(result: SafetyCheckResult): void {
  // Display errors
  for (const error of result.errors) {
    console.log(chalk.red('✗'), error);
  }

  // Display warnings
  for (const warning of result.warnings) {
    console.log(chalk.yellow('⚠'), warning);
  }

  // Display success if safe and no warnings
  if (result.safe && result.warnings.length === 0) {
    console.log(chalk.green('✓'), 'Safety checks passed');
  }
}
