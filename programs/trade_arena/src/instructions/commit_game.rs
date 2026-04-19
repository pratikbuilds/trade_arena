use crate::state::*;
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

/// Commits the final `Game` state (winner, status, leader_value) from the
/// ephemeral rollup back to base layer and undelegates the account.
///
/// **Send to: Ephemeral Rollup endpoint.**
///
/// Call this immediately after `end_game` succeeds on the ER.  Once
/// committed, the `Game` account is readable on base layer and the winner
/// can call `claim_prize`.
///
/// Anyone can pay for this transaction — it is typically called by the
/// winner (who is incentivised to trigger the payout) or a crank.
#[commit]
#[derive(Accounts)]
pub struct CommitGame<'info> {
    /// Fee payer — anyone can trigger the commit.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = game.status == GameStatus::Ended @ crate::error::TradeArenaError::GameNotEnded,
    )]
    pub game: Account<'info, Game>,
}

pub fn handler(ctx: Context<CommitGame>) -> Result<()> {
    // Flush in-memory changes to the account data before committing.
    ctx.accounts.game.exit(&crate::ID)?;
    commit_and_undelegate_accounts(
        &ctx.accounts.payer,
        vec![&ctx.accounts.game.to_account_info()],
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
    )?;
    Ok(())
}
