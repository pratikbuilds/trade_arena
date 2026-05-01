use crate::constants::*;
use crate::error::TradeArenaError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct CreateGame<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + Game::INIT_SPACE,
        seeds = [GAME_SEED, creator.key().as_ref(), &game_id.to_le_bytes()],
        bump,
    )]
    pub game: Account<'info, Game>,

    /// The SPL mint players will use for their entry fee.
    pub token_mint: Account<'info, Mint>,

    /// Prize vault — owned by the game PDA, released to the winner
    #[account(
        init,
        payer = creator,
        token::mint = token_mint,
        token::authority = game,
        seeds = [VAULT_SEED, game.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: Pyth push-oracle price feed for the game's single tradeable asset.
    /// Validated at trade-time by parse_pyth_price.
    pub asset_feed: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<CreateGame>,
    game_id: u64,
    entry_fee: u64,
    duration: i64,
    max_players: u32,
) -> Result<()> {
    // In production, only allow 5-min (300s) or 15-min (900s) games.
    // The `testing` feature unlocks any duration ≥ 1s so tests can run fast.
    #[cfg(not(feature = "testing"))]
    require!(
        duration == 300 || duration == 900,
        TradeArenaError::InvalidDuration
    );
    #[cfg(feature = "testing")]
    require!(duration >= 1, TradeArenaError::InvalidDuration);
    require!(max_players >= 2, TradeArenaError::InvalidMaxPlayers);
    require!(entry_fee > 0, TradeArenaError::InvalidEntryFee);

    let g = &mut ctx.accounts.game;
    g.creator = ctx.accounts.creator.key();
    g.game_id = game_id;
    g.asset_feed = ctx.accounts.asset_feed.key();
    g.entry_fee = entry_fee;
    g.duration = duration;
    g.start_time = 0;
    g.status = GameStatus::WaitingForPlayers;
    g.player_count = 0;
    g.max_players = max_players;
    g.prize_pool = 0;
    g.token_mint = ctx.accounts.token_mint.key();
    g.leader_value = 0;
    g.winner = None;
    g.bump = ctx.bumps.game;
    g.vault_bump = ctx.bumps.vault;

    Ok(())
}
