use crate::constants::*;
use crate::error::TradeArenaError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,

    #[account(
        mut,
        constraint = game.status == GameStatus::Ended @ TradeArenaError::GameNotEnded,
        constraint = game.winner == Some(winner.key()) @ TradeArenaError::NotWinner,
    )]
    pub game: Account<'info, Game>,

    #[account(
        mut,
        seeds = [VAULT_SEED, game.key().as_ref()],
        bump = game.vault_bump,
        token::mint = game.token_mint,
        token::authority = game,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = game.token_mint,
        token::authority = winner,
    )]
    pub winner_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimPrize>) -> Result<()> {
    let amount = ctx.accounts.vault.amount;
    require!(amount > 0, TradeArenaError::NoPrize);

    // Sign the transfer with the game PDA's seeds
    let game = &ctx.accounts.game;
    let id_bytes = game.game_id.to_le_bytes();
    let seeds: &[&[u8]] = &[GAME_SEED, game.creator.as_ref(), &id_bytes, &[game.bump]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.winner_token.to_account_info(),
                authority: ctx.accounts.game.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;

    msg!(
        "Prize of {} token base units paid to winner {}",
        amount,
        ctx.accounts.winner.key()
    );

    Ok(())
}
