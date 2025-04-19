use {
    anchor_lang::prelude::*,
    spl_token_group_interface::state::TokenGroupMember,
    crate::{
        state::*,
        error::*,
        utils::reward_helper::calculate_current_reward_from_genesis,
    },
    anchor_spl::{
        associated_token::AssociatedToken,
        token_2022::{
            transfer_checked,
            TransferChecked,
            Token2022,
        },
        token_interface::{
            self,
            TokenInterface,
            get_mint_extension_data
        },
    },
};


#[derive(Accounts)]
pub struct Stake<'info> {
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
        constraint = staking_cfg.is_active @ StakingError::StakingNotActive,
    )]
    pub staking_cfg: Account<'info, StakingCfg>,

    #[account(
        init,
        payer = staker,
        space = 8 + StakedRecord::INIT_SPACE,
        seeds = [
            STAKED_RECORD_SEED.as_bytes(),
            staking_cfg.key().as_ref(),
            nft_mint.key().as_ref(),
        ],
        bump,
    )]
    pub staked_record: Account<'info, StakedRecord>,

    #[account(
        mint::token_program = reward_token_program,
        constraint = reward_mint.key() == staking_cfg.reward_token_mint @ StakingError::InvalidRewardMint,
    )]
    pub reward_mint: InterfaceAccount<'info, token_interface::Mint>,

    /// CHECK: This is the group mint
    #[account(
        constraint = group_mint.key() == staking_cfg.group_mint @ StakingError::InvalidGroupMint,
    )]
    pub group_mint: InterfaceAccount<'info, token_interface::Mint>,

    #[account(
        mut,
        associated_token::authority = staker,
        associated_token::mint = nft_mint,
        associated_token::token_program = token_2022_program,
        constraint = nft_token_account.amount == 1 @ StakingError::InvalidNftAmount,
    )]
    pub nft_token_account: InterfaceAccount<'info, token_interface::TokenAccount>,

    #[account(
        mut,
        mint::token_program = token_2022_program,
        constraint = nft_mint.supply == 1 @ StakingError::InvalidNftSupply,
    )]
    pub nft_mint: InterfaceAccount<'info, token_interface::Mint>,
    #[account(
        init_if_needed,
        payer = staker,
        associated_token::authority = nft_vault_authority,
        associated_token::mint = nft_mint,
        associated_token::token_program = token_2022_program,
    )]
    pub nft_vault: InterfaceAccount<'info, token_interface::TokenAccount>,

    /// CHECK: This is the authority of the nft vault
    #[account(
        seeds = [NFT_VAULT_AUTHORITY_SEED.as_bytes()],
        bump,
    )]
    pub nft_vault_authority: AccountInfo<'info>,

    pub reward_token_program: Interface<'info, TokenInterface>,

    pub token_2022_program: Program<'info, Token2022>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

impl<'info> Stake<'info> {
    pub fn validate_group_mint(&self) -> Result<()> {
        let mint_extension_data = get_mint_extension_data::<TokenGroupMember>(&self.nft_mint.to_account_info());

        msg!("mint_extension_data is ok: {:?}", mint_extension_data.is_ok());

        match mint_extension_data {
            Ok(mint_extension_data) if mint_extension_data.group == self.group_mint.key() => {
                Ok(())
            }
            _=> {
                Err(StakingError::NftMintNotMatchGroupMint.into())
            }
        }
    }

    pub fn transfer_nft_ctx(&self) -> CpiContext<'_, '_, '_, 'info, TransferChecked<'info>> {
        CpiContext::new(
            self.token_2022_program.to_account_info(),
            TransferChecked {
                from: self.nft_token_account.to_account_info(),
                to: self.nft_vault.to_account_info(),
                authority: self.staker.to_account_info(),
                mint: self.nft_mint.to_account_info(),
            },
        )
    }
}


pub fn handle_stake(ctx: Context<Stake>) -> Result<()> {
    let current_time: i64 = Clock::get()?.unix_timestamp;

    let staking_cfg = &ctx.accounts.staking_cfg;
    let StakingCfg{
        staked_end_time,
        max_staked_amount,
        staked_amount,
        accumulated_reward,
        latest_reward,
        latest_reward_time,
        ..
    } = **staking_cfg;

    //CHECK THE STAKE END TIME IS EXPIRED
    require_gt!(staked_end_time, current_time, StakingError::StakeEndTimeExpired);
    require_gte!(max_staked_amount, staked_amount + 1, StakingError::MaxStakedAmountExceeded);

    //CHECK THE GROUP MINT IS THE SAME AS THE NFT'S GROUP MINT
    ctx.accounts.validate_group_mint()?;

    //TRANSFER THE NFT FROM THE PAYER TO THE NFT VAULT
    transfer_checked(ctx.accounts.transfer_nft_ctx(), 1, ctx.accounts.nft_mint.decimals)?;
    
    //CALCULATE THE REWARD BASED ON THE STAKED TIME
    let current_reward_from_genesis: u64 = calculate_current_reward_from_genesis(
        accumulated_reward, 
        current_time, 
        latest_reward,
        latest_reward_time,
    )?;

    //INIT THE STAKED RECORD
    let staked_record = &mut ctx.accounts.staked_record;
    **staked_record = StakedRecord::init(
        ctx.bumps.staked_record, 
        ctx.accounts.staker.key(), 
        ctx.accounts.nft_mint.key(), 
        current_time, 
        current_reward_from_genesis
    );

    //UPDATE THE STAKING CFG
    let staking_cfg = &mut ctx.accounts.staking_cfg;
    staking_cfg.increase_staked_amount(1)?;
    staking_cfg.increase_total_reward_based_on_staked_time(current_reward_from_genesis)?;
    Ok(())
}