import BN from 'bn.js';
import { PublicKey } from '@solana/web3.js';
/**
 * Serialize a u32 (4 bytes, little-endian)
 */
export declare function serializeU32(value: number): Buffer;
/**
 * Serialize a u64 (8 bytes, little-endian)
 */
export declare function serializeU64(value: BN | number): Buffer;
/**
 * Serialize a u128 (16 bytes, little-endian)
 */
export declare function serializeU128(value: BN | number): Buffer;
/**
 * Serialize an i64 (8 bytes, little-endian, two's complement)
 */
export declare function serializeI64(value: BN | number): Buffer;
/**
 * Serialize an i128 (16 bytes, little-endian, two's complement)
 */
export declare function serializeI128(value: BN | number): Buffer;
/**
 * Serialize a boolean (1 byte)
 */
export declare function serializeBool(value: boolean): Buffer;
/**
 * Serialize a PublicKey (32 bytes)
 */
export declare function serializePubkey(pubkey: PublicKey): Buffer;
/**
 * Deserialize a u64 (8 bytes, little-endian)
 */
export declare function deserializeU64(buffer: Buffer, offset?: number): BN;
/**
 * Deserialize a u128 (16 bytes, little-endian)
 */
export declare function deserializeU128(buffer: Buffer, offset?: number): BN;
/**
 * Deserialize an i64 (8 bytes, little-endian, two's complement)
 */
export declare function deserializeI64(buffer: Buffer, offset?: number): BN;
/**
 * Deserialize an i128 (16 bytes, little-endian, two's complement)
 */
export declare function deserializeI128(buffer: Buffer, offset?: number): BN;
/**
 * Deserialize a boolean (1 byte)
 */
export declare function deserializeBool(buffer: Buffer, offset?: number): boolean;
/**
 * Deserialize a PublicKey (32 bytes)
 */
export declare function deserializePubkey(buffer: Buffer, offset?: number): PublicKey;
/**
 * Create instruction data buffer with discriminator
 */
export declare function createInstructionData(discriminator: number, ...parts: Buffer[]): Buffer;
