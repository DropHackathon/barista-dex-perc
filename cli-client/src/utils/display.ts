import BN from 'bn.js';
import chalk from 'chalk';

/**
 * Format a BN amount with decimals
 * Handles negative numbers correctly (e.g., -35.544057, not -35.-544057)
 */
export function formatAmount(amount: BN, decimals: number = 6): string {
  const divisor = new BN(10).pow(new BN(decimals));
  const isNegative = amount.isNeg();
  const absAmount = amount.abs();

  const whole = absAmount.div(divisor);
  const frac = absAmount.mod(divisor);

  const fracStr = frac.toString().padStart(decimals, '0');
  const sign = isNegative ? '-' : '';
  return `${sign}${whole.toString()}.${fracStr}`;
}

/**
 * Format SOL amount (lamports, 9 decimals)
 */
export function formatSol(amount: BN): string {
  return formatAmount(amount, 9);
}

/**
 * Format price (default 6 decimals)
 */
export function formatPrice(price: BN): string {
  return formatAmount(price, 6);
}

/**
 * Calculate and format spread percentage
 */
export function calculateSpread(bid: BN, ask: BN): string {
  if (bid.isZero()) return '0.00';

  const spread = ask.sub(bid);
  const percentage = spread.mul(new BN(10000)).div(bid).toNumber() / 100;
  return percentage.toFixed(2);
}

/**
 * Format Solana signature for display (full signature)
 */
export function formatSignature(signature: string): string {
  return signature;
}

/**
 * Format public key for display (full address)
 */
export function formatPublicKey(pubkey: string): string {
  return pubkey;
}

/**
 * Get explorer URL for transaction
 */
export function getExplorerUrl(signature: string, network: string = 'devnet'): string {
  const cluster = network === 'mainnet-beta' ? '' : `?cluster=${network}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

/**
 * Display success message
 */
export function displaySuccess(message: string): void {
  console.log(chalk.green(`✅ ${message}`));
}

/**
 * Display error message
 */
export function displayError(message: string): void {
  console.error(chalk.red(`❌ ${message}`));
}

/**
 * Display info message
 */
export function displayInfo(message: string): void {
  console.log(chalk.blue(`ℹ ${message}`));
}

/**
 * Display warning message
 */
export function displayWarning(message: string): void {
  console.log(chalk.yellow(`⚠ ${message}`));
}
