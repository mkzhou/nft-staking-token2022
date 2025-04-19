use {
    crate::{
        utils::calc_total_reward_emission, 
        state::*,
        error::*
    }, 
    anchor_lang::prelude::*, 
    anchor_spl::{
        associated_token::AssociatedToken, 
        token_2022::{
            transfer_checked, 
            TransferChecked, 
            Token2022
        },
        token_interface::{
            self,
            TokenInterface
        }
    }, 
};


#[derive(Accounts)]
pub struct InitStaking<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init, 
        payer=payer, 
        space=8 + StakingCfg::INIT_SPACE,
        seeds = [
            STAKING_CFG_SEED.as_bytes(), 
            group_mint.key().as_ref(), 
            payer.key().as_ref()
        ],
        bump,
    )]
    pub staking_cfg: Account<'info, StakingCfg>,

    #[account(
        mut,
        associated_token::mint = reward_token_mint,
        associated_token::authority = payer,
        associated_token::token_program = reward_token_program,
    )]
    pub payer_reward_token_account: InterfaceAccount<'info, token_interface::TokenAccount>,

    #[account(
        mint::token_program = reward_token_program,
    )]
    pub reward_token_mint: InterfaceAccount<'info, token_interface::Mint>,

    #[account(
        init_if_needed,
        payer=payer, 
        associated_token::mint = reward_token_mint,
        associated_token::authority = reward_vault_authority,
        associated_token::token_program = reward_token_program,
    )]
    pub reward_vault: InterfaceAccount<'info, token_interface::TokenAccount>,

    /// CHECK: This is the authority of the reward vault
    #[account(
        seeds = [REWARD_VAULT_AUTHORITY_SEED.as_bytes()],
        bump,
    )]
    pub reward_vault_authority: AccountInfo<'info>,

    /// CHECK: This is the authority of the staked vault
    #[account(
        seeds = [NFT_VAULT_AUTHORITY_SEED.as_bytes()],
        bump,
    )]
    pub nft_vault_authority: AccountInfo<'info>,

    #[account(
        mint::token_program = token_2022_program,
    )]
    pub group_mint: InterfaceAccount<'info, token_interface::Mint>,

    pub reward_token_program: Interface<'info, TokenInterface>,

    pub token_2022_program: Program<'info, Token2022>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

impl<'info> InitStaking<'info> {
    pub fn transfer_reward_token(&self) -> CpiContext<'_, '_, '_, 'info, TransferChecked<'info>> {
        let transfer_checked = TransferChecked {
            from: self.payer_reward_token_account.to_account_info(),
            mint: self.reward_token_mint.to_account_info(),
            to: self.reward_vault.to_account_info(),
            authority: self.payer.to_account_info(),
        };
       
        CpiContext::new(
            self.reward_token_program.to_account_info(),
            transfer_checked
        )
    }
}

pub fn handle_init_staking(
    ctx: Context<InitStaking>,
    reward: u64,
    staked_start_time: i64,
    staked_end_time: i64,
    minimum_period: i64,
    max_staked_amount: u64,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    let reward_token_decimals = ctx.accounts.reward_token_mint.decimals;
    //CHECK THE CONDITIONS
    require_gt!(staked_end_time, staked_start_time, StakingError::InvalidStakedEndTime);
    require_gt!(staked_end_time, current_time, StakingError::InvalidMaxStakedAmount);
    require_gte!(minimum_period, 0, StakingError::InvalidMinimumPeriod);
    require_gt!(max_staked_amount, 0, StakingError::InvalidMaxStakedAmount);

    let minimum_reward_time = staked_start_time.checked_add(minimum_period).ok_or(StakingError::InvalidMinimumPeriod)?;
    require_gte!(staked_end_time, minimum_reward_time, StakingError::InvalidMinimumPeriod);

    //CALCULATE THE TOTAL REWARD EMISSION
    let mut total_reward_emission = calc_total_reward_emission(reward, max_staked_amount, staked_start_time, staked_end_time)?;
    total_reward_emission = total_reward_emission.checked_mul(10_u64.pow(reward_token_decimals as u32)).ok_or(StakingError::ProgramMulError)?;
    msg!("total_reward_emission: {}", total_reward_emission);
    //TRANSFER THE REWARD TOKEN TO THE VAULT
    transfer_checked(ctx.accounts.transfer_reward_token(), total_reward_emission, reward_token_decimals)?;

    //INIT THE STAKING CFG
    let staking_cfg = &mut ctx.accounts.staking_cfg;
    **staking_cfg = StakingCfg::init(
        ctx.bumps.staking_cfg,
        ctx.accounts.payer.key(),
        ctx.accounts.group_mint.key(),
        ctx.accounts.reward_token_mint.key(),
        ctx.bumps.reward_vault_authority,
        ctx.bumps.nft_vault_authority,
        max_staked_amount,
        staked_start_time,
        staked_end_time,
        reward,
        current_time,
        minimum_period,
    );

    Ok(())
}