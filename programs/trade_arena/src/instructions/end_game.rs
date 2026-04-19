use crate::error::TradeArenaError;
use crate::state::*;
use crate::utils::compute_final_value;
use anchor_lang::prelude::*;
use anchor_lang::AccountDeserialize;

/// Ends the game, ranks all players by final cash balance, and records the winner.
///
/// **Send to: Ephemeral Rollup endpoint.**
///
/// Because the game and all PlayerState accounts are delegated to the ER,
/// this instruction runs there — giving it access to up-to-the-millisecond
/// player state without waiting for any commits back to base layer.
///
/// No oracle is needed: scores are pure virtual USDC (cash on hand after
/// all closed trades).  Players who left positions open have their collateral
/// locked and are scored only on their remaining cash, penalising them for
/// not closing in time.
///
/// # Who calls this
/// Anyone — most likely the creator, the player who expects to win, or a crank.
///
/// # Requirements
/// - Game must be Active and its duration must have elapsed
/// - All `PlayerState` accounts for this game must be passed as
///   `remaining_accounts` (the count must match `game.player_count`)
///
/// # Tiebreaker
/// Lowest Pubkey bytes win (deterministic, unmanipulable by the caller).
///
/// # After this call
/// Run `commit_game` on the ER to push the result to base layer so
/// `claim_prize` can be called.
#[derive(Accounts)]
pub struct EndGame<'info> {
    #[account(mut)]
    pub game: Account<'info, Game>,
}

pub fn handler(ctx: Context<EndGame>) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let clock = Clock::get()?;

    require!(
        game.status == GameStatus::Active,
        TradeArenaError::GameNotActive
    );
    require!(
        clock.unix_timestamp >= game.start_time + game.duration,
        TradeArenaError::GameNotOver
    );
    // No commit window: end_game runs on the ER — all delegated PlayerState
    // accounts are immediately readable without a prior base-layer commit.

    let game_key = game.key();
    let program_id = crate::ID;

    let remaining = ctx.remaining_accounts;
    require!(
        remaining.len() == game.player_count as usize,
        TradeArenaError::WrongPlayerCount
    );

    let mut best_value: u64 = 0;
    let mut best_player: Option<Pubkey> = None;
    let mut best_player_key_bytes: [u8; 32] = [u8::MAX; 32];
    let mut scored: u32 = 0;
    let mut seen_player_states: Vec<Pubkey> = Vec::with_capacity(remaining.len());

    for account_info in remaining.iter() {
        require!(
            account_info.owner == &program_id,
            TradeArenaError::InvalidPlayerState
        );
        require!(
            !seen_player_states.iter().any(|key| key == account_info.key),
            TradeArenaError::DuplicatePlayerState
        );
        seen_player_states.push(*account_info.key);

        let mut data: &[u8] = &account_info.try_borrow_data()?;
        let ps = PlayerState::try_deserialize(&mut data)
            .map_err(|_| error!(TradeArenaError::InvalidPlayerState))?;

        require!(ps.game == game_key, TradeArenaError::InvalidPlayerState);

        // current_price = 0 — not used since compute_final_value only reads virtual_usdc
        let final_value = compute_final_value(
            ps.virtual_usdc,
            ps.position_size,
            &ps.position_side,
            ps.entry_price,
            0,
        );

        let player_bytes = ps.player.to_bytes();
        let is_better = final_value > best_value
            || (final_value == best_value && player_bytes < best_player_key_bytes);

        if is_better {
            best_value = final_value;
            best_player = Some(ps.player);
            best_player_key_bytes = player_bytes;
        }
        scored += 1;
    }

    require!(scored > 0, TradeArenaError::NoCommittedPlayers);
    require!(
        scored == game.player_count,
        TradeArenaError::WrongPlayerCount
    );

    game.status = GameStatus::Ended;
    game.leader_value = best_value;
    game.winner = best_player;

    msg!(
        "Game ended. Winner: {:?}  Score: {} virtual USDC  Players scored: {}/{}",
        game.winner,
        best_value,
        scored,
        game.player_count
    );

    Ok(())
}
