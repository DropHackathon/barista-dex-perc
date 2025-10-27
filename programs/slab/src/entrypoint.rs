//! Slab program entrypoint (v0 minimal)

use pinocchio::{
    account_info::AccountInfo,
    entrypoint,
    msg,
    pubkey::Pubkey,
    sysvars::{rent::Rent, Sysvar},
    ProgramResult,
};

use crate::instructions::{SlabInstruction, process_initialize_slab, process_commit_fill, Side, OrderType};
use crate::state::SlabState;
use percolator_common::{PercolatorError, validate_owner, validate_writable, borrow_account_data_mut, InstructionReader};

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    // Check minimum instruction data length
    if instruction_data.is_empty() {
        msg!("Error: Instruction data is empty");
        return Err(PercolatorError::InvalidInstruction.into());
    }

    // Parse instruction discriminator
    let discriminator = instruction_data[0];
    let instruction = match discriminator {
        0 => SlabInstruction::Initialize,
        1 => SlabInstruction::CommitFill,
        _ => {
            msg!("Error: Unknown instruction");
            return Err(PercolatorError::InvalidInstruction.into());
        }
    };

    // Dispatch to instruction handler (v0 minimal)
    match instruction {
        SlabInstruction::Initialize => {
            msg!("Instruction: Initialize");
            process_initialize_inner(program_id, accounts, &instruction_data[1..])
        }
        SlabInstruction::CommitFill => {
            msg!("Instruction: CommitFill");
            process_commit_fill_inner(program_id, accounts, &instruction_data[1..])
        }
    }
}

// Instruction processors with account validation

