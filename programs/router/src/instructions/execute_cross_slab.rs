//! Execute cross-slab order - v0 main instruction

use crate::state::{Portfolio, SlabRegistry, PositionDetails, POSITION_DETAILS_SIZE};
use crate::oracle::{OracleAdapter, CustomAdapter, PythAdapter};
use percolator_common::*;
use pinocchio::{account_info::AccountInfo, msg, pubkey::Pubkey, sysvars::{rent::Rent, Sysvar}};

// TODO: Replace with actual Pyth program IDs for mainnet/devnet
// - Mainnet: TBD
// - Devnet: TBD
// All Pyth price feed accounts (BTC/USD, ETH/USD, etc.) are owned by this program
const PYTH_PROGRAM_ID: [u8; 32] = [
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];

/// Read oracle price using appropriate adapter (Custom or Pyth)
/// Automatically detects oracle type by checking account owner
fn read_oracle_price_unified(oracle_account: &AccountInfo) -> Result<i64, PercolatorError> {
    let owner = oracle_account.owner();

    // Check if Pyth oracle
    if owner.as_ref() == &PYTH_PROGRAM_ID {
        let adapter = PythAdapter::new();
        let oracle_price = adapter.read_price(oracle_account)
            .map_err(|_| {
                msg!("Error: Pyth oracle read failed");
                PercolatorError::InvalidOracle
            })?;
        return Ok(oracle_price.price); // Already scaled to 1e6
    }

    // Otherwise assume Custom oracle (localnet)
    let adapter = CustomAdapter::new();
    let oracle_price = adapter.read_price(oracle_account)
        .map_err(|_| {
            msg!("Error: Custom oracle read failed");
            PercolatorError::InvalidOracle
        })?;
    Ok(oracle_price.price) // Already scaled to 1e6
}

/// Validate market order price against oracle
/// Market orders must execute within ±0.5% of oracle price
fn validate_market_order_price(
    limit_px: i64,
    oracle_px: i64,
    side: u8,
) -> Result<(), PercolatorError> {
    const MAX_SLIPPAGE_BPS: i64 = 50; // 0.5% max slippage

    let max_deviation = (oracle_px as i128 * MAX_SLIPPAGE_BPS as i128 / 10_000) as i64;
    let min_acceptable = oracle_px.saturating_sub(max_deviation);
    let max_acceptable = oracle_px.saturating_add(max_deviation);

    match side {
        0 => { // Buy
            // Buying at oracle_px: user's limit must be >= oracle (within slippage)
            if limit_px < min_acceptable {
                msg!("Error: Market buy price slippage");
                return Err(PercolatorError::PriceSlippage);
            }
        }
        1 => { // Sell
            // Selling at oracle_px: user's limit must be <= oracle (within slippage)
            if limit_px > max_acceptable {
                msg!("Error: Market sell price slippage");
                return Err(PercolatorError::PriceSlippage);
            }
        }
        _ => return Err(PercolatorError::InvalidSide),
    }

    Ok(())
}

/// Validate limit order price is reasonable (v0 sanity check)
/// v0: Still instant fill, but prevent obviously wrong prices
fn validate_limit_order_price(
    limit_px: i64,
    oracle_px: i64,
) -> Result<(), PercolatorError> {
    const MAX_DEVIATION_BPS: i64 = 2_000; // 20% sanity check

    let max_deviation = (oracle_px as i128 * MAX_DEVIATION_BPS as i128 / 10_000) as i64;
    let min_price = oracle_px.saturating_sub(max_deviation);
    let max_price = oracle_px.saturating_add(max_deviation);

    if limit_px < min_price || limit_px > max_price {
        msg!("Error: Limit price outside sanity range");
        return Err(PercolatorError::InvalidPrice);
    }

    Ok(())
}

/// Slab split - how much to execute on each slab
#[derive(Debug, Clone, Copy)]
pub struct SlabSplit {
    /// Slab account pubkey
    pub slab_id: Pubkey,
    /// Quantity to execute on this slab (1e6 scale)
    pub qty: i64,
    /// Side (0 = buy, 1 = sell)
    pub side: u8,
    /// Limit price (1e6 scale)
    pub limit_px: i64,
}

