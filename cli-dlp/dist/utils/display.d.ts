import BN from 'bn.js';
/**
 * Format lamports to SOL with decimal places
 */
export declare function formatSol(lamports: BN | number | bigint, decimals?: number): string;
/**
 * Format SOL amount with proper suffix
 */
export declare function formatSolWithSuffix(lamports: BN | number | bigint): string;
/**
 * Format percentage
 */
export declare function formatPercent(value: number, decimals?: number): string;
/**
 * Format PnL with color
 */
export declare function formatPnl(pnl: BN | number | bigint | string, includeColor?: boolean): string;
/**
 * Format public key (shortened)
 */
export declare function formatPubkey(pubkey: string, chars?: number): string;
/**
 * Format transaction signature
 */
export declare function formatSignature(signature: string, chars?: number): string;
/**
 * Display success message
 */
export declare function displaySuccess(message: string): void;
/**
 * Display error message
 */
export declare function displayError(message: string): void;
/**
 * Display warning message
 */
export declare function displayWarning(message: string): void;
/**
 * Display info message
 */
export declare function displayInfo(message: string): void;
/**
 * Format risk level with color
 */
export declare function formatRiskLevel(riskRatio: number): string;
/**
 * Format time ago
 */
export declare function formatTimeAgo(timestamp: number): string;
//# sourceMappingURL=display.d.ts.map