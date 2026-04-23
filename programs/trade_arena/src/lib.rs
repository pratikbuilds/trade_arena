pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub use instructions::*;
pub use state::*;

declare_id!("ETZ1wJJihV6xfcf9GtCp9sNp2cv6cMGeyuFPSVHQJ4C5");

#[ephemeral]
#[program]
pub mod trade_arena {
    use super::*;

    // ── Base layer ────────────────────────────────────────────────────────────

    pub fn create_game(
        ctx: Context<CreateGame>,
        game_id: u64,
        entry_fee: u64,
        duration: i64,
        max_players: u32,
    ) -> Result<()> {
        create_game::handler(ctx, game_id, entry_fee, duration, max_players)
    }

    pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
        join_game::handler(ctx)
    }

    /// Delegate `PlayerState` to the ER. Send to **base layer**.
    pub fn delegate_player(ctx: Context<DelegatePlayer>) -> Result<()> {
        delegate_player::handler(ctx)
    }

    /// Delegate `Game` account to the ER. Send to **base layer**.
    /// Call after all players have joined and before `start_game`.
    pub fn delegate_game(ctx: Context<DelegateGame>, game_id: u64) -> Result<()> {
        delegate_game::handler(ctx, game_id)
    }

    pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
        claim_prize::handler(ctx)
    }

    // ── Ephemeral Rollup ──────────────────────────────────────────────────────

    /// Set the game live. Send to **Ephemeral Rollup endpoint**.
    pub fn start_game(ctx: Context<StartGame>) -> Result<()> {
        start_game::handler(ctx)
    }

    /// Send to: **Ephemeral Rollup endpoint**.
    pub fn trade_position(ctx: Context<TradePosition>, action: TradeAction) -> Result<()> {
        trade_position::handler(ctx, action)
    }

    /// Commit individual player ER state back to base (optional cleanup).
    /// Send to: **Ephemeral Rollup endpoint**.
    pub fn commit_player(ctx: Context<CommitPlayer>) -> Result<()> {
        commit_player::handler(ctx)
    }

    /// Rank all players and record the winner. Send to **Ephemeral Rollup endpoint**.
    /// Pass all `PlayerState` accounts as `remaining_accounts`.
    pub fn end_game(ctx: Context<EndGame>) -> Result<()> {
        end_game::handler(ctx)
    }

    /// Push the final game result from ER to base layer.
    /// Send to: **Ephemeral Rollup endpoint**.
    pub fn commit_game<'info>(
        ctx: Context<'_, '_, '_, 'info, CommitGame<'info>>,
    ) -> Result<()> {
        commit_game::handler(ctx)
    }
}