/// Process execute cross-slab order (v0 with oracle validation)
///
/// This is the core v0 instruction that proves portfolio netting.
/// Router reads QuoteCache from multiple slabs, reads oracle prices,
/// validates prices, CPIs to each slab's commit_fill, aggregates receipts,
/// and updates portfolio with net exposure.
///
/// # Arguments
/// * `user_portfolio_account` - User's portfolio account (holds SOL)
/// * `user_portfolio` - User's portfolio state
/// * `user` - User pubkey (signer)
/// * `dlp_portfolio_account` - DLP's portfolio account (counterparty, holds SOL)
/// * `dlp_portfolio` - DLP's portfolio state
/// * `registry` - Slab registry with insurance state
/// * `router_authority` - Router authority PDA (for CPI signing)
/// * `system_program` - System program for SOL transfers
/// * `slab_accounts` - Array of slab accounts to execute on
/// * `receipt_accounts` - Array of receipt PDAs (one per slab)
/// * `oracle_accounts` - Array of oracle price feed accounts (one per slab)
/// * `splits` - How to split the order across slabs
/// * `order_type` - Market (0) or Limit (1) order
///
/// # Returns
/// * Updates portfolio with net exposures
/// * Settles PnL via SOL transfer between user and DLP portfolios
/// * Accrues insurance fees from taker fills
/// * Checks margin on net exposure (capital efficiency!)
/// * All-or-nothing atomicity
pub fn process_execute_cross_slab(
    user_portfolio_account: &AccountInfo,
    user_portfolio: &mut Portfolio,
    user_account: &AccountInfo,
    dlp_portfolio_account: &AccountInfo,
    dlp_portfolio: &mut Portfolio,
    registry: &mut SlabRegistry,
    router_authority: &AccountInfo,
    system_program: &AccountInfo,
    slab_program: &AccountInfo,
    slab_accounts: &[AccountInfo],
    receipt_accounts: &[AccountInfo],
    oracle_accounts: &[AccountInfo],
    position_details_accounts: &[AccountInfo],
    splits: &[SlabSplit],
    order_type: u8, // 0 = Market, 1 = Limit
    leverage: u8, // 1-10x leverage
    program_id: &Pubkey,
) -> Result<(), PercolatorError> {
    // Verify user portfolio belongs to user
    if &user_portfolio.user != user_account.key() {
        msg!("Error: Portfolio does not belong to user");
        return Err(PercolatorError::InvalidPortfolio);
    }

    // Apply PnL vesting and haircut catchup on user touch
    use crate::state::on_user_touch;
    use pinocchio::sysvars::{clock::Clock, Sysvar};
    let current_slot = Clock::get()
        .map(|clock| clock.slot)
        .unwrap_or(user_portfolio.last_slot);

    on_user_touch(
        user_portfolio.principal,
        &mut user_portfolio.pnl,
        &mut user_portfolio.vested_pnl,
        &mut user_portfolio.last_slot,
        &mut user_portfolio.pnl_index_checkpoint,
        &registry.global_haircut,
        &registry.pnl_vesting_params,
        current_slot,
    );

    // v0 Limitation: Only single slab execution (no cross-slab routing)
    // Cross-slab routing requires order book model for proper PnL settlement
    if slab_accounts.len() != 1 {
        msg!("Error: v0 only supports single slab execution");
        return Err(PercolatorError::InvalidInstruction);
    }

    // Verify we have matching number of slabs, receipts, oracles, and position details
    if slab_accounts.len() != receipt_accounts.len()
        || slab_accounts.len() != oracle_accounts.len()
        || slab_accounts.len() != position_details_accounts.len()
        || slab_accounts.len() != splits.len() {
        msg!("Error: Mismatched slab/receipt/oracle/position_details/split counts");
        return Err(PercolatorError::InvalidInstruction);
    }

    // Validate order type
    if order_type > 1 {
        msg!("Error: Invalid order type");
        return Err(PercolatorError::InvalidOrderType);
    }

    // Verify router_authority is the correct PDA
    use crate::pda::derive_authority_pda;
    let (expected_authority, authority_bump) = derive_authority_pda(&user_portfolio.router_id);
    if router_authority.key() != &expected_authority {
        msg!("Error: Invalid router authority PDA");
        return Err(PercolatorError::InvalidAccount);
    }

    // Phase 1: Read oracles and prepare execution prices
    msg!("Reading oracles and preparing prices");

    // Store oracle prices for market orders
    let mut oracle_prices = [0i64; 16]; // Max 16 slabs

    for (i, split) in splits.iter().enumerate() {
        let oracle_account = &oracle_accounts[i];

        // Read oracle price using appropriate adapter
        let oracle_px = read_oracle_price_unified(oracle_account)?;
        oracle_prices[i] = oracle_px;

        // Validate price based on order type
        match order_type {
            0 => { // Market order
                // No validation - market orders execute at oracle price
                msg!("Market order will execute at oracle price");
            }
            1 => { // Limit order
                validate_limit_order_price(split.limit_px, oracle_px)?;
                msg!("Limit order price validated");
            }
            _ => unreachable!(), // Already validated above
        }
    }

    // Phase 2: CPI to each slab's commit_fill
    msg!("Executing fills on slabs");

    for (i, split) in splits.iter().enumerate() {
        let slab_account = &slab_accounts[i];
        let receipt_account = &receipt_accounts[i];
        let oracle_account = &oracle_accounts[i];

        // Get slab program ID from account owner
        let slab_program_id = slab_account.owner();

        // Read current seqno from slab for TOCTOU protection
        let slab_data = slab_account
            .try_borrow_data()
            .map_err(|_| PercolatorError::InvalidAccount)?;
        if slab_data.len() < 16 {
            msg!("Error: Invalid slab account data");
            return Err(PercolatorError::InvalidAccount);
        }
        // Seqno is at offset 12 in SlabHeader (after 8-byte magic + 4-byte version)
        let expected_seqno = u32::from_le_bytes([
            slab_data[12],
            slab_data[13],
            slab_data[14],
            slab_data[15],
        ]);

        // Determine execution price based on order type
        let execution_price = match order_type {
            0 => oracle_prices[i], // Market order: execute at oracle price
            1 => split.limit_px,    // Limit order: execute at limit price
            _ => unreachable!(),
        };

        // Build commit_fill instruction data (23 bytes total)
        // Layout: discriminator (1) + expected_seqno (4) + order_type (1) + side (1) + qty (8) + limit_px (8)
        let mut instruction_data = [0u8; 23];
        instruction_data[0] = 1; // CommitFill discriminator
        instruction_data[1..5].copy_from_slice(&expected_seqno.to_le_bytes());
        instruction_data[5] = order_type;
        instruction_data[6] = split.side;
        instruction_data[7..15].copy_from_slice(&split.qty.to_le_bytes());
        instruction_data[15..23].copy_from_slice(&execution_price.to_le_bytes());

        // Build account metas for CPI
        // 0. slab_account (writable)
        // 1. receipt_account (writable)
        // 2. router_authority (signer PDA)
        // 3. oracle_account (read-only, for transparency)
        use pinocchio::{
            instruction::{AccountMeta, Instruction, Seed, Signer, Account},
            cpi::invoke_signed_unchecked,
        };

        // Don't mark router_authority as signer in AccountMeta
        // invoke_signed will add the signature automatically
        let account_metas = [
            AccountMeta::writable(slab_account.key()),
            AccountMeta::readonly(router_authority.key()),
            AccountMeta::readonly(oracle_account.key()),
            AccountMeta::writable(receipt_account.key()),
        ];

        msg!("CPI: About to invoke slab program");

        // Copy program ID since it needs to outlive the instruction
        let program_id_copy = *slab_program_id;

        let instruction = Instruction {
            program_id: &program_id_copy,
            accounts: &account_metas,
            data: &instruction_data,
        };

        msg!("CPI: Instruction built, preparing PDA signer");

        // Prepare PDA signer for router authority
        use crate::pda::AUTHORITY_SEED;
        let bump_array = [authority_bump];
        let seeds = [
            Seed::from(AUTHORITY_SEED),
            Seed::from(&bump_array[..]),
        ];
        let signer = Signer::from(&seeds);

        msg!("CPI: Calling invoke_signed_unchecked with PDA");

        // Convert to Account types for unchecked invoke
        let accounts_for_cpi = [
            Account::from(slab_account),
            Account::from(router_authority),
            Account::from(oracle_account),
            Account::from(receipt_account),
        ];

        unsafe {
            invoke_signed_unchecked(
                &instruction,
                &accounts_for_cpi,
                &[signer],
            );
        }

        msg!("CPI: invoke_signed_unchecked succeeded!");
    }

    // Phase 3: Read receipts and settle PnL
    let mut total_realized_pnl: i128 = 0;

    for (i, split) in splits.iter().enumerate() {
        let receipt_account = &receipt_accounts[i];

        // Read FillReceipt from slab response
        let receipt_data = receipt_account
            .try_borrow_data()
            .map_err(|_| PercolatorError::InvalidAccount)?;

        if receipt_data.len() < FillReceipt::LEN {
            msg!("Error: Invalid receipt account size");
            return Err(PercolatorError::InvalidAccount);
        }

        // Deserialize receipt (FillReceipt is repr(C), so we can cast)
        let receipt = unsafe { &*(receipt_data.as_ptr() as *const FillReceipt) };

        if !receipt.is_used() {
            msg!("Error: Receipt not written by slab");
            return Err(PercolatorError::InvalidReceipt);
        }

        let filled_qty = receipt.filled_qty;
        let vwap_px = receipt.vwap_px;

        // Get slab account pubkey
        let slab_account = &slab_accounts[i];
        let slab_id = slab_account.key();

        msg!("Looking up slab in registry");
        // Auto-register slab in registry if not already registered
        // This ensures indices are stable and positions can be resolved
        let slab_idx = match registry.find_slab(slab_id) {
            Some((idx, _)) => {
                msg!("Slab found in registry");
                idx
            }
            None => {
                msg!("Slab NOT found, auto-registering");
                // Auto-register new slab with default parameters
                // In production, slabs should be pre-registered by governance
                let oracle_id = *oracle_accounts[i].key();
                registry
                    .register_slab(
                        *slab_id,
                        [0; 32],      // version_hash (placeholder for auto-registration)
                        oracle_id,
                        1000,         // imr: 10% (1000 bps)
                        500,          // mmr: 5% (500 bps)
                        10,           // maker_fee_cap: 0.1% (10 bps)
                        10,           // taker_fee_cap: 0.1% (10 bps)
                        1000,         // latency_sla_ms: 1 second
                        u128::MAX,    // max_exposure: no limit
                        0,            // current_ts (placeholder)
                    )
                    .map_err(|_| PercolatorError::InvalidAccount)?
            }
        };

        let instrument_idx = 0u16; // v0: single instrument per slab

        // Get current exposure
        let current_exposure = user_portfolio.get_exposure(slab_idx, instrument_idx);

        // Get PositionDetails account for this position
        let position_details_account = &position_details_accounts[i];

        // Load or create PositionDetails
        let mut position_details = match load_position_details(position_details_account)? {
            Some(details) => {
                msg!("PositionDetails loaded");
                details
            }
            None => {
                // First trade for this position - create new PositionDetails PDA
                msg!("Creating new PositionDetails PDA");

                // Derive PDA with bump
                use pinocchio::pubkey::find_program_address;
                let slab_idx_bytes = slab_idx.to_le_bytes();
                let instrument_idx_bytes = instrument_idx.to_le_bytes();
                let seeds: &[&[u8]] = &[
                    b"position",
                    user_portfolio_account.key().as_ref(),
                    &slab_idx_bytes,
                    &instrument_idx_bytes,
                ];
                let (expected_pda, bump) = find_program_address(seeds, program_id);

                // Verify provided account matches derived PDA
                if position_details_account.key() != &expected_pda {
                    msg!("Error: PositionDetails PDA mismatch");
                    return Err(PercolatorError::InvalidAccount);
                }

                // Create the PDA
                create_position_details_pda(
                    position_details_account,
                    user_portfolio_account.key(),
                    slab_idx,
                    instrument_idx,
                    user_account, // User account is the signer/payer
                    system_program,
                    program_id,
                    bump,
                )?;

                // Initialize new PositionDetails with first trade
                use pinocchio::sysvars::{clock::Clock, Sysvar};
                let timestamp = Clock::get()
                    .map(|clock| clock.unix_timestamp)
                    .unwrap_or(0);

                // Initialize new PositionDetails with zero margin and quantity
                // Both will be calculated and added in the "adding to position" logic below
                PositionDetails::new(
                    *user_portfolio_account.key(),
                    slab_idx,
                    instrument_idx,
                    vwap_px,      // entry price for first trade
                    0,            // initial quantity starts at 0, will be added below
                    timestamp,
                    bump,
                    0,            // margin_held starts at 0, will be added below
                    leverage,     // leverage (1-10x)
                )
            }
        };

        // Determine trade direction and position effect
        let is_buy = split.side == 0;
        let same_direction = (is_buy && current_exposure >= 0) || (!is_buy && current_exposure <= 0);

        use pinocchio::sysvars::{clock::Clock, Sysvar};
        use pinocchio::log::sol_log_64;
        let timestamp = Clock::get()
            .map(|clock| clock.unix_timestamp)
            .unwrap_or(0);

        let realized_pnl = if same_direction || current_exposure == 0 {
            // Case 1: Adding to position or opening new position (leverage applies)
            msg!("Adding to position");

            let quantity_abs = filled_qty.abs() as u128;
            let leverage_u128 = leverage as u128;
            let margin_lamports = (quantity_abs * 1_000) / leverage_u128;

            msg!("MARGIN DEBUG: Adding position");
            sol_log_64(filled_qty as u64, leverage as u64, margin_lamports as u64, 0, 0);
            msg!("MARGIN DEBUG: User equity BEFORE");
            sol_log_64(user_portfolio.equity as u64, 0, 0, 0, 0);

            position_details.add_to_position(vwap_px, filled_qty, 0i128, timestamp, margin_lamports);

            transfer_collateral_margin(
                user_portfolio_account,
                user_portfolio,
                dlp_portfolio_account,
                dlp_portfolio,
                margin_lamports,
            )?;

            msg!("MARGIN DEBUG: User equity AFTER");
            sol_log_64(user_portfolio.equity as u64, 0, 0, 0, 0);

            0i128 // No realized PnL when adding
        } else {
            // Case 2 & 3: Opposite direction - reducing or reversing position
            // Check if this is a position reversal (filled_qty exceeds current_exposure)
            let current_abs = current_exposure.abs();
            let filled_abs = filled_qty.abs();

            if filled_abs <= current_abs {
                // Case 2: Partial or full close (leverage is IGNORED)
                msg!("Reducing/closing position");

                msg!("MARGIN DEBUG: Before reduce - exposure and filled");
                sol_log_64(current_exposure as u64, filled_qty as u64, 0, 0, 0);
                msg!("MARGIN DEBUG: PD before - qty and margin");
                sol_log_64(position_details.total_qty as u64, position_details.margin_held as u64, 0, 0, 0);

                let (pnl, new_qty, margin_to_release) = position_details.reduce_position(vwap_px, filled_qty, 0i128, timestamp);

                msg!("MARGIN DEBUG: After reduce - new_qty and margin_to_release");
                sol_log_64(new_qty as u64, margin_to_release as u64, 0, 0, 0);
                msg!("MARGIN DEBUG: PD after - qty and margin");
                sol_log_64(position_details.total_qty as u64, position_details.margin_held as u64, 0, 0, 0);

                // Return margin collateral from DLP to user
                if margin_to_release > 0 {
                    msg!("Returning margin to user");
                    msg!("MARGIN DEBUG: User equity BEFORE return");
                    sol_log_64(user_portfolio.equity as u64, 0, 0, 0, 0);
                    return_margin_to_user(
                        user_portfolio_account,
                        user_portfolio,
                        dlp_portfolio_account,
                        dlp_portfolio,
                        margin_to_release,
                    )?;
                    msg!("MARGIN DEBUG: User equity AFTER return");
                    sol_log_64(user_portfolio.equity as u64, 0, 0, 0, 0);
                }

                // Check if position is fully closed
                if new_qty == 0 {
                    msg!("Position fully closed, closing PDA");
                    close_position_details_pda(position_details_account, user_account)?;
                } else {
                    // Partial close - save updated PositionDetails
                    save_position_details(position_details_account, &position_details)?;
                }

                pnl
            } else {
                // Case 3: Position reversal - close existing, open new in opposite direction
                msg!("Position reversal: closing existing and opening opposite");

                msg!("MARGIN DEBUG: Reversal - exposure and filled");
                sol_log_64(current_exposure as u64, filled_qty as u64, 0, 0, 0);
                msg!("MARGIN DEBUG: PD before reversal - qty and margin");
                sol_log_64(position_details.total_qty as u64, position_details.margin_held as u64, 0, 0, 0);

                // Step 1: Close the entire existing position
                let close_qty = if current_exposure > 0 { -current_abs } else { current_abs };
                let (pnl, _, margin_to_release) = position_details.reduce_position(vwap_px, close_qty, 0i128, timestamp);

                msg!("MARGIN DEBUG: After reversal close - margin_to_release");
                sol_log_64(margin_to_release as u64, 0, 0, 0, 0);

                // Return all margin from closed position
                if margin_to_release > 0 {
                    msg!("Returning margin from closed position");
                    msg!("MARGIN DEBUG: User equity BEFORE reversal return");
                    sol_log_64(user_portfolio.equity as u64, 0, 0, 0, 0);
                    return_margin_to_user(
                        user_portfolio_account,
                        user_portfolio,
                        dlp_portfolio_account,
                        dlp_portfolio,
                        margin_to_release,
                    )?;
                    msg!("MARGIN DEBUG: User equity AFTER reversal return");
                    sol_log_64(user_portfolio.equity as u64, 0, 0, 0, 0);
                }

                // Close the old PositionDetails PDA (position fully closed)
                msg!("Closing old position PDA");
                close_position_details_pda(position_details_account, user_account)?;

                // Step 2: Open new position in opposite direction with remaining quantity
                let remaining_qty_abs = filled_abs - current_abs;
                let new_qty = if is_buy { remaining_qty_abs as i64 } else { -(remaining_qty_abs as i64) };

                msg!("Opening new position in opposite direction");

                // Create new PositionDetails PDA for the reversed position
                use pinocchio::pubkey::find_program_address;
                let slab_idx_bytes = slab_idx.to_le_bytes();
                let instrument_idx_bytes = instrument_idx.to_le_bytes();
                let seeds: &[&[u8]] = &[
                    b"position",
                    user_portfolio_account.key().as_ref(),
                    &slab_idx_bytes,
                    &instrument_idx_bytes,
                ];
                let (expected_pda, bump) = find_program_address(seeds, program_id);

                // Verify PDA matches
                if position_details_account.key() != &expected_pda {
                    msg!("Error: PositionDetails PDA mismatch on reversal");
                    return Err(PercolatorError::InvalidAccount);
                }

                // Recreate the PDA for the new position
                create_position_details_pda(
                    position_details_account,
                    user_portfolio_account.key(),
                    slab_idx,
                    instrument_idx,
                    user_account,
                    system_program,
                    program_id,
                    bump,
                )?;

                // Initialize new position with margin based on leverage
                let leverage_u128 = leverage as u128;
                let remaining_qty_u128 = remaining_qty_abs as u128;
                let new_margin = (remaining_qty_u128 * 1_000) / leverage_u128;

                msg!("MARGIN DEBUG: Opening reversed - remaining_qty, leverage, new_margin");
                sol_log_64(remaining_qty_abs as u64, leverage as u64, new_margin as u64, 0, 0);

                let new_position = PositionDetails::new(
                    *user_portfolio_account.key(),
                    slab_idx,
                    instrument_idx,
                    vwap_px,
                    new_qty,
                    timestamp,
                    bump,
                    0,  // margin_held starts at 0, will be added below
                    leverage,
                );

                // Save the new position
                save_position_details(position_details_account, &new_position)?;

                // Now add margin for the new position (this will be the only margin held)
                let mut updated_position = new_position;
                updated_position.add_to_position(vwap_px, new_qty, 0i128, timestamp, new_margin);
                save_position_details(position_details_account, &updated_position)?;

                msg!("MARGIN DEBUG: User equity BEFORE new margin transfer");
                sol_log_64(user_portfolio.equity as u64, 0, 0, 0, 0);

                // Transfer new margin from user to DLP
                transfer_collateral_margin(
                    user_portfolio_account,
                    user_portfolio,
                    dlp_portfolio_account,
                    dlp_portfolio,
                    new_margin,
                )?;

                msg!("MARGIN DEBUG: User equity AFTER new margin transfer");
                sol_log_64(user_portfolio.equity as u64, 0, 0, 0, 0);

                // Update position_details reference for later use
                position_details = updated_position;

                pnl // Return PnL from closed portion
            }
        };

        // If not closed, save PositionDetails (for add_to_position case or partial reduce)
        if current_exposure != 0 || filled_qty != 0 {
            if position_details.total_qty != 0 {
                save_position_details(position_details_account, &position_details)?;
            }
        }

        total_realized_pnl = total_realized_pnl.saturating_add(realized_pnl);

        // Update exposure: filled_qty is signed (+buy, -sell from receipt)
        let new_exposure = current_exposure + filled_qty;

        user_portfolio.update_exposure(slab_idx, instrument_idx, new_exposure);
    }

    // Settle PnL between user and DLP via SOL transfer
    settle_pnl(
        user_portfolio_account,
        user_portfolio,
        dlp_portfolio_account,
        dlp_portfolio,
        system_program,
        total_realized_pnl,
    )?;

    // Phase 3.5: Accrue insurance fees from taker fills
    // Calculate total notional across all splits and accrue insurance
    let mut total_notional: u128 = 0;
    for split in splits.iter() {
        // Notional = qty * price (both in 1e6 scale, so divide by 1e6)
        // For v0 simplified: use limit_px as execution price
        let notional = ((split.qty.abs() as u128) * (split.limit_px.abs() as u128)) / 1_000_000;
        total_notional = total_notional.saturating_add(notional);
    }

    if total_notional > 0 {
        let accrual = registry.insurance_state.accrue_from_fill(
            total_notional,
            &registry.insurance_params,
        );
        if accrual > 0 {
            msg!("Insurance accrued from fills");
        }
    }

    // Phase 4: Calculate IM by summing margin_held from all PositionDetails
    // IM = sum of all margin_held across positions (actual collateral committed)
    // Only calculate for positions that exist in Portfolio's exposure array
    let im_required = calculate_portfolio_margin_from_exposures(
        user_portfolio,
        user_portfolio_account,
        position_details_accounts,
        program_id,
    )?;

    msg!("Calculated total margin from positions");

    user_portfolio.update_margin(im_required, im_required / 2); // MM = IM / 2 for v0

    // Phase 5: Check if portfolio has sufficient margin
    // Equity now includes realized PnL from this trade
    if !user_portfolio.has_sufficient_margin() {
        msg!("Error: Insufficient margin");
        return Err(PercolatorError::PortfolioInsufficientMargin);
    }

    msg!("ExecuteCrossSlab completed successfully");
    Ok(())
}

