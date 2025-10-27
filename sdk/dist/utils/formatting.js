"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatAmount = formatAmount;
exports.parseAmount = parseAmount;
exports.formatHealth = formatHealth;
exports.formatPrice = formatPrice;
exports.truncatePubkey = truncatePubkey;
exports.formatTimestamp = formatTimestamp;
exports.formatUsd = formatUsd;
exports.toBasisPoints = toBasisPoints;
exports.formatBasisPoints = formatBasisPoints;
const bn_js_1 = __importDefault(require("bn.js"));
/**
 * Format amount with decimals (e.g., 1000000 with 6 decimals -> "1.000000")
 */
function formatAmount(amount, decimals) {
    const str = amount.toString().padStart(decimals + 1, '0');
    const integerPart = str.slice(0, -decimals) || '0';
    const decimalPart = str.slice(-decimals);
    return `${integerPart}.${decimalPart}`;
}
/**
 * Parse amount with decimals (e.g., "1.5" with 6 decimals -> 1500000)
 */
function parseAmount(amountStr, decimals) {
    const [integerPart, decimalPart = ''] = amountStr.split('.');
    const paddedDecimal = decimalPart.padEnd(decimals, '0').slice(0, decimals);
    const combined = integerPart + paddedDecimal;
    return new bn_js_1.default(combined);
}
/**
 * Format health ratio as percentage (e.g., 1050000 -> "105.00%")
 */
function formatHealth(health) {
    const healthNum = health.toNumber() / 1e6;
    return `${healthNum.toFixed(2)}%`;
}
/**
 * Format price with market decimals
 */
function formatPrice(price, quoteDecimals, baseDecimals) {
    const priceDecimals = quoteDecimals - baseDecimals;
    return formatAmount(price, priceDecimals);
}
/**
 * Format public key for display (returns full address)
 * Note: Previously truncated, now returns full pubkey for better UX
 */
function truncatePubkey(pubkey, length) {
    // Return full pubkey - 'length' parameter kept for backward compatibility
    return pubkey;
}
/**
 * Format timestamp to ISO string
 */
function formatTimestamp(timestamp) {
    return new Date(timestamp.toNumber() * 1000).toISOString();
}
/**
 * Format USD value (6 decimals)
 */
function formatUsd(value) {
    return `$${formatAmount(value, 6)}`;
}
/**
 * Calculate basis points (e.g., 0.05% -> 5 bps)
 */
function toBasisPoints(value) {
    return Math.round(value * 10000);
}
/**
 * Format basis points as percentage
 */
function formatBasisPoints(bps) {
    return `${(bps / 100).toFixed(2)}%`;
}
