//! Initialize instruction - initialize router accounts

use crate::pda::derive_registry_pda;
use crate::state::SlabRegistry;
use percolator_common::*;
use pinocchio::{
    account_info::AccountInfo,
    msg,
    pubkey::Pubkey,
};

/// Process initialize instruction for registry
///
/// Creates and initializes the slab registry PDA account with governance authority.
/// The registry account is created via CPI using the derived PDA.
///
/// # Security Checks
/// - Verifies registry PDA derivation is correct
/// - Verifies governance pubkey is valid
/// - Prevents double initialization
/// - Requires payer to sign
///
/// # Arguments
/// * `program_id` - The router program ID
/// * `registry_account` - The registry PDA account (will be created if doesn't exist)
/// * `payer` - Account paying for rent
/// * `system_program` - System program for account creation
/// * `governance` - The governance authority pubkey
pub fn process_initialize_registry(
    program_id: &Pubkey,
    registry_account: &AccountInfo,
    payer: &AccountInfo,
    system_program: &AccountInfo,
    governance: &Pubkey,
) -> Result<(), PercolatorError> {
    // Derive the registry PDA
    let (registry_pda, bump) = derive_registry_pda(program_id);

    // SECURITY: Verify the provided registry account matches the derived PDA
    if registry_account.key() != &registry_pda {
        msg!("Error: Invalid registry PDA");
        return Err(PercolatorError::InvalidAccount);
    }

    // SECURITY: Verify payer is signer
    if !payer.is_signer() {
        msg!("Error: Payer must be a signer");
        return Err(PercolatorError::Unauthorized);
    }

    // SECURITY: Verify governance pubkey is valid (not zero/default)
    if governance == &Pubkey::default() {
        msg!("Error: Invalid governance pubkey");
        return Err(PercolatorError::InvalidAccount);
    }

    // Check if account already exists and is initialized
    let data_len = {
        let data = registry_account.try_borrow_data()
            .map_err(|_| PercolatorError::InvalidAccount)?;
        data.len()
    };

    if data_len == SlabRegistry::LEN {
        // Account is fully allocated, check if already initialized
        let data = registry_account.try_borrow_data()
            .map_err(|_| PercolatorError::InvalidAccount)?;

        // Check if already initialized (router_id should be zero if uninitialized)
        let mut is_initialized = false;
        for i in 0..32 {
            if data[i] != 0 {
                is_initialized = true;
                break;
            }
        }

        if is_initialized {
            msg!("Error: Registry account is already initialized");
            return Err(PercolatorError::AlreadyInitialized);
        }
        drop(data);
        // Account is allocated but not initialized, proceed to initialization below
    } else if registry_account.lamports() > 0 && data_len == 0 {
        // Account has lamports (funded by client) but no data - need to allocate and assign
        msg!("Allocating registry PDA account");

        use pinocchio::program::invoke_signed;
        use pinocchio::instruction::{Seed, Signer, AccountMeta, Instruction};

        // Prepare PDA signer seeds
        let bump_seed = [bump];
        let seeds = [
            Seed::from(b"registry" as &[u8]),
            Seed::from(&bump_seed[..]),
        ];

        // Step 1: Allocate space (PDA must sign)
        // System Program Allocate instruction: index 8, [space: u64]
        let mut allocate_data = [0u8; 12];
        allocate_data[0..4].copy_from_slice(&8u32.to_le_bytes()); // Allocate instruction index
        allocate_data[4..12].copy_from_slice(&(SlabRegistry::LEN as u64).to_le_bytes());

        let allocate_ix = Instruction {
            program_id: system_program.key(),
            accounts: &[
                AccountMeta::writable_signer(registry_account.key()),
            ],
            data: &allocate_data,
        };

        let signer = Signer::from(&seeds);
        invoke_signed(&allocate_ix, &[registry_account], &[signer])
            .map_err(|_| PercolatorError::InvalidAccount)?;

        // Step 2: Assign owner (PDA must sign)
        // System Program Assign instruction: index 1, [owner: Pubkey]
        let mut assign_data = [0u8; 36];
        assign_data[0..4].copy_from_slice(&1u32.to_le_bytes()); // Assign instruction index
        assign_data[4..36].copy_from_slice(program_id.as_ref());

        let assign_ix = Instruction {
            program_id: system_program.key(),
            accounts: &[
                AccountMeta::writable_signer(registry_account.key()),
            ],
            data: &assign_data,
        };

        let signer = Signer::from(&seeds);
        invoke_signed(&assign_ix, &[registry_account], &[signer])
            .map_err(|_| PercolatorError::InvalidAccount)?;

        msg!("Registry PDA account allocated and assigned");
    } else if registry_account.lamports() == 0 {
        // Account doesn't exist at all - create it via CPI
        msg!("Creating registry PDA account via CPI");

        use pinocchio::sysvars::{rent::Rent, Sysvar};
        use pinocchio::program::invoke_signed;
        use pinocchio::instruction::{Seed, Signer, AccountMeta, Instruction};

        let rent = Rent::get().map_err(|_| PercolatorError::InvalidAccount)?;
        let lamports = rent.minimum_balance(SlabRegistry::LEN);

        let bump_seed = [bump];
        let seeds = [
            Seed::from(b"registry" as &[u8]),
            Seed::from(&bump_seed[..]),
        ];

        // Transfer lamports from payer to PDA
        let mut transfer_data = [0u8; 12];
        transfer_data[0..4].copy_from_slice(&2u32.to_le_bytes()); // Transfer instruction
        transfer_data[4..12].copy_from_slice(&lamports.to_le_bytes());

        let transfer_ix = Instruction {
            program_id: system_program.key(),
            accounts: &[
                AccountMeta::writable_signer(payer.key()),
                AccountMeta::writable(registry_account.key()),
            ],
            data: &transfer_data,
        };

        use pinocchio::program::invoke;
        invoke(&transfer_ix, &[payer, registry_account])
            .map_err(|_| PercolatorError::InvalidAccount)?;

        // Allocate space
        let mut allocate_data = [0u8; 12];
        allocate_data[0..4].copy_from_slice(&8u32.to_le_bytes());
        allocate_data[4..12].copy_from_slice(&(SlabRegistry::LEN as u64).to_le_bytes());

        let allocate_ix = Instruction {
            program_id: system_program.key(),
            accounts: &[
                AccountMeta::writable_signer(registry_account.key()),
            ],
            data: &allocate_data,
        };

        let signer = Signer::from(&seeds);
        invoke_signed(&allocate_ix, &[registry_account], &[signer])
            .map_err(|_| PercolatorError::InvalidAccount)?;

        // Assign owner
        let mut assign_data = [0u8; 36];
        assign_data[0..4].copy_from_slice(&1u32.to_le_bytes());
        assign_data[4..36].copy_from_slice(program_id.as_ref());

        let assign_ix = Instruction {
            program_id: system_program.key(),
            accounts: &[
                AccountMeta::writable_signer(registry_account.key()),
            ],
            data: &assign_data,
        };

        let signer = Signer::from(&seeds);
        invoke_signed(&assign_ix, &[registry_account], &[signer])
            .map_err(|_| PercolatorError::InvalidAccount)?;

        msg!("Registry PDA account created via CPI");
    } else {
        // Account exists with wrong size (e.g., from previous deployment with different MAX_SLABS)
        // This can happen if the account was created with old size
        msg!("Error: Registry account has wrong size - please close and recreate");
        return Err(PercolatorError::InvalidAccount);
    }

    // Initialize the registry in-place (avoids stack overflow)
    // Store the authority PDA in the registry for future authority checks
    let registry = unsafe { borrow_account_data_mut::<SlabRegistry>(registry_account)? };

    registry.initialize_in_place(registry_pda, *governance, bump);

    msg!("Registry initialized successfully");
    Ok(())
}

// Exclude test module from BPF builds to avoid stack overflow from test-only functions
#[cfg(all(test, not(target_os = "solana")))]
#[path = "initialize_test.rs"]
mod initialize_test;
