pub mod reward_helper;
use anchor_lang::prelude::*;
use crate::error::*;


pub fn calc_total_reward_emission(
    reward: u64,
    max_staked_amount: u64,
    staked_start_time: i64,
    staked_end_time: i64,
) -> Result<u64> {
    let total_staked_period = staked_end_time.checked_sub(staked_start_time).ok_or(StakingError::ProgramSubError)?;

    let total_staked_period_u64: u64 = match total_staked_period.try_into() {
        Ok(v) => v,
        Err(_) => return Err(StakingError::FailedTimeConversion.into()),
    };

    let total_reward_emission = reward.checked_mul(total_staked_period_u64).ok_or(StakingError::ProgramMulError)?;
    let total_reward_emission = total_reward_emission.checked_mul(max_staked_amount).ok_or(StakingError::ProgramMulError)?;

    Ok(total_reward_emission)
}