
use {
    anchor_lang::prelude::*,    
    crate::{
        state::*,
        error::*,
        utils::reward_helper::{
            calculate_current_reward_from_genesis,
            calculate_total_reward_extend,
        },
    },
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
pub struct ConfigStaking<'info> {
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
        init,
        payer = admin,
        space = 8 + CfgUpdateRecord::INIT_SPACE,
        seeds = [
            CFG_UPDATE_RECORD_SEED.as_bytes(), 
            staking_cfg.key().as_ref(), 
            (staking_cfg.updated_times + 1).to_string().as_bytes()
        ],
        bump,
    )]
    pub cfg_update_record: Account<'info, CfgUpdateRecord>,

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

    /// CHECK: This is the authority of the reward vault
    #[account(
        seeds = [REWARD_VAULT_AUTHORITY_SEED.as_bytes()],
        bump = staking_cfg.reward_vault_authority_bump,
    )]
    pub reward_vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = reward_mint,
        associated_token::authority = admin,
        associated_token::token_program = reward_token_program,
    )]
    pub reward_token_account: InterfaceAccount<'info, TokenAccount>,

    pub reward_token_program: Interface<'info, TokenInterface>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
    
}

impl<'info> ConfigStaking<'info> {
    pub fn transfer_reward(&self, amount: u64) -> Result<()> {
        let reward_token_decimals = self.reward_mint.decimals;
        let cpi_ctx = CpiContext::new(
            self.reward_token_program.to_account_info(),
            TransferChecked {
                from: self.reward_token_account.to_account_info(),
                to: self.reward_vault.to_account_info(),
                authority: self.admin.to_account_info(),
                mint: self.reward_mint.to_account_info(),
            },
        );
        transfer_checked(
            cpi_ctx,
            amount,
            reward_token_decimals,
        )?;
        Ok(())
    }
}


pub fn handle_config_staking(
    ctx: Context<ConfigStaking>, 
    reward: Option<u64>, 
    staked_endt_time: Option<i64>
) -> Result<()> {
    let current_time: i64 = Clock::get()?.unix_timestamp;


    let staking_cfg = &ctx.accounts.staking_cfg;
    let StakingCfg{
        staked_end_time: staked_end_time_before,
        accumulated_reward,
        latest_reward,
        latest_reward_time,
        ..
    } = **staking_cfg;

    require_gt!(staked_end_time_before, current_time, StakingError::InvalidStakedEndTime);
    // check if the staked end time is future 
    let staked_end_time_i64 = match staked_endt_time {
        Some(time) if time <= current_time || time <= staked_end_time_before 
        => return Err(StakingError::InvalidStakedEndTime.into()),
        Some(time) => time,
        None => staked_end_time_before,
    };

    // get the reward 
    let reward_u64 = match reward {
        Some(reward) if reward == 0 => return Err(StakingError::InvalidReward.into()),
        Some(reward) => reward,
        None => ctx.accounts.cfg_update_record.reward,
    };

    // calculate the current reward from genesis
    let current_reward_from_genesis = calculate_current_reward_from_genesis(
        accumulated_reward,
        current_time,
        latest_reward,
        latest_reward_time,
    )?;

    // calculate the total reward needed to be added
    let total_reward_needed = calculate_total_reward_extend(
        reward_u64,
        current_time,
        staked_end_time_i64,
        current_reward_from_genesis,
        &ctx.accounts.staking_cfg,
    )?;


    let total_reward_needed_scale = total_reward_needed.checked_mul(10_u64.pow(ctx.accounts.reward_mint.decimals as u32)).ok_or(StakingError::ProgramMulError)?;
    msg!("total_reward_needed: {}", total_reward_needed);
    msg!("reward_vault balance: {}", ctx.accounts.reward_vault.amount);
    msg!("total_reward_needed_scale: {}", total_reward_needed_scale);

    if total_reward_needed_scale > ctx.accounts.reward_vault.amount {
        // transfer the reward to the reward vault
        let reward_transfer_amount = total_reward_needed_scale.checked_sub(ctx.accounts.reward_vault.amount).ok_or(StakingError::ProgramSubError)?;
        ctx.accounts.transfer_reward(reward_transfer_amount)?;
    }

    let staking_cfg = &mut ctx.accounts.staking_cfg;

    // archived the last cfg update record
    let cfg_update_record = &mut ctx.accounts.cfg_update_record;
    **cfg_update_record = CfgUpdateRecord::init(
        ctx.bumps.cfg_update_record,
        staking_cfg.updated_times.checked_add(1).ok_or(StakingError::ProgramAddError)?,
        staking_cfg.latest_reward,
        staking_cfg.latest_reward_time,
    );

    // update the staking config
    staking_cfg.updated_times = staking_cfg.updated_times.checked_add(1).ok_or(StakingError::ProgramAddError)?;
    staking_cfg.accumulated_reward = current_reward_from_genesis;
    staking_cfg.latest_reward = reward_u64;
    staking_cfg.latest_reward_time = current_time;
    staking_cfg.staked_end_time = staked_end_time_i64;


    Ok(())
}