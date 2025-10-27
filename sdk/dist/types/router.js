"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionType = exports.VenueKind = exports.RouterInstruction = void 0;
/**
 * Router instruction discriminators
 * IMPORTANT: These must match programs/router/src/entrypoint.rs exactly
 */
var RouterInstruction;
(function (RouterInstruction) {
    RouterInstruction[RouterInstruction["Initialize"] = 0] = "Initialize";
    RouterInstruction[RouterInstruction["InitializePortfolio"] = 1] = "InitializePortfolio";
    RouterInstruction[RouterInstruction["Deposit"] = 2] = "Deposit";
    RouterInstruction[RouterInstruction["Withdraw"] = 3] = "Withdraw";
    RouterInstruction[RouterInstruction["ExecuteCrossSlab"] = 4] = "ExecuteCrossSlab";
    RouterInstruction[RouterInstruction["LiquidateUser"] = 5] = "LiquidateUser";
    RouterInstruction[RouterInstruction["BurnLpShares"] = 6] = "BurnLpShares";
    RouterInstruction[RouterInstruction["CancelLpOrders"] = 7] = "CancelLpOrders";
})(RouterInstruction || (exports.RouterInstruction = RouterInstruction = {}));
/**
 * Venue kind enum
 */
var VenueKind;
(function (VenueKind) {
    VenueKind[VenueKind["Slab"] = 0] = "Slab";
    VenueKind[VenueKind["Amm"] = 1] = "Amm";
})(VenueKind || (exports.VenueKind = VenueKind = {}));
/**
 * Execution type enum (for oracle-validated fills)
 */
var ExecutionType;
(function (ExecutionType) {
    ExecutionType[ExecutionType["Market"] = 0] = "Market";
    ExecutionType[ExecutionType["Limit"] = 1] = "Limit";
})(ExecutionType || (exports.ExecutionType = ExecutionType = {}));
