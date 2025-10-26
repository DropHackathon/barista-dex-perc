import chalk from 'chalk';
import BN from 'bn.js';

/**
 * Format lamports to SOL with decimal places
 */
export function formatSol(lamports: BN | number | bigint, decimals = 1): string {
  const lamportsNum = typeof lamports === 'number' ? lamports : Number(lamports.toString());
  const sol = lamportsNum / 1_000_000_000;
  return sol.toFixed(decimals);
}

/**
 * Format SOL amount with proper suffix
 */
export function formatSolWithSuffix(lamports: BN | number | bigint): string {
  return `${formatSol(lamports)} SOL`;
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format PnL with color
 */
export function formatPnl(pnl: BN | number | bigint | string, includeColor = true): string {
  const pnlNum = typeof pnl === 'number' ? pnl : Number(pnl.toString());
  const formatted = `${pnlNum >= 0 ? '+' : ''}${formatSolWithSuffix(pnlNum)}`;

  if (!includeColor) return formatted;

  if (pnlNum > 0) {
    return chalk.green(formatted);
  } else if (pnlNum < 0) {
    return chalk.red(formatted);
  } else {
    return chalk.gray(formatted);
  }
}

/**
 * Format public key (shortened)
 */
export function formatPubkey(pubkey: string, chars = 8): string {
  if (pubkey.length <= chars * 2) return pubkey;
  return `${pubkey.slice(0, chars)}...${pubkey.slice(-chars)}`;
}

/**
 * Format transaction signature
 */
export function formatSignature(signature: string, chars = 8): string {
  return formatPubkey(signature, chars);
}

/**
 * Display success message
 */
export function displaySuccess(message: string): void {
  console.log(chalk.green('✓'), message);
}

/**
 * Display error message
 */
export function displayError(message: string): void {
  console.log(chalk.red('✗'), message);
}

/**
 * Display warning message
 */
export function displayWarning(message: string): void {
  console.log(chalk.yellow('⚠'), message);
}

/**
 * Display info message
 */
export function displayInfo(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}

/**
 * Format risk level with color
 */
export function formatRiskLevel(riskRatio: number): string {
  if (riskRatio < 0.05) {
    return chalk.green('LOW');
  } else if (riskRatio < 0.1) {
    return chalk.yellow('MODERATE');
  } else if (riskRatio < 0.2) {
    return chalk.red('HIGH');
  } else {
    return chalk.red.bold('CRITICAL');
  }
}

/**
 * Format time ago
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