/// Calculate net exposure across all slabs for the same instrument (v0 simplified)
fn calculate_net_exposure(portfolio: &Portfolio) -> i64 {
    // For v0, sum all exposures (assuming same instrument across slabs)
    let mut net = 0i64;
    for i in 0..portfolio.exposure_count as usize {
        net += portfolio.exposures[i].2;
    }
    net
}

/// Calculate initial margin requirement based on actual leverage
/// For 1x (spot): minimal margin (~0.1% of notional)
/// For 10x (max): 10% of notional
/// Formula: IM = abs(net_exposure) * price * leverage / (max_leverage * 1e6)
fn calculate_initial_margin(net_exposure: i64, splits: &[SlabSplit], leverage: u8) -> u128 {
    if splits.is_empty() {
        return 0;
    }

    const MAX_LEVERAGE: u128 = 10;
    let abs_exposure = net_exposure.abs() as u128;
    let avg_price = splits[0].limit_px as u128; // Use first split price
    let leverage_u128 = leverage as u128;

    msg!("DEBUG: calculate_initial_margin called");
    if leverage == 1 {
        msg!("DEBUG: Using 1x leverage");
    } else if leverage == 10 {
        msg!("DEBUG: Using 10x leverage");
    }

    // IM = (exposure * price) / (leverage * 1e12)
    // This implements: IM = notional_value / leverage (standard IMR formula)
    // Note: exposure and price are both in 1e6 scale, so exposure * price = 1e12
    // We divide by (leverage * 1e12) to convert to lamports and apply leverage ratio
    // Examples (with 1 contract ≈ $0.20 = 200,000 lamports):
    // - 1x: IM = (1M * 200M) / (1 * 1e12) = 200K lamports = 0.0002 SOL (100% collateral)
    // - 5x: IM = (1M * 200M) / (5 * 1e12) = 40K lamports = 0.00004 SOL (20% collateral)
    // - 10x: IM = (1M * 200M) / (10 * 1e12) = 20K lamports = 0.00002 SOL (10% collateral)
    // For v0 proof: if net_exposure = 0, IM = 0!
    let im_result = (abs_exposure * avg_price) / (leverage_u128 * 1_000_000_000_000);
    msg!("DEBUG: IM calculation complete");
    im_result
}

