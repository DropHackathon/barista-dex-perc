import BN from 'bn.js';
/**
 * Format amount with decimals (e.g., 1000000 with 6 decimals -> "1.000000")
 */
export declare function formatAmount(amount: BN, decimals: number): string;
/**
 * Parse amount with decimals (e.g., "1.5" with 6 decimals -> 1500000)
 */
export declare function parseAmount(amountStr: string, decimals: number): BN;
/**
 * Format health ratio as percentage (e.g., 1050000 -> "105.00%")
 */
export declare function formatHealth(health: BN): string;
/**
 * Format price with market decimals
 */
export declare function formatPrice(price: BN, quoteDecimals: number, baseDecimals: number): string;
/**
 * Format public key for display (returns full address)
 * Note: Previously truncated, now returns full pubkey for better UX
 */
export declare function truncatePubkey(pubkey: string, length?: number): string;
/**
 * Format timestamp to ISO string
 */
export declare function formatTimestamp(timestamp: BN): string;
/**
 * Format USD value (6 decimals)
 */
export declare function formatUsd(value: BN): string;
/**
 * Calculate basis points (e.g., 0.05% -> 5 bps)
 */
export declare function toBasisPoints(value: number): number;
/**
 * Format basis points as percentage
 */
export declare function formatBasisPoints(bps: number): string;
