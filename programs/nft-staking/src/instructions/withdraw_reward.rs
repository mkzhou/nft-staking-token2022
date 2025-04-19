use {
    anchor_lang::prelude::*,
    crate::{
        state::*,
        error::*,
        utils::reward_helper::{
            enable_for_reward,
            calculate_reward_for_withdraw,
        },
    },
    anchor_spl::{
        associated_token::AssociatedToken,
        token_interface::{
            Mint, 
            TokenAccount,
            TokenInterface},
        token_2022::{
            TransferChecked,
            transfer_checked,
        },
        
    },
};

#[derive(Accounts)]
pub struct WithdrawReward<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,
    
    #[account(
        mut,
        seeds = [
            STAKING_CFG_SEED.as_bytes(), 
            staking_cfg.group_mint.key().as_ref(), 
            staking_cfg.admin.key().as_ref()
        ],
        bump = staking_cfg.bump,
    )]
    pub staking_cfg: Account<'info, StakingCfg>,
    
    #[account(
        mut,
        seeds = [
            STAKED_RECORD_SEED.as_bytes(),
            staking_cfg.key().as_ref(),
            staked_record.nft_mint.as_ref()
        ],
        bump = staked_record.bump,
        has_one = staker,
    )]
    pub staked_record: Account<'info, StakedRecord>,

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
        init_if_needed,
        payer = staker,
        associated_token::mint = reward_mint,
        associated_token::authority = staker,
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

impl<'info> WithdrawReward<'info> {
    pub fn transfer_reward(&self, reward_amount: u64) -> Result<()> {
        let reward_token_decimals = self.reward_mint.decimals;

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
        let cpi_program = self.reward_token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(
            cpi_program, 
            transfer_checked_accounts, 
            signer_seeds
        );
        transfer_checked(cpi_ctx, reward_amount, reward_token_decimals)
    }       
}

pub fn handle_withdraw_reward(ctx: Context<WithdrawReward>) -> Result<()> {

    let current_time: i64 = Clock::get()?.unix_timestamp;

    let staking_cfg = &ctx.accounts.staking_cfg;
    let StakingCfg{
        staked_end_time,
        minimum_period,
        accumulated_reward,
        latest_reward,
        latest_reward_time,
        ..
    } = **staking_cfg;

    //check if the reward is enabled
    let (is_reward_enabled, staked_end_time) = enable_for_reward(
        current_time, 
        staked_end_time, 
        minimum_period, 
        &ctx.accounts.staked_record
    )?;

    if !is_reward_enabled {
        return Err(StakingError::StakePeriodInsufficient.into());
    }

    //calculate the reward
    let (reward_amount, reward_for_staked_end_time) = calculate_reward_for_withdraw(
        accumulated_reward, 
        staked_end_time, 
        ctx.accounts.staked_record.reward_based_on_staked_time, 
        latest_reward,
        latest_reward_time,
    )?;

    //check if the reward vault is enough
    let reward_amount_scaled = reward_amount.checked_mul(10_u64.pow(ctx.accounts.reward_mint.decimals as u32)).ok_or(StakingError::ProgramMulError)?;
    if reward_amount_scaled > ctx.accounts.reward_vault.amount {
        return Err(StakingError::InsufficientReward.into());
    }
    //transfer the reward to the reward recipient
    ctx.accounts.transfer_reward(reward_amount_scaled)?;
    //update the staked record
    let staked_record = &mut ctx.accounts.staked_record;
    staked_record.refresh_for_withdraw(
        reward_for_staked_end_time, 
        staked_end_time)?;

    //increase the total reward based on staked time
    let staking_cfg = &mut ctx.accounts.staking_cfg;
    staking_cfg.increase_total_reward_based_on_staked_time(reward_amount)?;
    Ok(())
        
}