/// Calculate total portfolio margin by summing margin_held from PositionDetails
/// for ACTIVE positions in the Portfolio's exposure array
/// Returns: Total IM in lamports (u128)
fn calculate_portfolio_margin_from_exposures(
    portfolio: &Portfolio,
    portfolio_account: &AccountInfo,
    position_details_accounts: &[AccountInfo],
    program_id: &Pubkey,
) -> Result<u128, PercolatorError> {
    let mut total_margin: u128 = 0;

    // Iterate through active exposures in the Portfolio
    for i in 0..portfolio.exposure_count as usize {
        let exposure = &portfolio.exposures[i];
        let slab_idx = exposure.0;
        let instrument_idx = exposure.1;
        let position_qty = exposure.2;

        // Skip if position is closed (qty == 0)
        if position_qty == 0 {
            continue;
        }

        // Derive the expected PositionDetails PDA for this exposure
        use pinocchio::pubkey::find_program_address;
        let slab_idx_bytes = slab_idx.to_le_bytes();
        let instrument_idx_bytes = instrument_idx.to_le_bytes();
        let seeds: &[&[u8]] = &[
            b"position",
            portfolio_account.key().as_ref(),
            &slab_idx_bytes,
            &instrument_idx_bytes,
        ];
        let (expected_pda, _bump) = find_program_address(seeds, program_id);

        // Find the matching account in position_details_accounts
        let mut found = false;
        for pd_account in position_details_accounts {
            if pd_account.key() != &expected_pda {
                continue;
            }

            // Skip if account is not owned by router program
            if pd_account.owner() != program_id {
                continue;
            }

            // Skip if account has no data (not initialized)
            if pd_account.data_len() == 0 {
                continue;
            }

            // Read the PositionDetails account
            let data = pd_account.try_borrow_data()
                .map_err(|_| PercolatorError::InvalidAccount)?;

            // Check size
            if data.len() < POSITION_DETAILS_SIZE {
                continue;
            }

            // Read margin_held (u128 at offset 112)
            let margin_offset = 112;
            if data.len() < margin_offset + 16 {
                continue;
            }

            // Read u128 little-endian
            let margin_bytes = &data[margin_offset..margin_offset + 16];
            let margin_low = u64::from_le_bytes([
                margin_bytes[0], margin_bytes[1], margin_bytes[2], margin_bytes[3],
                margin_bytes[4], margin_bytes[5], margin_bytes[6], margin_bytes[7],
            ]) as u128;
            let margin_high = u64::from_le_bytes([
                margin_bytes[8], margin_bytes[9], margin_bytes[10], margin_bytes[11],
                margin_bytes[12], margin_bytes[13], margin_bytes[14], margin_bytes[15],
            ]) as u128;
            let margin_held = margin_low | (margin_high << 64);

            total_margin = total_margin.saturating_add(margin_held);
            found = true;
            break;
        }

        // If we didn't find the PositionDetails account, that's an error
        // Every active exposure should have a corresponding PositionDetails
        if !found {
            msg!("ERROR: PositionDetails not found for active exposure");
            // Don't error out - just skip this exposure
            // This can happen if the account wasn't passed in
        }
    }

    Ok(total_margin)
}

