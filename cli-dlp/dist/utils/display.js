"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatSol = formatSol;
exports.formatSolWithSuffix = formatSolWithSuffix;
exports.formatPercent = formatPercent;
exports.formatPnl = formatPnl;
exports.formatPubkey = formatPubkey;
exports.formatSignature = formatSignature;
exports.displaySuccess = displaySuccess;
exports.displayError = displayError;
exports.displayWarning = displayWarning;
exports.displayInfo = displayInfo;
exports.formatRiskLevel = formatRiskLevel;
exports.formatTimeAgo = formatTimeAgo;
const chalk_1 = __importDefault(require("chalk"));
/**
 * Format lamports to SOL with decimal places
 */
function formatSol(lamports, decimals = 1) {
    const lamportsNum = typeof lamports === 'number' ? lamports : Number(lamports.toString());
    const sol = lamportsNum / 1000000000;
    return sol.toFixed(decimals);
}
/**
 * Format SOL amount with proper suffix
 */
function formatSolWithSuffix(lamports) {
    return `${formatSol(lamports)} SOL`;
}
/**
 * Format percentage
 */
function formatPercent(value, decimals = 2) {
    return `${(value * 100).toFixed(decimals)}%`;
}
/**
 * Format PnL with color
 */
function formatPnl(pnl, includeColor = true) {
    const pnlNum = typeof pnl === 'number' ? pnl : Number(pnl.toString());
    const sign = pnlNum > 0 ? '+' : pnlNum < 0 ? '' : '';
    const formatted = `${sign}${formatSolWithSuffix(pnlNum)}`;
    if (!includeColor)
        return formatted;
    if (pnlNum > 0) {
        return chalk_1.default.green(formatted);
    }
    else if (pnlNum < 0) {
        return chalk_1.default.red(formatted);
    }
    else {
        return chalk_1.default.gray(formatted);
    }
}
/**
 * Format public key (shortened)
 */
function formatPubkey(pubkey, chars = 8) {
    if (pubkey.length <= chars * 2)
        return pubkey;
    return `${pubkey.slice(0, chars)}...${pubkey.slice(-chars)}`;
}
/**
 * Format transaction signature
 */
function formatSignature(signature, chars = 8) {
    return formatPubkey(signature, chars);
}
/**
 * Display success message
 */
function displaySuccess(message) {
    console.log(chalk_1.default.green('✓'), message);
}
/**
 * Display error message
 */
function displayError(message) {
    console.log(chalk_1.default.red('✗'), message);
}
/**
 * Display warning message
 */
function displayWarning(message) {
    console.log(chalk_1.default.yellow('⚠'), message);
}
/**
 * Display info message
 */
function displayInfo(message) {
    console.log(chalk_1.default.blue('ℹ'), message);
}
/**
 * Format risk level with color
 */
function formatRiskLevel(riskRatio) {
    if (riskRatio < 0.05) {
        return chalk_1.default.green('LOW');
    }
    else if (riskRatio < 0.1) {
        return chalk_1.default.yellow('MODERATE');
    }
    else if (riskRatio < 0.2) {
        return chalk_1.default.red('HIGH');
    }
    else {
        return chalk_1.default.red.bold('CRITICAL');
    }
}
/**
 * Format time ago
 */
function formatTimeAgo(timestamp) {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    if (diff < 60)
        return `${Math.floor(diff)}s ago`;
    if (diff < 3600)
        return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)
        return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}
//# sourceMappingURL=display.js.map