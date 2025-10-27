"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeU32 = serializeU32;
exports.serializeU64 = serializeU64;
exports.serializeU128 = serializeU128;
exports.serializeI64 = serializeI64;
exports.serializeI128 = serializeI128;
exports.serializeBool = serializeBool;
exports.serializePubkey = serializePubkey;
exports.deserializeU64 = deserializeU64;
exports.deserializeU128 = deserializeU128;
exports.deserializeI64 = deserializeI64;
exports.deserializeI128 = deserializeI128;
exports.deserializeBool = deserializeBool;
exports.deserializePubkey = deserializePubkey;
exports.createInstructionData = createInstructionData;
const bn_js_1 = __importDefault(require("bn.js"));
const web3_js_1 = require("@solana/web3.js");
/**
 * Serialize a u32 (4 bytes, little-endian)
 */
function serializeU32(value) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value);
    return buf;
}
/**
 * Serialize a u64 (8 bytes, little-endian)
 */
function serializeU64(value) {
    const bn = new bn_js_1.default(value);
    const buf = Buffer.alloc(8);
    bn.toArrayLike(Buffer, 'le', 8).copy(buf);
    return buf;
}
/**
 * Serialize a u128 (16 bytes, little-endian)
 */
function serializeU128(value) {
    const bn = new bn_js_1.default(value);
    const buf = Buffer.alloc(16);
    bn.toArrayLike(Buffer, 'le', 16).copy(buf);
    return buf;
}
/**
 * Serialize an i64 (8 bytes, little-endian, two's complement)
 */
function serializeI64(value) {
    const bn = new bn_js_1.default(value);
    const buf = Buffer.alloc(8);
    if (bn.isNeg()) {
        // Two's complement for negative numbers
        const positive = bn.abs();
        const complement = new bn_js_1.default(1).shln(64).sub(positive);
        complement.toArrayLike(Buffer, 'le', 8).copy(buf);
    }
    else {
        bn.toArrayLike(Buffer, 'le', 8).copy(buf);
    }
    return buf;
}
/**
 * Serialize an i128 (16 bytes, little-endian, two's complement)
 */
function serializeI128(value) {
    const bn = new bn_js_1.default(value);
    const buf = Buffer.alloc(16);
    if (bn.isNeg()) {
        // Two's complement for negative numbers
        const positive = bn.abs();
        const complement = new bn_js_1.default(1).shln(128).sub(positive);
        complement.toArrayLike(Buffer, 'le', 16).copy(buf);
    }
    else {
        bn.toArrayLike(Buffer, 'le', 16).copy(buf);
    }
    return buf;
}
/**
 * Serialize a boolean (1 byte)
 */
function serializeBool(value) {
    return Buffer.from([value ? 1 : 0]);
}
/**
 * Serialize a PublicKey (32 bytes)
 */
function serializePubkey(pubkey) {
    return pubkey.toBuffer();
}
/**
 * Deserialize a u64 (8 bytes, little-endian)
 */
function deserializeU64(buffer, offset = 0) {
    return new bn_js_1.default(buffer.slice(offset, offset + 8), 'le');
}
/**
 * Deserialize a u128 (16 bytes, little-endian)
 */
function deserializeU128(buffer, offset = 0) {
    return new bn_js_1.default(buffer.slice(offset, offset + 16), 'le');
}
/**
 * Deserialize an i64 (8 bytes, little-endian, two's complement)
 */
function deserializeI64(buffer, offset = 0) {
    const bytes = buffer.slice(offset, offset + 8);
    const value = new bn_js_1.default(bytes, 'le');
    // Check if negative (sign bit set)
    if (bytes[7] & 0x80) {
        // Convert from two's complement
        return value.sub(new bn_js_1.default(1).shln(64));
    }
    return value;
}
/**
 * Deserialize an i128 (16 bytes, little-endian, two's complement)
 */
function deserializeI128(buffer, offset = 0) {
    const bytes = buffer.slice(offset, offset + 16);
    const value = new bn_js_1.default(bytes, 'le');
    // Check if negative (sign bit set - bit 127 = byte 15, bit 7)
    if (bytes[15] & 0x80) {
        // Convert from two's complement
        return value.sub(new bn_js_1.default(1).shln(128));
    }
    return value;
}
/**
 * Deserialize a boolean (1 byte)
 */
function deserializeBool(buffer, offset = 0) {
    return buffer[offset] !== 0;
}
/**
 * Deserialize a PublicKey (32 bytes)
 */
function deserializePubkey(buffer, offset = 0) {
    return new web3_js_1.PublicKey(buffer.slice(offset, offset + 32));
}
/**
 * Create instruction data buffer with discriminator
 */
function createInstructionData(discriminator, ...parts) {
    const discBuf = Buffer.from([discriminator]);
    return Buffer.concat([discBuf, ...parts]);
}