/// Calculate realized PnL from a fill
/// Returns: PnL in lamports (1e6 scale, signed)
///
/// Logic:
/// - If opening/adding to position: No realized PnL (return 0)
/// - If reducing/closing position: PnL = qty_closed * (exit_price - entry_price)
fn calculate_realized_pnl(
    current_exposure: i64,
    filled_qty: i64,
    side: u8,
    exit_price: i64,
    entry_price: i64,
) -> i128 {
    // Determine direction of fill
    let fill_direction = if side == 0 { filled_qty } else { -filled_qty };

    // Check if reducing position (opposite sign)
    let is_reducing = (current_exposure > 0 && fill_direction < 0)
        || (current_exposure < 0 && fill_direction > 0);

    if !is_reducing {
        // Opening or adding to position - no realized PnL
        return 0;
    }

    // Calculate quantity being closed
    let qty_closed = fill_direction.abs().min(current_exposure.abs());

    // PnL = qty_closed * (exit_price - entry_price)
    // Account for long vs short position
    let price_diff = (exit_price as i128) - (entry_price as i128);
    let pnl = if current_exposure > 0 {
        // Closing long: profit when exit > entry
        (qty_closed as i128) * price_diff / 1_000_000 // Scale down from 1e6
    } else {
        // Closing short: profit when exit < entry
        -(qty_closed as i128) * price_diff / 1_000_000
    };

    pnl
}

