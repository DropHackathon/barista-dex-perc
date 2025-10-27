"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadKeypair = loadKeypair;
exports.getDefaultKeypairPath = getDefaultKeypairPath;
const web3_js_1 = require("@solana/web3.js");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
/**
 * Load keypair from file path
 * Supports both absolute and relative paths, with ~ expansion
 */
function loadKeypair(keypairPath) {
    // Expand ~ to home directory
    if (keypairPath.startsWith('~')) {
        keypairPath = path_1.default.join(os_1.default.homedir(), keypairPath.slice(1));
    }
    // Resolve to absolute path
    const absolutePath = path_1.default.resolve(keypairPath);
    // Check if file exists
    if (!fs_1.default.existsSync(absolutePath)) {
        throw new Error(`Keypair file not found: ${absolutePath}`);
    }
    // Read and parse keypair
    try {
        const keypairData = JSON.parse(fs_1.default.readFileSync(absolutePath, 'utf-8'));
        // Handle both array format [1,2,3...] and Uint8Array
        const secretKey = Uint8Array.from(keypairData);
        return web3_js_1.Keypair.fromSecretKey(secretKey);
    }
    catch (error) {
        throw new Error(`Failed to load keypair from ${absolutePath}: ${error}`);
    }
}
/**
 * Get default keypair path (Solana CLI default)
 */
function getDefaultKeypairPath() {
    return path_1.default.join(os_1.default.homedir(), '.config', 'solana', 'id.json');
}
//# sourceMappingURL=wallet.js.map