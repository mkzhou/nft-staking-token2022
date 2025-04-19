use anchor_lang::error_code;

#[error_code]
pub enum StakingError {
    #[msg("Invalid staked end time")]
    InvalidStakedEndTime,
    #[msg("Invalid max staked amount")]
    InvalidMaxStakedAmount,
    #[msg("Invalid minimum period")]
    InvalidMinimumPeriod,
    #[msg("Program sub error")]
    ProgramSubError,
    #[msg("Program mul error")]
    ProgramMulError,
    #[msg("Program add error")]
    ProgramAddError,
    #[msg("Program div error")]
    ProgramDivError,
    #[msg("Failed time conversion")]
    FailedTimeConversion,
    #[msg("Invalid reward mint")]
    InvalidRewardMint,
    #[msg("Invalid order id")]
    InvalidOrderId,
    #[msg("Invalid nft supply")]
    InvalidNftSupply,
    #[msg("Invalid nft amount")]
    InvalidNftAmount,
    #[msg("Invalid group mint")]
    InvalidGroupMint,
    #[msg("Invalid time diff")]
    InvalidTimeDiff,
    #[msg("Staking not active")]
    StakingNotActive,
    #[msg("Stake end time expired")]
    StakeEndTimeExpired,
    #[msg("Max staked amount exceeded")]
    MaxStakedAmountExceeded,
    #[msg("Stake period insufficient")]
    StakePeriodInsufficient,
    #[msg("Insufficient reward")]
    InsufficientReward,
    #[msg("Invalid reward")]
    InvalidReward,
    #[msg("Nft mint not match group mint")]
    NftMintNotMatchGroupMint,
}
