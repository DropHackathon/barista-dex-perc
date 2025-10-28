//! Position details tracking for accurate PnL calculations
//!
//! Stores per-position metadata that doesn't fit in the Portfolio struct:
//! - Weighted average entry price
//! - Realized PnL accumulator
//! - Total fees paid
//! - Trade statistics
//!
//! Each active position gets its own PositionDetails PDA, created on position open
//! and closed when the position is fully exited (rent refunded).

use pinocchio::pubkey::Pubkey;

/// Size of PositionDetails account
pub const POSITION_DETAILS_SIZE: usize = 144;

/// Magic bytes for PositionDetails validation
pub const POSITION_DETAILS_MAGIC: &[u8; 8] = b"BARTPOSN";

/// Position details account state
///
/// PDA: ["position", portfolio_pda, slab_index, instrument_index]
///
/// Stores entry price and PnL tracking for a single position.
/// This allows accurate realized and unrealized PnL calculations
/// without expanding the Portfolio struct beyond Solana's size limits.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct PositionDetails {
    /// Magic bytes: "BARTPOSN" = 0x4E534F5054524142
    pub magic: u64,

    /// Portfolio this position belongs to
    pub portfolio: Pubkey,

    /// Slab index (matches Portfolio.exposures)
    pub slab_index: u16,

    /// Instrument index (matches Portfolio.exposures)
    pub instrument_index: u16,

    /// Bump seed for PDA
    pub bump: u8,

    /// Padding for alignment
    pub _padding1: [u8; 3],

    /// Weighted average entry price (scaled by 1_000_000)
    ///
    /// Updated when adding to position:
    /// new_avg = (old_avg * old_qty + fill_price * fill_qty) / (old_qty + fill_qty)
    pub avg_entry_price: i64,

    /// Total position quantity (should match Portfolio.exposures)
    ///
    /// Tracked here for validation and debugging.
    /// Sign indicates direction: positive = long, negative = short
    pub total_qty: i64,

    /// Accumulated realized PnL for this position (scaled by 1_000_000)
    ///
    /// Updated when reducing position:
    /// realized_pnl += qty_closed * (exit_price - avg_entry_price)
    pub realized_pnl: i128,

    /// Total fees paid on this position (scaled by 1_000_000)
    pub total_fees: i128,

    /// Number of trades executed for this position
    pub trade_count: u32,

    /// Padding for alignment
    pub _padding2: [u8; 4],

    /// Last update timestamp (Unix timestamp)
    pub last_update_ts: i64,

    /// Total margin held in DLP for this position (in lamports)
    ///
    /// Tracks collateral transferred to DLP when opening/increasing position.
    /// Must be returned to user when closing/reducing position.
    pub margin_held: u128,

    /// Leverage used for this position (1-10x)
    pub leverage: u8,

    /// Reserved for future use
    pub _reserved: [u8; 7],
}

impl PositionDetails {
    /// Compile-time size check
    const _SIZE_CHECK: () = {
        const EXPECTED: usize = POSITION_DETAILS_SIZE;
        const ACTUAL: usize = core::mem::size_of::<PositionDetails>();
        const _: [(); ACTUAL] = [(); EXPECTED];
    };

    /// Create a new position details account
    pub fn new(
        portfolio: Pubkey,
        slab_index: u16,
        instrument_index: u16,
        entry_price: i64,
        initial_qty: i64,
        timestamp: i64,
        bump: u8,
        initial_margin: u128,
        leverage: u8,
    ) -> Self {
        Self {
            magic: u64::from_le_bytes(*POSITION_DETAILS_MAGIC),
            portfolio,
            slab_index,
            instrument_index,
            bump,
            _padding1: [0; 3],
            avg_entry_price: entry_price,
            total_qty: initial_qty,
            realized_pnl: 0,
            total_fees: 0,
            trade_count: 1,
            _padding2: [0; 4],
            last_update_ts: timestamp,
            margin_held: initial_margin,
            leverage,
            _reserved: [0; 7],
        }
    }

