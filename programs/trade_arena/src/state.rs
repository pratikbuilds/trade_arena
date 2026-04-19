use anchor_lang::prelude::*;

/// Starting virtual USDC given to each player (10,000 USDC, 6 decimals)
pub const VIRTUAL_STARTING_BALANCE: u64 = 10_000_000_000;

#[account]
#[derive(InitSpace)]
pub struct Game {
    /// Creator's pubkey — also used in the PDA seed
    pub creator: Pubkey,
    /// Caller-supplied nonce used in PDA seed (lets one wallet host multiple games)
    pub game_id: u64,
    /// Pyth push-oracle price feed for the single tradeable asset
    pub asset_feed: Pubkey,
    /// Real USDC entry fee per player (6 decimals)
    pub entry_fee: u64,
    /// Game duration in seconds — must be 300 (5 min) or 900 (15 min)
    pub duration: i64,
    /// Unix timestamp set when `start_game` is called
    pub start_time: i64,
    pub status: GameStatus,
    pub player_count: u32,
    pub max_players: u32,
    /// Accumulated real USDC in the prize vault
    pub prize_pool: u64,
    /// SPL token mint for the entry fee (expected to be USDC)
    pub usdc_mint: Pubkey,
    /// Highest virtual portfolio value seen so far (updated in `end_game`)
    pub leader_value: u64,
    /// Set once in `end_game` — only this pubkey can call `claim_prize`
    pub winner: Option<Pubkey>,
    pub bump: u8,
    pub vault_bump: u8,
}

/// Per-player ephemeral trading state.
///
/// This account is designed to be **delegated** to the MagicBlock ephemeral
/// rollup after `join_game`, enabling sub-second `open_position` /
/// `close_position` transactions. Before `end_game` is called, each player
/// must run `commit_player` to push their final state back to base layer.
///
/// Only one net position is tracked at a time (`position_size > 0`).
/// Reopening in the same direction scales in; opening the opposite direction
/// reduces, closes, or flips that net position in place.
#[account]
#[derive(InitSpace)]
pub struct PlayerState {
    pub player: Pubkey,
    pub game: Pubkey,
    /// Virtual cash on hand (6 decimals, starts at VIRTUAL_STARTING_BALANCE)
    pub virtual_usdc: u64,
    /// Units of the game asset currently held (6 decimals). 0 = flat (no position).
    pub position_size: u64,
    /// Only meaningful when `position_size > 0`
    pub position_side: Side,
    /// Normalized entry price: USD × 1_000_000 (set when position opened)
    pub entry_price: u64,
    /// Cumulative PnL from *closed* positions (signed, USDC 6 decimals)
    pub realized_pnl: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, InitSpace, PartialEq)]
pub enum Side {
    Long,
    Short,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, PartialEq)]
pub enum GameStatus {
    WaitingForPlayers,
    Active,
    Ended,
}
