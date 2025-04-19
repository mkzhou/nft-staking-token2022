use {
    crate::{
        state::*,
        error::*,
        utils::reward_helper::calculate_reward_to_close_return,
    },
    anchor_lang::prelude::*,
    anchor_spl::{
        associated_token::AssociatedToken,
        token_interface::{
            Mint, 
            TokenAccount, 
            TokenInterface
        },
        token_2022::{
            TransferChecked, 
            transfer_checked, 
        },
    },
};


#[derive(Accounts)]
pub struct CloseStaking<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [
            STAKING_CFG_SEED.as_bytes(), 
            staking_cfg.group_mint.key().as_ref(), 
            admin.key().as_ref()
        ],
        bump = staking_cfg.bump,
        has_one = admin,
        constraint = staking_cfg.is_active @ StakingError::StakingNotActive,
    )]
    pub staking_cfg: Account<'info, StakingCfg>,

    #[account(
        mut,
        mint::token_program = reward_token_program,
        constraint = reward_mint.key() == staking_cfg.reward_token_mint @ StakingError::InvalidRewardMint,
    )]
    pub reward_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::authority = reward_vault_authority,
        associated_token::mint = reward_mint,
        associated_token::token_program = reward_token_program,
    )]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = reward_mint,
        associated_token::authority = admin,
        associated_token::token_program = reward_token_program,
    )]
    pub reward_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: This is the authority of the reward vault
    #[account(
        seeds = [REWARD_VAULT_AUTHORITY_SEED.as_bytes()],
        bump = staking_cfg.reward_vault_authority_bump,
    )]
    pub reward_vault_authority: UncheckedAccount<'info>,

    pub reward_token_program: Interface<'info, TokenInterface>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
    
}

impl<'info> CloseStaking<'info> {
    pub fn transfer_reward(&self, amount: u64) -> Result<()> {
        let reward_token_decimals = self.reward_mint.decimals;

        let cpi_program = self.reward_token_program.to_account_info();
        let transfer_checked_accounts = TransferChecked {
            from: self.reward_vault.to_account_info(),
            mint: self.reward_mint.to_account_info(),
            to: self.reward_token_account.to_account_info(),
            authority: self.reward_vault_authority.to_account_info(),
        };

        let signer_seeds: &[&[&[u8]]] = &[&[
            REWARD_VAULT_AUTHORITY_SEED.as_bytes(),
            &[self.staking_cfg.reward_vault_authority_bump],
        ]];

        let cpi_ctx = CpiContext::new_with_signer(
            cpi_program,
            transfer_checked_accounts,
            signer_seeds,
        );

        transfer_checked(cpi_ctx, amount, reward_token_decimals)
    }
}



pub fn handle_close_staking(
    ctx: Context<CloseStaking>,
) -> Result<()> {
    //get the staked end time
    let current_time = Clock::get()?.unix_timestamp;

    let staked_end_time = current_time.min(ctx.accounts.staking_cfg.staked_end_time);

    // calculate the reward to return
    let reward_to_return_scale = calculate_reward_to_close_return(
        staked_end_time,
        ctx.accounts.reward_vault.amount,
        ctx.accounts.reward_mint.decimals,
        &ctx.accounts.staking_cfg,
    )?;

    // transfer the reward to the admin
    if reward_to_return_scale > 0 {
        ctx.accounts.transfer_reward(reward_to_return_scale)?;
    }

    // update the staking config
    let staking_cfg = &mut ctx.accounts.staking_cfg;
    staking_cfg.close_staking(staked_end_time)?;
    Ok(())
}

