"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderType = exports.OrderSide = exports.SlabInstruction = void 0;
/**
 * Slab instruction discriminators
 */
var SlabInstruction;
(function (SlabInstruction) {
    SlabInstruction[SlabInstruction["Initialize"] = 0] = "Initialize";
    SlabInstruction[SlabInstruction["CommitFill"] = 1] = "CommitFill";
})(SlabInstruction || (exports.SlabInstruction = SlabInstruction = {}));
/**
 * Order side
 */
var OrderSide;
(function (OrderSide) {
    OrderSide[OrderSide["Bid"] = 0] = "Bid";
    OrderSide[OrderSide["Ask"] = 1] = "Ask";
})(OrderSide || (exports.OrderSide = OrderSide = {}));
/**
 * Order type
 */
var OrderType;
(function (OrderType) {
    OrderType[OrderType["Limit"] = 0] = "Limit";
    OrderType[OrderType["PostOnly"] = 1] = "PostOnly";
    OrderType[OrderType["ImmediateOrCancel"] = 2] = "ImmediateOrCancel";
    OrderType[OrderType["FillOrKill"] = 3] = "FillOrKill";
})(OrderType || (exports.OrderType = OrderType = {}));
