use crate::constants::*;
use crate::error::TradeArenaError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct JoinGame<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        constraint = game.status == GameStatus::WaitingForPlayers
            @ TradeArenaError::GameNotJoinable,
        constraint = game.player_count < game.max_players @ TradeArenaError::GameFull,
    )]
    pub game: Account<'info, Game>,

    #[account(
        init,
        payer = player,
        space = 8 + PlayerState::INIT_SPACE,
        seeds = [PLAYER_SEED, game.key().as_ref(), player.key().as_ref()],
        bump,
    )]
    pub player_state: Account<'info, PlayerState>,

    #[account(
        mut,
        token::mint = game.usdc_mint,
        token::authority = player,
    )]
    pub player_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [VAULT_SEED, game.key().as_ref()],
        bump = game.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<JoinGame>) -> Result<()> {
    // Transfer real USDC entry fee into the prize vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.player_usdc.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.player.to_account_info(),
            },
        ),
        ctx.accounts.game.entry_fee,
    )?;

    let game = &mut ctx.accounts.game;
    game.prize_pool = game
        .prize_pool
        .checked_add(game.entry_fee)
        .ok_or(TradeArenaError::MathOverflow)?;
    game.player_count = game
        .player_count
        .checked_add(1)
        .ok_or(TradeArenaError::MathOverflow)?;

    let ps = &mut ctx.accounts.player_state;
    ps.player = ctx.accounts.player.key();
    ps.game = game.key();
    ps.virtual_usdc = VIRTUAL_STARTING_BALANCE;
    ps.position_size = 0;
    ps.position_side = Side::Long; // irrelevant when position_size == 0
    ps.entry_price = 0;
    ps.realized_pnl = 0;
    ps.bump = ctx.bumps.player_state;

    Ok(())
}