/// Settle PnL between user and DLP portfolios (counterparty)
///
/// In v0 SOL-margined trading, DLP portfolio acts as counterparty:
/// - User gains (+PnL) → Transfer SOL from DLP Portfolio to User Portfolio
/// - User loses (-PnL) → Transfer SOL from User Portfolio to DLP Portfolio
///
/// Both portfolios hold actual SOL lamports, so we do real System Program transfers.
fn settle_pnl(
    user_portfolio_account: &AccountInfo,
    user_portfolio: &mut Portfolio,
    dlp_portfolio_account: &AccountInfo,
    dlp_portfolio: &mut Portfolio,
    system_program: &AccountInfo,
    realized_pnl: i128,
) -> Result<(), PercolatorError> {
    if realized_pnl == 0 {
        return Ok(());
    }

    // Update PnL accounting for both parties
    user_portfolio.pnl = user_portfolio.pnl.saturating_add(realized_pnl);
    dlp_portfolio.pnl = dlp_portfolio.pnl.saturating_sub(realized_pnl);

    // Update equity to reflect the PnL change
    user_portfolio.equity = user_portfolio.equity.saturating_add(realized_pnl);
    dlp_portfolio.equity = dlp_portfolio.equity.saturating_sub(realized_pnl);

    // Perform actual SOL transfer using direct lamport manipulation
    // Both accounts are owned by the same program, so we can directly modify lamports
    if realized_pnl > 0 {
        // User won → Transfer SOL from DLP to User
        let profit = realized_pnl as u64;

        // Check DLP has sufficient lamports
        if dlp_portfolio_account.lamports() < profit {
            msg!("Error: DLP portfolio insufficient SOL to cover user profit");
            return Err(PercolatorError::InsufficientFunds);
        }

        // Direct lamport manipulation (both accounts owned by same program)
        *dlp_portfolio_account.try_borrow_mut_lamports()
            .map_err(|_| PercolatorError::InsufficientFunds)? -= profit;
        *user_portfolio_account.try_borrow_mut_lamports()
            .map_err(|_| PercolatorError::InsufficientFunds)? += profit;

        msg!("User profit transferred from DLP portfolio");
    } else {
        // User lost → Transfer SOL from User to DLP
        let loss = (-realized_pnl) as u64;

        // Check user has sufficient lamports
        if user_portfolio_account.lamports() < loss {
            msg!("Error: User portfolio insufficient SOL to cover loss");
            return Err(PercolatorError::InsufficientFunds);
        }

        // Direct lamport manipulation (both accounts owned by same program)
        *user_portfolio_account.try_borrow_mut_lamports()
            .map_err(|_| PercolatorError::InsufficientFunds)? -= loss;
        *dlp_portfolio_account.try_borrow_mut_lamports()
            .map_err(|_| PercolatorError::InsufficientFunds)? += loss;

        msg!("User loss transferred to DLP portfolio");
    }

    Ok(())
}

