use crate::constants::*;
use crate::error::TradeArenaError;
use crate::state::*;
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

/// Delegates a PlayerState account to the ephemeral rollup so the player can
/// trade at low latency. Must be sent to the **base layer**.
///
/// After this call, `open_position` and `close_position` must be sent to the
/// ephemeral rollup endpoint (https://devnet.magicblock.app/).
#[delegate]
#[derive(Accounts)]
pub struct DelegatePlayer<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    pub game: Account<'info, Game>,

    /// CHECK: PDA to be delegated — must use AccountInfo with `del` constraint
    #[account(
        mut,
        del,
        seeds = [PLAYER_SEED, game.key().as_ref(), player.key().as_ref()],
        bump,
    )]
    pub player_state: AccountInfo<'info>,
}

pub fn handler(ctx: Context<DelegatePlayer>) -> Result<()> {
    require!(
        ctx.accounts.game.status == GameStatus::WaitingForPlayers
            || ctx.accounts.game.status == GameStatus::Active,
        TradeArenaError::GameNotJoinable,
    );

    ctx.accounts.delegate_player_state(
        &ctx.accounts.player,
        &[
            PLAYER_SEED,
            ctx.accounts.game.key().as_ref(),
            ctx.accounts.player.key().as_ref(),
        ],
        DelegateConfig::default(),
    )?;

    Ok(())
}
