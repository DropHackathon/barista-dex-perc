import BN from 'bn.js';
import { Portfolio } from '@barista-dex/sdk';
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
export declare function checkWithdrawalSafety(portfolio: Portfolio, withdrawAmount: BN): SafetyCheckResult;
/**
 * Check deposit amount
 */
export declare function checkDepositAmount(amount: BN): SafetyCheckResult;
/**
 * Calculate open interest from portfolio exposures
 */
export declare function calculateOpenInterest(portfolio: Portfolio): number;
/**
 * Calculate risk ratio (unrealized PnL / equity)
 */
export declare function calculateRiskRatio(portfolio: Portfolio): number;
/**
 * Display safety check results
 */
export declare function displaySafetyResults(result: SafetyCheckResult): void;
//# sourceMappingURL=safety.d.ts.map