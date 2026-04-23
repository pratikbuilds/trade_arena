use crate::error::TradeArenaError;
use crate::state::*;
use crate::utils::{
    long_close_return, normalize_price, open_cost, parse_pyth_price, short_close_return,
};
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
/// Any open position is auto-settled at the latest verified Pyth price on the ER
/// so players cannot strand collateral by refusing to close before expiry.
///
/// # Who calls this
/// Anyone — most likely the creator, the player who expects to win, or a crank.
///
/// # Requirements
/// - Game must be Active and its duration must have elapsed
/// - `price_feed` must match `game.asset_feed`
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

    /// CHECK: Must be the Pyth feed stored on `game.asset_feed`
    #[account(
        constraint = price_feed.key() == game.asset_feed @ TradeArenaError::WrongPriceFeed,
    )]
    pub price_feed: UncheckedAccount<'info>,
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
    let (raw_price, expo) =
        parse_pyth_price(&ctx.accounts.price_feed.to_account_info(), clock.unix_timestamp)?;
    let final_price = normalize_price(raw_price, expo)?;

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

        let mut ps = {
            let data = account_info.try_borrow_data()?;
            let mut data_slice: &[u8] = &data;
            PlayerState::try_deserialize(&mut data_slice)
                .map_err(|_| error!(TradeArenaError::InvalidPlayerState))?
        };

        require!(ps.game == game_key, TradeArenaError::InvalidPlayerState);

        if ps.position_size > 0 {
            let close_size = ps.position_size;
            let return_value = match ps.position_side {
                Side::Long => long_close_return(close_size, final_price)?,
                Side::Short => short_close_return(close_size, ps.entry_price, final_price)?,
            };
            let cost_basis = open_cost(close_size, ps.entry_price)?;
            let pnl = (return_value as i64)
                .checked_sub(cost_basis as i64)
                .ok_or(TradeArenaError::MathOverflow)?;

            ps.virtual_usdc = ps
                .virtual_usdc
                .checked_add(return_value)
                .ok_or(TradeArenaError::MathOverflow)?;
            ps.realized_pnl = ps
                .realized_pnl
                .checked_add(pnl)
                .ok_or(TradeArenaError::MathOverflow)?;
            ps.position_size = 0;
            ps.entry_price = 0;
        }

        let final_value = ps.virtual_usdc;

        let player_bytes = ps.player.to_bytes();
        let is_better = final_value > best_value
            || (final_value == best_value && player_bytes < best_player_key_bytes);

        if is_better {
            best_value = final_value;
            best_player = Some(ps.player);
            best_player_key_bytes = player_bytes;
        }
        scored += 1;

        let mut data_mut = account_info.try_borrow_mut_data()?;
        let mut dst: &mut [u8] = &mut data_mut;
        ps.try_serialize(&mut dst)?;
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
