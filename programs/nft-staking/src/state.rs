use {
    crate::error::*,
    anchor_attribute_account::account,
    anchor_lang::{prelude::*, InitSpace},
    solana_program::pubkey::Pubkey,
};

pub const REWARD_VAULT_AUTHORITY_SEED: &str = "reward_vault_authority";
pub const NFT_VAULT_AUTHORITY_SEED: &str = "nft_vault_authority";
pub const STAKING_CFG_SEED: &str = "staking_cfg";
pub const CFG_UPDATE_RECORD_SEED: &str = "cfg_update_record";
pub const STAKED_RECORD_SEED: &str = "staked_record";

#[account]
#[derive(InitSpace)]
pub struct StakingCfg {
    /// The bump seed for the staking cfg account
    pub bump: u8,
    /// The is active
    pub is_active: bool,
    /// administrator
    pub admin: Pubkey,
    /// The group mint
    pub group_mint: Pubkey,
    /// The reward token mint
    pub reward_token_mint: Pubkey,
    /// The reward token vault authority bump
    pub reward_vault_authority_bump: u8,
    /// The staked token vault authority bump
    pub nft_vault_authority_bump: u8,
    /// The maximum staked amount
    pub max_staked_amount: u64,
    /// The staked start time
    pub staked_start_time: i64,
    /// The staked end time
    pub staked_end_time: i64,
    /// The latest reward
    pub latest_reward: u64,
    /// The latest reward time
    pub latest_reward_time: i64,
    /// The accumulated reward
    pub accumulated_reward: u64,
    /// The total staked reward based on staked time
    pub total_reward_based_on_staked_time: u64,
    /// The staked amount
    pub staked_amount: u64,
    /// The minimum stake period to be eligible for reward
    pub minimum_period: i64,
    /// The updated times
    pub updated_times: u32,
}

#[account]
#[derive(InitSpace)]
pub struct CfgUpdateRecord {
    /// The bump seed for the cfg record account
    pub bump: u8,
    /// The order id
    pub order_id: u32,
    /// The reward
    pub reward: u64,
    /// The updated times
    pub updated_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct StakedRecord {
    /// The bump seed for the stake record account
    pub bump: u8,
    /// The staker
    pub staker: Pubkey,
    /// The staked mint
    pub nft_mint: Pubkey,
    /// The staked at
    pub staked_at: i64,
    /// The withdraw at
    pub withdraw_at: i64,
    /// The reward based on the staked time
    pub reward_based_on_staked_time: u64,
}

impl StakingCfg {
    pub fn init(
        bump: u8,
        admin: Pubkey,
        group_mint: Pubkey,
        reward_token_mint: Pubkey,
        reward_vault_authority_bump: u8,
        nft_vault_authority_bump: u8,
        max_staked_amount: u64,
        staked_start_time: i64,
        staked_end_time: i64,
        latest_reward: u64,
        latest_reward_time: i64,
        minimum_period: i64,
    ) -> Self {
        Self {
            is_active: true,
            bump,
            admin,
            group_mint,
            reward_token_mint,
            reward_vault_authority_bump,
            nft_vault_authority_bump,
            max_staked_amount,
            staked_start_time,
            staked_end_time,
            latest_reward,
            latest_reward_time,
            minimum_period,
            accumulated_reward: 0,
            total_reward_based_on_staked_time: 0,
            staked_amount: 0,
            updated_times: 0,
        }
    }

    pub fn decrease_staked_amount(&mut self, amount: u64) -> Result<()> {
        self.staked_amount = self
            .staked_amount
            .checked_sub(amount)
            .ok_or(StakingError::ProgramSubError)?;
        Ok(())
    }

    pub fn increase_staked_amount(&mut self, amount: u64) -> Result<()> {
        self.staked_amount = self
            .staked_amount
            .checked_add(amount)
            .ok_or(StakingError::ProgramAddError)?;
        Ok(())
    }

    pub fn increase_total_reward_based_on_staked_time(&mut self, reward: u64) -> Result<()> {
        self.total_reward_based_on_staked_time = self
            .total_reward_based_on_staked_time
            .checked_add(reward)
            .ok_or(StakingError::ProgramAddError)?;
        Ok(())
    }

    pub fn decrease_total_reward_based_on_staked_time(&mut self, reward: u64) -> Result<()> {
        self.total_reward_based_on_staked_time = self
            .total_reward_based_on_staked_time
            .checked_sub(reward)
            .ok_or(StakingError::ProgramSubError)?;
        Ok(())
    }

    pub fn close_staking(&mut self, staked_end_time: i64) -> Result<()> {
        self.is_active = false;
        self.staked_end_time = staked_end_time;
        self.minimum_period = 0;
        Ok(())
    }
}

impl CfgUpdateRecord {
    pub fn init(bump: u8, order_id: u32, reward: u64, updated_at: i64) -> Self {
        Self {
            bump,
            order_id,
            reward,
            updated_at,
        }
    }
}

impl StakedRecord {
    pub fn init(
        bump: u8,
        staker: Pubkey,
        nft_mint: Pubkey,
        staked_at: i64,
        reward_based_on_staked_time: u64,
    ) -> Self {
        Self {
            bump,
            staker,
            nft_mint,
            staked_at,
            withdraw_at: staked_at,
            reward_based_on_staked_time,
        }
    }

    pub fn refresh_for_withdraw(
        &mut self,
        reward_based_on_staked_time: u64,
        withdraw_at: i64,
    ) -> Result<()> {
        self.reward_based_on_staked_time = reward_based_on_staked_time;
        self.withdraw_at = withdraw_at;
        Ok(())
    }
}
