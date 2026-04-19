use crate::error::TradeArenaError;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct StartGame<'info> {
    #[account(
        constraint = creator.key() == game.creator @ TradeArenaError::Unauthorized,
    )]
    pub creator: Signer<'info>,

    #[account(
        mut,
        constraint = game.status == GameStatus::WaitingForPlayers
            @ TradeArenaError::GameAlreadyStarted,
        constraint = game.player_count >= 2 @ TradeArenaError::NotEnoughPlayers,
    )]
    pub game: Account<'info, Game>,
}

pub fn handler(ctx: Context<StartGame>) -> Result<()> {
    let game = &mut ctx.accounts.game;
    game.status = GameStatus::Active;
    game.start_time = Clock::get()?.unix_timestamp;
    Ok(())
}
