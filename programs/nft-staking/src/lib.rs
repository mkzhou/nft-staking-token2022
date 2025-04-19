mod error;
mod instructions;
mod state;
mod utils;
use {anchor_lang::prelude::*, instructions::*};

declare_id!("8ketmx972udmAo4xgLWcVizKF4CXz5jjejbEWv2pVUaJ");

#[program]
pub mod nft_staking {
    use super::*;

    pub fn init_staking(
        ctx: Context<InitStaking>,
        reward: u64,
        staked_start_time: i64,
        staked_end_time: i64,
        minimum_period: i64,
        max_staked_amount: u64,
    ) -> Result<()> {
        handle_init_staking(
            ctx,
            reward,
            staked_start_time,
            staked_end_time,
            minimum_period,
            max_staked_amount,
        )
    }

    pub fn stake(ctx: Context<Stake>) -> Result<()> {
        handle_stake(ctx)
    }

    pub fn unstake(ctx: Context<Unstake>) -> Result<()> {
        handle_unstake(ctx)
    }

    pub fn withdraw_reward(ctx: Context<WithdrawReward>) -> Result<()> {
        handle_withdraw_reward(ctx)
    }

    pub fn config_staking(
        ctx: Context<ConfigStaking>,
        reward: Option<u64>,
        staked_end_time: Option<i64>,
    ) -> Result<()> {
        handle_config_staking(ctx, reward, staked_end_time)
    }

    pub fn close_staking(ctx: Context<CloseStaking>) -> Result<()> {
        handle_close_staking(ctx)
    }
}