/// Process initialize instruction (v0)
///
/// Expected accounts:
/// 0. `[writable]` Slab state account (PDA, will be created if doesn't exist)
/// 1. `[signer, writable]` Payer/authority
/// 2. `[]` System program
///
/// Expected data layout (121 bytes):
/// - lp_owner: Pubkey (32 bytes)
/// - router_id: Pubkey (32 bytes)
/// - instrument: Pubkey (32 bytes)
/// - mark_px: i64 (8 bytes)
/// - taker_fee_bps: i64 (8 bytes)
/// - contract_size: i64 (8 bytes)
/// - bump: u8 (1 byte)
///
fn process_initialize_inner(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if accounts.len() < 3 {
        msg!("Error: Initialize instruction requires 3 accounts (slab, payer, system_program)");
        return Err(PercolatorError::InvalidInstruction.into());
    }

    let slab_account = &accounts[0];
    let payer = &accounts[1];
    let system_program = &accounts[2];

    validate_writable(slab_account)?;
    validate_writable(payer)?;

    // Parse instruction data
    let mut reader = InstructionReader::new(data);
    let lp_owner_bytes = reader.read_bytes::<32>()?;
    let router_id_bytes = reader.read_bytes::<32>()?;
    let instrument_bytes = reader.read_bytes::<32>()?;
    let mark_px = reader.read_i64()?;
    let taker_fee_bps = reader.read_i64()?;
    let contract_size = reader.read_i64()?;
    let bump = reader.read_u8()?;

    let lp_owner = Pubkey::from(lp_owner_bytes);
    let router_id = Pubkey::from(router_id_bytes);
    let instrument = Pubkey::from(instrument_bytes);

    // Create account if it doesn't exist (lamports == 0)
    if slab_account.lamports() == 0 {
        msg!("Creating slab PDA account...");

        use crate::state::SlabState;

        // Calculate rent
        let rent_lamports = Rent::get()?.minimum_balance(SlabState::LEN);

        // Build seeds for PDA signing
        let bump_seed = [bump];
        let seeds = pinocchio::seeds!(b"slab", lp_owner.as_ref(), instrument.as_ref(), &bump_seed);

        // Step 1: Transfer lamports to PDA (using Transfer instruction)
        let mut transfer_instr = [2u32.to_le_bytes()[0], 2u32.to_le_bytes()[1], 2u32.to_le_bytes()[2], 2u32.to_le_bytes()[3], 0, 0, 0, 0, 0, 0, 0, 0];
        transfer_instr[4..12].copy_from_slice(&rent_lamports.to_le_bytes());

        let transfer_metas = [
            pinocchio::instruction::AccountMeta {
                pubkey: payer.key(),
                is_signer: true,
                is_writable: true,
            },
            pinocchio::instruction::AccountMeta {
                pubkey: slab_account.key(),
                is_signer: false,
                is_writable: true,
            },
        ];

        pinocchio::program::invoke(
            &pinocchio::instruction::Instruction {
                program_id: system_program.key(),
                accounts: &transfer_metas,
                data: &transfer_instr,
            },
            &[payer, slab_account, system_program],
        )?;

        // Step 2: Allocate space for PDA
        let mut allocate_instr = [8u32.to_le_bytes()[0], 8u32.to_le_bytes()[1], 8u32.to_le_bytes()[2], 8u32.to_le_bytes()[3], 0, 0, 0, 0, 0, 0, 0, 0];
        allocate_instr[4..12].copy_from_slice(&(SlabState::LEN as u64).to_le_bytes());

        let allocate_metas = [
            pinocchio::instruction::AccountMeta {
                pubkey: slab_account.key(),
                is_signer: true, // PDA signs via invoke_signed
                is_writable: true,
            },
        ];

        let signer_seeds_allocate = pinocchio::instruction::Signer::from(&seeds);
        pinocchio::program::invoke_signed(
            &pinocchio::instruction::Instruction {
                program_id: system_program.key(),
                accounts: &allocate_metas,
                data: &allocate_instr,
            },
            &[slab_account, system_program],
            &[signer_seeds_allocate],
        )?;

        // Step 3: Assign owner to this program
        let mut assign_instr = [1u32.to_le_bytes()[0], 1u32.to_le_bytes()[1], 1u32.to_le_bytes()[2], 1u32.to_le_bytes()[3], 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        assign_instr[4..36].copy_from_slice(program_id.as_ref());

        let assign_metas = [
            pinocchio::instruction::AccountMeta {
                pubkey: slab_account.key(),
                is_signer: true, // PDA signs via invoke_signed
                is_writable: true,
            },
        ];

        let signer_seeds_assign = pinocchio::instruction::Signer::from(&seeds);
        pinocchio::program::invoke_signed(
            &pinocchio::instruction::Instruction {
                program_id: system_program.key(),
                accounts: &assign_metas,
                data: &assign_instr,
            },
            &[slab_account, system_program],
            &[signer_seeds_assign],
        )?;
    }

    // Now validate ownership
    validate_owner(slab_account, program_id)?;

    // Call the initialization logic
    process_initialize_slab(
        program_id,
        slab_account,
        lp_owner,
        router_id,
        instrument,
        mark_px,
        taker_fee_bps,
        contract_size,
        bump,
    )?;

    msg!("Slab initialized successfully");
    Ok(())
}

/// Process commit_fill instruction (v0 - atomic fill)
///
/// Expected accounts:
/// 0. `[writable]` Slab state account
/// 1. `[writable]` Fill receipt account
/// 2. `[signer]` Router signer
/// 3. `[]` Oracle account (price feed)
///
/// Expected data layout (22 bytes):
/// - expected_seqno: u32 (4 bytes) - expected slab seqno (TOCTOU protection)
/// - order_type: u8 (1 byte) - 0 = Market, 1 = Limit
/// - side: u8 (1 byte) - 0 = Buy, 1 = Sell
/// - qty: i64 (8 bytes) - quantity to fill (1e6 scale)
/// - limit_px: i64 (8 bytes) - limit price (1e6 scale)
fn process_commit_fill_inner(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if accounts.len() < 4 {
        msg!("Error: CommitFill instruction requires at least 4 accounts");
        return Err(PercolatorError::InvalidInstruction.into());
    }

    let slab_account = &accounts[0];
    let receipt_account = &accounts[1];
    let router_signer = &accounts[2];
    let oracle_account = &accounts[3];

    // Validate slab account
    validate_owner(slab_account, program_id)?;
    validate_writable(slab_account)?;
    validate_writable(receipt_account)?;

    // Borrow slab state mutably
    let slab = unsafe { borrow_account_data_mut::<SlabState>(slab_account)? };

    // Parse instruction data
    let mut reader = InstructionReader::new(data);
    let expected_seqno = reader.read_u32()?;
    let order_type_byte = reader.read_u8()?;
    let side_byte = reader.read_u8()?;
    let qty = reader.read_i64()?;
    let limit_px = reader.read_i64()?;

    // Convert order type byte to OrderType enum
    let order_type = match order_type_byte {
        0 => OrderType::Market,
        1 => OrderType::Limit,
        _ => {
            msg!("Error: Invalid order type");
            return Err(PercolatorError::InvalidOrderType.into());
        }
    };

    // Convert side byte to Side enum
    let side = match side_byte {
        0 => Side::Buy,
        1 => Side::Sell,
        _ => {
            msg!("Error: Invalid side");
            return Err(PercolatorError::InvalidSide.into());
        }
    };

    // Call the commit_fill logic
    process_commit_fill(
        slab,
        receipt_account,
        oracle_account,
        router_signer.key(),
        expected_seqno,
        order_type,
        side,
        qty,
        limit_px,
    )?;

    msg!("CommitFill processed successfully");
    Ok(())
}
