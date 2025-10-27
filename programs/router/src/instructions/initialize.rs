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
    if registry_account.lamports() > 0 {
        // Account exists, check if already initialized
        let data = registry_account.try_borrow_data()
            .map_err(|_| PercolatorError::InvalidAccount)?;

        if data.len() != SlabRegistry::LEN {
            msg!("Error: Registry account has incorrect size");
            return Err(PercolatorError::InvalidAccount);
        }

        // Check if already initialized (router_id should be zero)
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
    } else {
        // Account doesn't exist, create it via CPI
        msg!("Creating registry PDA account");

        // Calculate rent exemption
        use pinocchio::sysvars::{rent::Rent, Sysvar};
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(SlabRegistry::LEN);

        // Create PDA account via CPI
        let create_account_ix = pinocchio::instruction::Instruction {
            program_id: system_program.key(),
            accounts: pinocchio::instruction::AccountMeta {
                pubkey: payer.key(),
                is_signer: true,
                is_writable: true,
            },
            data: &[], // Will be populated by create_account syscall
        };

        // Create account with PDA
        use pinocchio::program::invoke_signed;
        use pinocchio::sysvars::Sysvar;

        invoke_signed(
            &pinocchio::system_instruction::create_account(
                payer.key(),
                registry_account.key(),
                lamports,
                SlabRegistry::LEN as u64,
                program_id,
            ),
            &[payer.clone(), registry_account.clone(), system_program.clone()],
            &[&[b"registry", &[bump]]],
        )?;

        msg!("Registry PDA account created");
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
