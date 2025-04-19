use crate::error::StakingError;
use crate::state::{StakedRecord, StakingCfg};
use anchor_lang::prelude::*;

pub fn calculate_current_reward_from_genesis(
    accumulated_reward: u64,
    staked_end_time: i64,
    latest_reward: u64,
    latest_reward_time: i64,
) -> Result<u64> {
    let time_diff = staked_end_time
        .checked_sub(latest_reward_time)
        .ok_or(StakingError::InvalidTimeDiff)?;
    let time_diff_u64 = match u64::try_from(time_diff) {
        Ok(v) => v,
        Err(_) => {
            return err!(StakingError::InvalidTimeDiff);
        }
    };
    let reward_additional = time_diff_u64
        .checked_mul(latest_reward)
        .ok_or(StakingError::ProgramMulError)?;

    let reward = accumulated_reward
        .checked_add(reward_additional)
        .ok_or(StakingError::ProgramAddError)?;
    Ok(reward)
}

pub fn enable_for_reward(
    current_time: i64,
    staked_end_time: i64,
    minimum_period: i64,
    staked_record: &StakedRecord,
) -> Result<(bool, i64)> {
    //calculate the stake end time
    let staked_end_time: i64 = staked_end_time.min(current_time);

    let reward_mininum_time = staked_record
        .staked_at
        .checked_add(minimum_period)
        .ok_or(StakingError::ProgramAddError)?;

    Ok((staked_end_time > reward_mininum_time, staked_end_time))
}

pub fn calculate_reward_for_withdraw(
    accumulated_reward: u64,
    staked_end_time: i64,
    reward_from_staked_start_time: u64,
    latest_reward: u64,
    latest_reward_time: i64,
) -> Result<(u64, u64)> {
    let reward_for_staked_end_time = calculate_current_reward_from_genesis(
        accumulated_reward,
        staked_end_time,
        latest_reward,
        latest_reward_time,
    )?;

    let reward_for_withdraw = reward_for_staked_end_time
        .checked_sub(reward_from_staked_start_time)
        .ok_or(StakingError::ProgramSubError)?;
    Ok((reward_for_withdraw, reward_for_staked_end_time))
}

pub fn calculate_total_reward_extend(
    latest_reward: u64,
    latest_reward_time: i64,
    staked_end_time: i64,
    current_reward_from_genesis: u64,
    staking_cfg: &StakingCfg,
) -> Result<u64> {
    let total_reward_to_staked_end_time = calculate_current_reward_from_genesis(
        current_reward_from_genesis,
        staked_end_time,
        latest_reward,
        latest_reward_time,
    )?;

    let single_future_reward = total_reward_to_staked_end_time
        .checked_sub(current_reward_from_genesis)
        .ok_or(StakingError::ProgramSubError)?;

    let total_future_reward = single_future_reward
        .checked_mul(staking_cfg.max_staked_amount)
        .ok_or(StakingError::ProgramMulError)?;

    let total_current_reward = current_reward_from_genesis
        .checked_mul(staking_cfg.staked_amount)
        .ok_or(StakingError::ProgramMulError)?;

    let max_total_reward = total_future_reward
        .checked_add(total_current_reward)
        .ok_or(StakingError::ProgramSubError)?;

    let actual_total_reward = max_total_reward
        .checked_sub(staking_cfg.total_reward_based_on_staked_time)
        .ok_or(StakingError::ProgramSubError)?;

    Ok(actual_total_reward)
}

pub fn calculate_reward_to_close_return(
    staked_end_time: i64,
    reward_amount: u64,
    reward_decimals: u8,
    staking_cfg: &StakingCfg,
) -> Result<u64> {
    let single_reward_to_staked_end_time = calculate_current_reward_from_genesis(
        staking_cfg.accumulated_reward,
        staked_end_time,
        staking_cfg.latest_reward,
        staking_cfg.latest_reward_time,
    )?;

    let total_reward_to_staked_end_time = single_reward_to_staked_end_time
        .checked_mul(staking_cfg.staked_amount)
        .ok_or(StakingError::ProgramMulError)?;

    let total_reward_to_send = total_reward_to_staked_end_time
        .checked_sub(staking_cfg.total_reward_based_on_staked_time)
        .ok_or(StakingError::ProgramSubError)?;

    let total_reward_to_send_scale = total_reward_to_send
        .checked_mul(10_u64.pow(reward_decimals as u32))
        .ok_or(StakingError::ProgramMulError)?;

    let reward_to_return_scale = reward_amount
        .checked_sub(total_reward_to_send_scale)
        .ok_or(StakingError::ProgramSubError)?;

    Ok(reward_to_return_scale)
}
