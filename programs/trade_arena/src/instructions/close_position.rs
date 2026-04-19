use crate::constants::*;
use crate::error::TradeArenaError;
use crate::state::*;
use crate::utils::{
    long_close_return, normalize_price, open_cost, parse_pyth_price, short_close_return,
};
use anchor_lang::prelude::*;

/// Closes the player's entire open position and crystallises PnL into `virtual_usdc`.
///
/// **Send to: Ephemeral Rollup** (same as `open_position`).
///
/// # PnL accounting
///
/// Long:
///   return      = size × exit_price / 1_000_000
///   realized_pnl += return − (size × entry_price / 1_000_000)
///
/// Short (collateral model):
///   return      = max((2 × entry_price − exit_price) × size / 1_000_000, 0)
///   realized_pnl += return − (size × entry_price / 1_000_000)
///
///   Examples (size = 1 unit, entry = $150):
///     exit $120 → return = $180, pnl = +$30   (profit on price drop)
///     exit $180 → return = $120, pnl = −$30   (loss on price rise)
///     exit $310 → return =   $0, pnl = −$150  (full collateral lost)
#[derive(Accounts)]
pub struct ClosePosition<'info> {
    pub player: Signer<'info>,

    #[account(
        constraint = game.status == GameStatus::Active @ TradeArenaError::GameNotActive,
    )]
    pub game: Account<'info, Game>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, game.key().as_ref(), player.key().as_ref()],
        bump = player_state.bump,
        constraint = player_state.player == player.key() @ TradeArenaError::Unauthorized,
    )]
    pub player_state: Account<'info, PlayerState>,

    /// CHECK: Must match `game.asset_feed`
    #[account(
        constraint = price_feed.key() == game.asset_feed @ TradeArenaError::WrongPriceFeed,
    )]
    pub price_feed: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<ClosePosition>) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < ctx.accounts.game.start_time + ctx.accounts.game.duration,
        TradeArenaError::GameEnded
    );

    let ps = &mut ctx.accounts.player_state;

    require!(ps.position_size > 0, TradeArenaError::NoOpenPosition);

    let (raw_price, expo) = parse_pyth_price(&ctx.accounts.price_feed.to_account_info())?;
    let exit_price = normalize_price(raw_price, expo)?;

    let size = ps.position_size;
    let entry_price = ps.entry_price;

    let (return_value, cost) = match ps.position_side {
        Side::Long => {
            let ret = long_close_return(size, exit_price)?;
            let cost = open_cost(size, entry_price)?;
            (ret, cost)
        }
        Side::Short => {
            let ret = short_close_return(size, entry_price, exit_price)?;
            let cost = open_cost(size, entry_price)?;
            (ret, cost)
        }
    };

    ps.virtual_usdc = ps
        .virtual_usdc
        .checked_add(return_value)
        .ok_or(TradeArenaError::MathOverflow)?;

    let pnl_delta = (return_value as i64)
        .checked_sub(cost as i64)
        .ok_or(TradeArenaError::MathOverflow)?;
    ps.realized_pnl = ps
        .realized_pnl
        .checked_add(pnl_delta)
        .ok_or(TradeArenaError::MathOverflow)?;

    // Flatten the position
    ps.position_size = 0;
    ps.entry_price = 0;

    Ok(())
}
