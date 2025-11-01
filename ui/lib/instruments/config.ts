import { PublicKey } from '@solana/web3.js';

export interface InstrumentMetadata {
  symbol: string;          // "SOL-PERP"
  baseAsset: string;       // "SOL"
  quoteAsset: string;      // "USD"
  tvSymbol: string;        // "BINANCE:SOLUSDT"
  displayName: string;     // "Solana Perpetual"
}

/**
 * Get instrument metadata
 * For localnet: All instruments are SOL-PERP by default
 * For devnet/mainnet: Would need proper mapping
 */
export function getInstrumentMetadata(
  instrumentPubkey: string | PublicKey,
  network: string = 'localnet'
): InstrumentMetadata {
  // For localnet, assume all instruments are SOL
  if (network === 'localnet') {
    return {
      symbol: 'SOL-PERP',
      baseAsset: 'SOL',
      quoteAsset: 'USD',
      tvSymbol: 'BINANCE:SOLUSDT',
      displayName: 'Solana Perpetual',
    };
  }

  // For other networks, would need proper mapping
  // TODO: Implement devnet/mainnet mappings
  return {
    symbol: 'SOL-PERP',
    baseAsset: 'SOL',
    quoteAsset: 'USD',
    tvSymbol: 'BINANCE:SOLUSDT',
    displayName: 'Solana Perpetual',
  };
}

/**
 * Get TradingView symbol for an instrument
 */
export function getTradingViewSymbol(
  instrumentPubkey: string | PublicKey,
  network: string = 'localnet'
): string {
  const meta = getInstrumentMetadata(instrumentPubkey, network);
  return meta.tvSymbol;
}

/**
 * Get display name for an instrument
 */
export function getInstrumentDisplayName(
  instrumentPubkey: string | PublicKey,
  network: string = 'localnet'
): string {
  const meta = getInstrumentMetadata(instrumentPubkey, network);
  return meta.displayName;
}
