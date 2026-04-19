use anchor_lang::prelude::*;

#[error_code]
pub enum TradeArenaError {
    #[msg("Duration must be 300 (5 min) or 900 (15 min) seconds")]
    InvalidDuration,
    #[msg("Max players must be at least 2")]
    InvalidMaxPlayers,
    #[msg("Entry fee must be greater than zero")]
    InvalidEntryFee,
    #[msg("Game is not accepting new players")]
    GameNotJoinable,
    #[msg("Game is full")]
    GameFull,
    #[msg("Game is not active")]
    GameNotActive,
    #[msg("Game has already started")]
    GameAlreadyStarted,
    #[msg("Not enough players to start (minimum 2)")]
    NotEnoughPlayers,
    #[msg("Game duration has not elapsed yet")]
    GameNotOver,
    #[msg("Commit window has not passed — wait for players to undelegate")]
    CommitWindowNotOver,
    #[msg("Game has not ended")]
    GameNotEnded,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Player already has an open position — close it first")]
    PositionAlreadyOpen,
    #[msg("No open position to close")]
    NoOpenPosition,
    #[msg("Size must be greater than zero")]
    InvalidSize,
    #[msg("Insufficient virtual USDC balance")]
    InsufficientVirtualBalance,
    #[msg("Invalid Pyth price feed account")]
    InvalidPriceFeed,
    #[msg("Pyth price feed is stale or in non-trading status")]
    PriceFeedStale,
    #[msg("Price must be positive")]
    InvalidPrice,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Price feed does not match this game's asset")]
    WrongPriceFeed,
    #[msg("Number of player accounts must equal game.player_count")]
    WrongPlayerCount,
    #[msg("Remaining player state account is invalid for this game")]
    InvalidPlayerState,
    #[msg("Duplicate player state account provided")]
    DuplicatePlayerState,
    #[msg("No committed player states found — all players may still be on ER")]
    NoCommittedPlayers,
    #[msg("Not the winner")]
    NotWinner,
    #[msg("Prize vault is empty")]
    NoPrize,
    #[msg("Game timer has run out — no new positions allowed")]
    GameEnded,
}