    /// Validate the magic bytes
    pub fn validate(&self) -> bool {
        self.magic == u64::from_le_bytes(*POSITION_DETAILS_MAGIC)
    }

    /// Update position when adding to existing position (same direction)
    ///
    /// Calculates new weighted average entry price:
    /// new_avg = (old_avg * old_qty + fill_price * fill_qty) / (old_qty + fill_qty)
    pub fn add_to_position(
        &mut self,
        fill_price: i64,
        fill_qty: i64,
        fee: i128,
        timestamp: i64,
        additional_margin: u128,
    ) {
        // Calculate weighted average entry price
        let old_cost = (self.avg_entry_price as i128) * (self.total_qty.abs() as i128);
        let new_cost = (fill_price as i128) * (fill_qty.abs() as i128);
        let total_cost = old_cost + new_cost;

        let new_qty = self.total_qty + fill_qty;
        self.avg_entry_price = (total_cost / (new_qty.abs() as i128)) as i64;

        self.total_qty = new_qty;
        self.total_fees = self.total_fees.saturating_add(fee);
        self.trade_count += 1;
        self.last_update_ts = timestamp;

        // Track additional margin held in DLP
        self.margin_held = self.margin_held.saturating_add(additional_margin);
    }

    /// Update position when reducing existing position (opposite direction)
    ///
    /// Calculates realized PnL for the closed portion:
    /// pnl = qty_closed * (exit_price - avg_entry_price)
    ///
    /// Returns: (realized_pnl, remaining_qty, margin_to_release)
    pub fn reduce_position(
        &mut self,
        exit_price: i64,
        reduce_qty: i64,
        fee: i128,
        timestamp: i64,
    ) -> (i128, i64, u128) {
        let qty_closed = reduce_qty.abs().min(self.total_qty.abs());

        // Calculate realized PnL: qty_closed * (exit_price - entry_price)
        let price_diff = (exit_price as i128) - (self.avg_entry_price as i128);
        let pnl = if self.total_qty > 0 {
            // Closing long: profit when exit > entry
            (qty_closed as i128) * price_diff / 1_000_000
        } else {
            // Closing short: profit when exit < entry
            -(qty_closed as i128) * price_diff / 1_000_000
        };

        self.realized_pnl = self.realized_pnl.saturating_add(pnl);
        self.total_fees = self.total_fees.saturating_add(fee);
        self.trade_count += 1;
        self.last_update_ts = timestamp;

        // Update remaining quantity
        if self.total_qty > 0 {
            self.total_qty -= qty_closed;
        } else {
            self.total_qty += qty_closed;
        }

        // Calculate proportional margin to release
        // If closing entire position, release all margin
        // If partial close, release proportional amount
        let total_qty_abs = (self.total_qty + if self.total_qty > 0 { qty_closed } else { -qty_closed }) as u128;
        let margin_to_release = if self.total_qty == 0 {
            // Full close - return all margin
            let full_margin = self.margin_held;
            self.margin_held = 0;
            full_margin
        } else if total_qty_abs > 0 {
            // Partial close - return proportional margin
            let proportion = (qty_closed as u128 * 1_000_000) / total_qty_abs;
            let release = (self.margin_held * proportion) / 1_000_000;
            self.margin_held = self.margin_held.saturating_sub(release);
            release
        } else {
            0
        };

        (pnl, self.total_qty, margin_to_release)
    }

