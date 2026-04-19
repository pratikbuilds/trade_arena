use crate::constants::*;
use crate::state::*;
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

/// Commits the player's final ER state back to base layer and undelegates
/// the `PlayerState` account.
///
/// **Send to: Ephemeral Rollup endpoint.**
///
/// Call this after the game ends (or before if the player is done trading).
/// Once committed, the account is readable on base layer and can be processed
/// by `end_game`.
#[commit]
#[derive(Accounts)]
pub struct CommitPlayer<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    pub game: Account<'info, Game>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, game.key().as_ref(), player.key().as_ref()],
        bump = player_state.bump,
        constraint = player_state.player == player.key(),
    )]
    pub player_state: Account<'info, PlayerState>,
}

pub fn handler(ctx: Context<CommitPlayer>) -> Result<()> {
    // Serialize account data before committing so the ER has the final state
    ctx.accounts.player_state.exit(&crate::ID)?;
    commit_and_undelegate_accounts(
        &ctx.accounts.player,
        vec![&ctx.accounts.player_state.to_account_info()],
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
    )?;
    Ok(())
}
