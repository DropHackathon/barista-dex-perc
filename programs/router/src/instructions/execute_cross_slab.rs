//! Execute cross-slab order - v0 main instruction

use crate::state::{Portfolio, SlabRegistry};
use crate::oracle::{OracleAdapter, CustomAdapter, PythAdapter};
use percolator_common::*;
use pinocchio::{account_info::AccountInfo, msg, pubkey::Pubkey};

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
    user: &Pubkey,
    dlp_portfolio_account: &AccountInfo,
    dlp_portfolio: &mut Portfolio,
    registry: &mut SlabRegistry,
    router_authority: &AccountInfo,
    system_program: &AccountInfo,
    slab_program: &AccountInfo,
    slab_accounts: &[AccountInfo],
    receipt_accounts: &[AccountInfo],
    oracle_accounts: &[AccountInfo],
    splits: &[SlabSplit],
    order_type: u8, // 0 = Market, 1 = Limit
) -> Result<(), PercolatorError> {
    // Verify user portfolio belongs to user
    if &user_portfolio.user != user {
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

    // Verify we have matching number of slabs, receipts, and oracles
    if slab_accounts.len() != receipt_accounts.len()
        || slab_accounts.len() != oracle_accounts.len()
        || slab_accounts.len() != splits.len() {
        msg!("Error: Mismatched slab/receipt/oracle/split counts");
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

        // Update portfolio exposure for this slab/instrument
        // For v0, we'll use slab index and instrument 0 (simplified)
        let slab_idx = i as u16;
        let instrument_idx = 0u16;

        // Get current exposure
        let current_exposure = user_portfolio.get_exposure(slab_idx, instrument_idx);

        // Calculate realized PnL if reducing position
        let realized_pnl = calculate_realized_pnl(
            current_exposure,
            filled_qty,
            split.side,
            vwap_px,
            split.limit_px, // Use limit price as approximate entry price
        );

        total_realized_pnl = total_realized_pnl.saturating_add(realized_pnl);

        // Update exposure: Buy = add qty, Sell = subtract qty
        let new_exposure = if split.side == 0 {
            // Buy
            current_exposure + filled_qty
        } else {
            // Sell
            current_exposure - filled_qty
        };

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

    // Phase 4: Calculate IM on net exposure (THE CAPITAL EFFICIENCY PROOF!)
    // For v0, use simplified margin calculation:
    // - Calculate net exposure across all slabs for same instrument
    // - IM = abs(net_exposure) * notional_value * imr_factor
    let net_exposure = calculate_net_exposure(user_portfolio);
    let im_required = calculate_initial_margin(net_exposure, splits);

    msg!("Calculated margin on net exposure");

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

/// Calculate initial margin requirement (v0 simplified)
fn calculate_initial_margin(net_exposure: i64, splits: &[SlabSplit]) -> u128 {
    // For v0, simplified: IM = abs(net_exposure) * avg_price * 0.1 (10% IMR)
    if splits.is_empty() {
        return 0;
    }

    let abs_exposure = net_exposure.abs() as u128;
    let avg_price = splits[0].limit_px as u128; // Use first split price

    // IM = abs(net_exposure) * price * 0.1 / 1e6 (scale factor)
    // For v0 proof: if net_exposure = 0, IM = 0!
    (abs_exposure * avg_price * 10) / (100 * 1_000_000)
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

    // Perform actual SOL transfer
    if realized_pnl > 0 {
        // User won → Transfer SOL from DLP to User
        let profit = realized_pnl as u64;

        // Check DLP has sufficient lamports
        if dlp_portfolio_account.lamports() < profit {
            msg!("Error: DLP portfolio insufficient SOL to cover user profit");
            return Err(PercolatorError::InsufficientFunds);
        }

        // Build System Program transfer instruction
        let mut instruction_data = [0u8; 12];
        instruction_data[0..4].copy_from_slice(&2u32.to_le_bytes()); // Transfer discriminator
        instruction_data[4..12].copy_from_slice(&profit.to_le_bytes()); // Amount

        use pinocchio::instruction::{AccountMeta, Instruction};
        use pinocchio::program::invoke;

        let transfer_instruction = Instruction {
            program_id: system_program.key(),
            accounts: &[
                AccountMeta {
                    pubkey: dlp_portfolio_account.key(),
                    is_signer: false,
                    is_writable: true,
                },
                AccountMeta {
                    pubkey: user_portfolio_account.key(),
                    is_signer: false,
                    is_writable: true,
                },
            ],
            data: &instruction_data,
        };

        invoke(
            &transfer_instruction,
            &[dlp_portfolio_account, user_portfolio_account, system_program],
        )
        .map_err(|_| PercolatorError::InsufficientFunds)?;

        msg!("User profit transferred from DLP portfolio");
    } else {
        // User lost → Transfer SOL from User to DLP
        let loss = (-realized_pnl) as u64;

        // Check user has sufficient lamports
        if user_portfolio_account.lamports() < loss {
            msg!("Error: User portfolio insufficient SOL to cover loss");
            return Err(PercolatorError::InsufficientFunds);
        }

        // Build System Program transfer instruction
        let mut instruction_data = [0u8; 12];
        instruction_data[0..4].copy_from_slice(&2u32.to_le_bytes()); // Transfer discriminator
        instruction_data[4..12].copy_from_slice(&loss.to_le_bytes()); // Amount

        use pinocchio::instruction::{AccountMeta, Instruction};
        use pinocchio::program::invoke;

        let transfer_instruction = Instruction {
            program_id: system_program.key(),
            accounts: &[
                AccountMeta {
                    pubkey: user_portfolio_account.key(),
                    is_signer: false,
                    is_writable: true,
                },
                AccountMeta {
                    pubkey: dlp_portfolio_account.key(),
                    is_signer: false,
                    is_writable: true,
                },
            ],
            data: &instruction_data,
        };

        invoke(
            &transfer_instruction,
            &[user_portfolio_account, dlp_portfolio_account, system_program],
        )
        .map_err(|_| PercolatorError::InsufficientFunds)?;

        msg!("User loss transferred to DLP portfolio");
    }

    Ok(())
}

// Exclude test module from BPF builds to avoid stack overflow from test-only functions
#[cfg(all(test, not(target_os = "solana")))]
#[path = "execute_cross_slab_test.rs"]
mod execute_cross_slab_test;
