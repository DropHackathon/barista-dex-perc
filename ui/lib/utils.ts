import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import BN from 'bn.js';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format utilities copied from cli-client/src/utils/display.ts
 * These handle BN amounts with proper decimal scaling
 */

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
 * Get explorer URL for transaction
 */
export function getExplorerUrl(signature: string, network: string = 'devnet'): string {
  const cluster = network === 'mainnet-beta' ? '' : `?cluster=${network}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

/**
 * Truncate public key for display
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Parse amount string to BN with decimals
 */
export function parseAmount(amount: string, decimals: number = 6): BN {
  const [whole, frac = ''] = amount.split('.');
  const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals);
  return new BN(whole + fracPadded);
}