    /// Derive the PDA for a position
    pub fn derive_pda(
        portfolio: &Pubkey,
        slab_index: u16,
        instrument_index: u16,
        program_id: &Pubkey,
    ) -> (Pubkey, u8) {
        use pinocchio::pubkey::find_program_address;

        find_program_address(
            &[
                b"position",
                portfolio.as_ref(),
                &slab_index.to_le_bytes(),
                &instrument_index.to_le_bytes(),
            ],
            program_id,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_position_details_size() {
        use core::mem::size_of;
        assert_eq!(size_of::<PositionDetails>(), POSITION_DETAILS_SIZE);
    }

    #[test]
    fn test_position_details_creation() {
        let portfolio = Pubkey::default();
        let details = PositionDetails::new(
            portfolio,
            0,
            0,
            50_000_000_000, // $50,000
            2_000_000,      // 2.0 BTC
            1000,
            255,
        );

        assert!(details.validate());
        assert_eq!(details.portfolio, portfolio);
        assert_eq!(details.slab_index, 0);
        assert_eq!(details.instrument_index, 0);
        assert_eq!(details.avg_entry_price, 50_000_000_000);
        assert_eq!(details.total_qty, 2_000_000);
        assert_eq!(details.realized_pnl, 0);
        assert_eq!(details.total_fees, 0);
        assert_eq!(details.trade_count, 1);
    }

    #[test]
    fn test_add_to_position() {
        let mut details = PositionDetails::new(
            Pubkey::default(),
            0,
            0,
            50_000_000_000, // Entry @ $50,000
            2_000_000,      // 2.0 BTC
            1000,
            255,
        );

        // Add 1.0 BTC @ $51,000
        details.add_to_position(
            51_000_000_000,
            1_000_000,
            100_000, // fee
            1001,
        );

        // Weighted avg: (50k * 2 + 51k * 1) / 3 = 50.333k
        assert_eq!(details.avg_entry_price, 50_333_333_333);
        assert_eq!(details.total_qty, 3_000_000);
        assert_eq!(details.total_fees, 100_000);
        assert_eq!(details.trade_count, 2);
    }

    #[test]
    fn test_reduce_position_profit() {
        let mut details = PositionDetails::new(
            Pubkey::default(),
            0,
            0,
            50_000_000_000, // Entry @ $50,000
            2_000_000,      // 2.0 BTC
            1000,
            255,
        );

        // Close 1.0 BTC @ $52,000
        let (pnl, remaining) = details.reduce_position(
            52_000_000_000,
            1_000_000,
            50_000, // fee
            1001,
        );

        // PnL = 1.0 * (52k - 50k) = 2k
        assert_eq!(pnl, 2_000);
        assert_eq!(remaining, 1_000_000);
        assert_eq!(details.realized_pnl, 2_000);
        assert_eq!(details.total_fees, 50_000);
        assert_eq!(details.trade_count, 2);
    }

    #[test]
    fn test_reduce_position_loss() {
        let mut details = PositionDetails::new(
            Pubkey::default(),
            0,
            0,
            50_000_000_000, // Entry @ $50,000
            2_000_000,      // 2.0 BTC
            1000,
            255,
        );

        // Close 1.0 BTC @ $48,000 (loss)
        let (pnl, remaining) = details.reduce_position(
            48_000_000_000,
            1_000_000,
            50_000,
            1001,
        );

        // PnL = 1.0 * (48k - 50k) = -2k
        assert_eq!(pnl, -2_000);
        assert_eq!(remaining, 1_000_000);
        assert_eq!(details.realized_pnl, -2_000);
    }

    #[test]
    fn test_short_position_profit() {
        let mut details = PositionDetails::new(
            Pubkey::default(),
            0,
            0,
            50_000_000_000, // Entry @ $50,000
            -2_000_000,     // -2.0 BTC (short)
            1000,
            255,
        );

        // Close 1.0 BTC @ $48,000 (buy back)
        let (pnl, remaining) = details.reduce_position(
            48_000_000_000,
            1_000_000,
            50_000,
            1001,
        );

        // Short profit when price drops: 1.0 * -(48k - 50k) = 2k
        assert_eq!(pnl, 2_000);
        assert_eq!(remaining, -1_000_000);
        assert_eq!(details.realized_pnl, 2_000);
    }
}
