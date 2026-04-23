use crate::error::TradeArenaError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::AccountDeserialize;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

/// Commits the final `Game` state (winner, status, leader_value) and any
/// auto-settled `PlayerState` accounts from the ephemeral rollup back to base
/// layer, undelegating each account in the process.
///
/// **Send to: Ephemeral Rollup endpoint.**
///
/// Call this immediately after `end_game` succeeds on the ER.  Once
/// committed, the `Game` account is readable on base layer and the winner
/// can call `claim_prize`. Pass any `PlayerState` accounts that `end_game`
/// mutated via `remaining_accounts` so their final balances are also available
/// on base layer.
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

pub fn handler<'info>(ctx: Context<'_, '_, '_, 'info, CommitGame<'info>>) -> Result<()> {
    let game_key = ctx.accounts.game.key();
    let mut seen_player_states: Vec<Pubkey> = Vec::with_capacity(ctx.remaining_accounts.len());
    let mut accounts_to_commit: Vec<AccountInfo<'_>> = vec![ctx.accounts.game.to_account_info()];

    for account_info in ctx.remaining_accounts.iter() {
        require!(
            account_info.owner == &crate::ID,
            TradeArenaError::InvalidPlayerState
        );
        require!(
            !seen_player_states.iter().any(|key| key == account_info.key),
            TradeArenaError::DuplicatePlayerState
        );
        seen_player_states.push(*account_info.key);

        let data = account_info.try_borrow_data()?;
        let mut data_slice: &[u8] = &data;
        let ps = PlayerState::try_deserialize(&mut data_slice)
            .map_err(|_| error!(TradeArenaError::InvalidPlayerState))?;
        require!(ps.game == game_key, TradeArenaError::InvalidPlayerState);

        accounts_to_commit.push(account_info.clone());
    }

    // Flush in-memory changes to the game account data before committing.
    ctx.accounts.game.exit(&crate::ID)?;
    let account_refs: Vec<&AccountInfo<'_>> = accounts_to_commit.iter().collect();
    commit_and_undelegate_accounts(
        &ctx.accounts.payer,
        account_refs,
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
    )?;
    Ok(())
}
