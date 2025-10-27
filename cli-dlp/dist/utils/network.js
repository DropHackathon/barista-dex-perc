"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRpcUrl = getRpcUrl;
exports.getProgramIds = getProgramIds;
exports.createConnection = createConnection;
exports.getNetworkConfig = getNetworkConfig;
const web3_js_1 = require("@solana/web3.js");
const sdk_1 = require("@barista-dex/sdk");
/**
 * Get RPC URL for network
 * Uses SDK constants which support ENV variable overrides for localnet
 */
function getRpcUrl(network, customUrl) {
    if (customUrl) {
        return customUrl;
    }
    return (0, sdk_1.getRpcEndpoint)(network);
}
/**
 * Get program IDs for network
 * Uses SDK constants which support ENV variable overrides for localnet
 */
function getProgramIds(network) {
    return {
        routerProgramId: sdk_1.ROUTER_PROGRAM_IDS[network],
        slabProgramId: sdk_1.SLAB_PROGRAM_IDS[network],
    };
}
/**
 * Create connection to Solana cluster
 */
function createConnection(network, customUrl) {
    const rpcUrl = getRpcUrl(network, customUrl);
    return new web3_js_1.Connection(rpcUrl, 'confirmed');
}
/**
 * Get network config
 */
function getNetworkConfig(network, customUrl) {
    const rpcUrl = getRpcUrl(network, customUrl);
    const { routerProgramId, slabProgramId } = getProgramIds(network);
    return {
        name: network,
        rpcUrl,
        routerProgramId,
        slabProgramId,
    };
}
//# sourceMappingURL=network.js.map