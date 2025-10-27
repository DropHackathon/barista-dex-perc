"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkWithdrawalSafety = checkWithdrawalSafety;
exports.checkDepositAmount = checkDepositAmount;
exports.calculateOpenInterest = calculateOpenInterest;
exports.calculateRiskRatio = calculateRiskRatio;
exports.displaySafetyResults = displaySafetyResults;
const bn_js_1 = __importDefault(require("bn.js"));
const chalk_1 = __importDefault(require("chalk"));
/**
 * Check if withdrawal is safe
 */
function checkWithdrawalSafety(portfolio, withdrawAmount) {
    const result = {
        safe: true,
        warnings: [],
        errors: [],
    };
    // Check 1: Portfolio has sufficient balance
    const equity = new bn_js_1.default(portfolio.equity.toString());
    if (equity.lt(withdrawAmount)) {
        result.safe = false;
        result.errors.push(`Insufficient balance: Portfolio equity is ${equity.toString()} lamports, but withdrawal is ${withdrawAmount.toString()} lamports`);
        return result;
    }
    // Check 2: Open positions
    const openInterest = calculateOpenInterest(portfolio);
    if (openInterest > 0) {
        result.safe = false;
        result.errors.push(`Cannot withdraw with open positions. Open interest: ${openInterest} (${portfolio.exposureCount} exposures)`);
        return result;
    }
    // Check 3: Unrealized PnL
    const unrealizedPnl = new bn_js_1.default(portfolio.pnl.toString());
    if (!unrealizedPnl.isZero()) {
        result.warnings.push(`Portfolio has unrealized PnL: ${unrealizedPnl.toString()} lamports`);
    }
    // Check 4: Large withdrawal percentage
    const withdrawalPercentage = withdrawAmount.mul(new bn_js_1.default(100)).div(equity);
    if (withdrawalPercentage.gt(new bn_js_1.default(50))) {
        result.warnings.push(`Withdrawing ${withdrawalPercentage.toString()}% of portfolio equity`);
    }
    // Check 5: Capital utilization after withdrawal
    const equityAfter = equity.sub(withdrawAmount);
    const safetyBuffer = withdrawAmount.mul(new bn_js_1.default(10)).div(new bn_js_1.default(100)); // 10% buffer
    if (equityAfter.lt(safetyBuffer)) {
        result.warnings.push(`Low remaining balance after withdrawal: ${equityAfter.toString()} lamports`);
    }
    // Check 6: Minimum capital threshold
    const minCapital = new bn_js_1.default(10000000000); // 10 SOL
    if (equityAfter.lt(minCapital)) {
        result.warnings.push(`Remaining capital below recommended minimum (10 SOL): ${equityAfter.toString()} lamports`);
    }
    return result;
}
/**
 * Check deposit amount
 */
function checkDepositAmount(amount) {
    const result = {
        safe: true,
        warnings: [],
        errors: [],
    };
    // Check for zero or negative
    if (amount.lte(new bn_js_1.default(0))) {
        result.safe = false;
        result.errors.push('Deposit amount must be greater than zero');
        return result;
    }
    // Check minimum deposit
    const minDeposit = new bn_js_1.default(1000000000); // 1 SOL
    if (amount.lt(minDeposit)) {
        result.warnings.push('Deposit amount is less than 1 SOL. Consider depositing more for meaningful liquidity.');
    }
    // Check recommended minimum
    const recMinDeposit = new bn_js_1.default(10000000000); // 10 SOL
    if (amount.lt(recMinDeposit)) {
        result.warnings.push('Deposit amount is below recommended minimum (10 SOL) for testing.');
    }
    // Check for unusually large deposits (> 1,000 SOL)
    const maxWarningDeposit = new bn_js_1.default(1000000000000); // 1,000 SOL
    if (amount.gt(maxWarningDeposit)) {
        result.warnings.push('Deposit amount is unusually large. Please verify the amount.');
    }
    return result;
}
/**
 * Calculate open interest from portfolio exposures
 */
function calculateOpenInterest(portfolio) {
    let totalOpenInterest = 0;
    // Sum up absolute values of all exposures
    for (let i = 0; i < portfolio.exposureCount; i++) {
        const exposure = portfolio.exposures[i];
        if (exposure) {
            // exposure.positionQty is the position_qty field
            totalOpenInterest += Math.abs(Number(exposure.positionQty));
        }
    }
    return totalOpenInterest;
}
/**
 * Calculate risk ratio (unrealized PnL / equity)
 */
function calculateRiskRatio(portfolio) {
    const equity = Number(portfolio.equity.toString());
    if (equity === 0)
        return 0;
    const unrealizedPnl = Math.abs(Number(portfolio.pnl.toString()));
    return unrealizedPnl / equity;
}
/**
 * Display safety check results
 */
function displaySafetyResults(result) {
    // Display errors
    for (const error of result.errors) {
        console.log(chalk_1.default.red('✗'), error);
    }
    // Display warnings
    for (const warning of result.warnings) {
        console.log(chalk_1.default.yellow('⚠'), warning);
    }
    // Display success if safe and no warnings
    if (result.safe && result.warnings.length === 0) {
        console.log(chalk_1.default.green('✓'), 'Safety checks passed');
    }
}
//# sourceMappingURL=safety.js.map