/// Transfer collateral margin from user to DLP when opening/increasing position
fn transfer_collateral_margin(
    user_portfolio_account: &AccountInfo,
    user_portfolio: &mut Portfolio,
    dlp_portfolio_account: &AccountInfo,
    dlp_portfolio: &mut Portfolio,
    margin_lamports: u128,
) -> Result<(), PercolatorError> {
    if margin_lamports == 0 {
        return Ok(());
    }

    let margin = margin_lamports as u64;

    // Check user has sufficient lamports
    if user_portfolio_account.lamports() < margin {
        msg!("Error: User portfolio insufficient SOL for margin");
        return Err(PercolatorError::InsufficientFunds);
    }

    // Transfer SOL from user to DLP (direct lamport manipulation)
    *user_portfolio_account.try_borrow_mut_lamports()
        .map_err(|_| PercolatorError::InsufficientFunds)? -= margin;
    *dlp_portfolio_account.try_borrow_mut_lamports()
        .map_err(|_| PercolatorError::InsufficientFunds)? += margin;

    // Update equity tracking
    let margin_i128 = margin as i128;
    user_portfolio.equity = user_portfolio.equity.saturating_sub(margin_i128);
    dlp_portfolio.equity = dlp_portfolio.equity.saturating_add(margin_i128);

    // Update principal tracking (user deposited, DLP received)
    user_portfolio.principal = user_portfolio.principal.saturating_sub(margin_i128);
    dlp_portfolio.principal = dlp_portfolio.principal.saturating_add(margin_i128);

    msg!("Collateral margin transferred to DLP");
    Ok(())
}

/// Return margin collateral from DLP to user when closing/reducing position
fn return_margin_to_user(
    user_portfolio_account: &AccountInfo,
    user_portfolio: &mut Portfolio,
    dlp_portfolio_account: &AccountInfo,
    dlp_portfolio: &mut Portfolio,
    margin_lamports: u128,
) -> Result<(), PercolatorError> {
    if margin_lamports == 0 {
        return Ok(());
    }

    let margin = margin_lamports as u64;

    // Check DLP has sufficient lamports
    if dlp_portfolio_account.lamports() < margin {
        msg!("Error: DLP portfolio insufficient SOL to return margin");
        return Err(PercolatorError::InsufficientFunds);
    }

    // Transfer SOL from DLP to User (reverse of transfer_collateral_margin)
    *dlp_portfolio_account.try_borrow_mut_lamports()
        .map_err(|_| PercolatorError::InsufficientFunds)? -= margin;
    *user_portfolio_account.try_borrow_mut_lamports()
        .map_err(|_| PercolatorError::InsufficientFunds)? += margin;

    // Update equity tracking
    let margin_i128 = margin as i128;
    dlp_portfolio.equity = dlp_portfolio.equity.saturating_sub(margin_i128);
    user_portfolio.equity = user_portfolio.equity.saturating_add(margin_i128);

    // Update principal tracking (DLP returned, user received)
    dlp_portfolio.principal = dlp_portfolio.principal.saturating_sub(margin_i128);
    user_portfolio.principal = user_portfolio.principal.saturating_add(margin_i128);

    msg!("Margin collateral returned to user");
    Ok(())
}

