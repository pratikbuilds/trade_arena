use crate::constants::*;
use crate::error::TradeArenaError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::AccountDeserialize;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

/// Delegates the `Game` account to the ephemeral rollup so that
/// `start_game`, `end_game`, and all trade instructions can run on the ER
/// at sub-second latency with access to the live Pyth Lazer price feed.
///
/// **Send to: Base layer.**
///
/// Call this after all players have joined (or at least 2) and before
/// calling `start_game` (which must be sent to the ER endpoint).
#[delegate]
#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct DelegateGame<'info> {
    /// Game creator — must sign to prove authority over the game PDA.
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: Game PDA to be delegated — uses `del` constraint so the
    /// ephemeral-rollups-sdk handles the delegation CPI.
    #[account(
        mut,
        del,
        seeds = [GAME_SEED, creator.key().as_ref(), &game_id.to_le_bytes()],
        bump,
    )]
    pub game: AccountInfo<'info>,
}

pub fn handler(ctx: Context<DelegateGame>, game_id: u64) -> Result<()> {
    // Validate the game lifecycle before handing control to the ER.
    {
        let data = ctx.accounts.game.try_borrow_data()?;
        let mut data_slice: &[u8] = &data;
        let game = Game::try_deserialize(&mut data_slice)?;

        require!(
            game.creator == ctx.accounts.creator.key(),
            TradeArenaError::Unauthorized,
        );
        require!(
            game.status == GameStatus::WaitingForPlayers,
            TradeArenaError::GameAlreadyStarted,
        );
        require!(game.player_count >= 2, TradeArenaError::NotEnoughPlayers,);
    }

    ctx.accounts.delegate_game(
        &ctx.accounts.creator,
        &[
            GAME_SEED,
            ctx.accounts.creator.key().as_ref(),
            &game_id.to_le_bytes(),
        ],
        DelegateConfig::default(),
    )?;

    Ok(())
}