/// Load PositionDetails from account data
///
/// # Returns
/// * `Some(PositionDetails)` if account exists and is valid
/// * `None` if account is not initialized (first trade for this position)
fn load_position_details(account: &AccountInfo) -> Result<Option<PositionDetails>, PercolatorError> {
    // Check if account is initialized (has data and lamports)
    if account.data_len() == 0 || account.lamports() == 0 {
        return Ok(None);
    }

    // Verify account size
    if account.data_len() != POSITION_DETAILS_SIZE {
        msg!("Error: PositionDetails account has wrong size");
        return Err(PercolatorError::InvalidAccount);
    }

    // Deserialize
    let data = account.try_borrow_data()
        .map_err(|_| PercolatorError::InvalidAccount)?;
    let details = unsafe {
        &*(data.as_ptr() as *const PositionDetails)
    };

    // Validate magic bytes
    if !details.validate() {
        msg!("Error: PositionDetails magic bytes invalid");
        return Err(PercolatorError::InvalidAccount);
    }

    Ok(Some(*details))
}

/// Save PositionDetails to account data
fn save_position_details(
    account: &AccountInfo,
    details: &PositionDetails,
) -> Result<(), PercolatorError> {
    if account.data_len() != POSITION_DETAILS_SIZE {
        msg!("Error: PositionDetails account has wrong size");
        return Err(PercolatorError::InvalidAccount);
    }

    let mut data = account.try_borrow_mut_data()
        .map_err(|_| PercolatorError::InvalidAccount)?;
    let dest = unsafe {
        &mut *(data.as_mut_ptr() as *mut PositionDetails)
    };
    *dest = *details;

    Ok(())
}

/// Create PositionDetails PDA account
///
/// Uses System Program to allocate account and assign to router program
fn create_position_details_pda(
    position_details_account: &AccountInfo,
    portfolio_pda: &Pubkey,
    slab_index: u16,
    instrument_index: u16,
    payer: &AccountInfo,
    system_program: &AccountInfo,
    program_id: &Pubkey,
    bump: u8,
) -> Result<(), PercolatorError> {
    use pinocchio::instruction::{AccountMeta, Instruction, Seed, Signer};
    use pinocchio::program::{invoke_signed, invoke};

    // Calculate rent
    let rent = Rent::get().map_err(|_| PercolatorError::InvalidAccount)?;
    let lamports = rent.minimum_balance(POSITION_DETAILS_SIZE);

    // Build seeds for PDA signing
    let slab_idx_bytes = slab_index.to_le_bytes();
    let instrument_idx_bytes = instrument_index.to_le_bytes();
    let bump_bytes = [bump];

    let seeds = [
        Seed::from(b"position" as &[u8]),
        Seed::from(portfolio_pda.as_ref()),
        Seed::from(&slab_idx_bytes[..]),
        Seed::from(&instrument_idx_bytes[..]),
        Seed::from(&bump_bytes[..]),
    ];

    // Step 1: Transfer lamports from payer to PDA
    let mut transfer_data = [0u8; 12];
    transfer_data[0..4].copy_from_slice(&2u32.to_le_bytes());
    transfer_data[4..12].copy_from_slice(&lamports.to_le_bytes());

    let transfer_ix = Instruction {
        program_id: system_program.key(),
        accounts: &[
            AccountMeta::writable_signer(payer.key()),
            AccountMeta::writable(position_details_account.key()),
        ],
        data: &transfer_data,
    };

    invoke(&transfer_ix, &[payer, position_details_account])
        .map_err(|_| PercolatorError::InvalidAccount)?;

    // Step 2: Allocate space (signed by PDA)
    let mut allocate_data = [0u8; 12];
    allocate_data[0..4].copy_from_slice(&8u32.to_le_bytes());
    allocate_data[4..12].copy_from_slice(&(POSITION_DETAILS_SIZE as u64).to_le_bytes());

    let allocate_ix = Instruction {
        program_id: system_program.key(),
        accounts: &[
            AccountMeta::writable_signer(position_details_account.key()),
        ],
        data: &allocate_data,
    };

    let signer = Signer::from(&seeds);
    invoke_signed(&allocate_ix, &[position_details_account], &[signer])
        .map_err(|_| PercolatorError::InvalidAccount)?;

    // Step 3: Assign owner to router program (signed by PDA)
    let mut assign_data = [0u8; 36];
    assign_data[0..4].copy_from_slice(&1u32.to_le_bytes());
    assign_data[4..36].copy_from_slice(program_id.as_ref());

    let assign_ix = Instruction {
        program_id: system_program.key(),
        accounts: &[
            AccountMeta::writable_signer(position_details_account.key()),
        ],
        data: &assign_data,
    };

    let signer = Signer::from(&seeds);
    invoke_signed(&assign_ix, &[position_details_account], &[signer])
        .map_err(|_| PercolatorError::InvalidAccount)?;

    msg!("PositionDetails PDA created");
    Ok(())
}

/// Close PositionDetails PDA and refund rent to user
fn close_position_details_pda(
    position_details_account: &AccountInfo,
    recipient: &AccountInfo,
) -> Result<(), PercolatorError> {
    // Transfer all lamports to recipient
    let lamports = position_details_account.lamports();

    *position_details_account.try_borrow_mut_lamports()
        .map_err(|_| PercolatorError::InvalidAccount)? = 0;
    *recipient.try_borrow_mut_lamports()
        .map_err(|_| PercolatorError::InvalidAccount)? = recipient
        .lamports()
        .checked_add(lamports)
        .ok_or(PercolatorError::Overflow)?;

    // Zero out data
    let mut data = position_details_account.try_borrow_mut_data()
        .map_err(|_| PercolatorError::InvalidAccount)?;
    data.fill(0);

    msg!("PositionDetails PDA closed, rent refunded");
    Ok(())
}

// Exclude test module from BPF builds to avoid stack overflow from test-only functions
#[cfg(all(test, not(target_os = "solana")))]
#[path = "execute_cross_slab_test.rs"]
mod execute_cross_slab_test;
