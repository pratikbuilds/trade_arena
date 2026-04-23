use crate::constants::*;
use crate::error::TradeArenaError;
use crate::state::*;
use crate::utils::{
    long_close_return, normalize_price, open_cost, parse_pyth_price, quantity_from_notional,
    short_close_return,
};
use anchor_lang::prelude::*;
use session_keys::{session_auth_or, Session, SessionError, SessionToken};

/// Increase, reduce, or fully close a paper-trade position using USD notional.
///
/// **Send to: Ephemeral Rollup** (after `delegate_player`).
#[derive(Accounts, Session)]
pub struct TradePosition<'info> {
    #[account(
        constraint = game.status == GameStatus::Active @ TradeArenaError::GameNotActive,
    )]
    pub game: Account<'info, Game>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, game.key().as_ref(), player_state.player.as_ref()],
        bump = player_state.bump,
    )]
    pub player_state: Account<'info, PlayerState>,

    #[session(
        signer = signer,
        authority = player_state.player
    )]
    pub session_token: Option<Account<'info, SessionToken>>,

    #[account(mut)]
    pub signer: Signer<'info>,

    /// CHECK: Must be the Pyth feed stored on `game.asset_feed`
    #[account(
        constraint = price_feed.key() == game.asset_feed @ TradeArenaError::WrongPriceFeed,
    )]
    pub price_feed: UncheckedAccount<'info>,
}

fn realize_close(ps: &mut PlayerState, close_size: u64, exit_price: u64) -> Result<i64> {
    let return_value = match ps.position_side {
        Side::Long => long_close_return(close_size, exit_price)?,
        Side::Short => short_close_return(close_size, ps.entry_price, exit_price)?,
    };
    let cost_basis = open_cost(close_size, ps.entry_price)?;
    let pnl = return_value as i64 - cost_basis as i64;

    ps.virtual_usdc = ps
        .virtual_usdc
        .checked_add(return_value)
        .ok_or(TradeArenaError::MathOverflow)?;
    ps.realized_pnl = ps
        .realized_pnl
        .checked_add(pnl)
        .ok_or(TradeArenaError::MathOverflow)?;

    Ok(pnl)
}

#[session_auth_or(
    ctx.accounts.player_state.player == ctx.accounts.signer.key(),
    TradeArenaError::Unauthorized
)]
pub fn handler(ctx: Context<TradePosition>, action: TradeAction) -> Result<()> {
    let game = &ctx.accounts.game;
    let clock = Clock::get()?;

    require!(
        clock.unix_timestamp < game.start_time + game.duration,
        TradeArenaError::GameEnded
    );

    let (raw_price, expo) =
        parse_pyth_price(&ctx.accounts.price_feed.to_account_info(), clock.unix_timestamp)?;
    let price = normalize_price(raw_price, expo)?;

    let ps = &mut ctx.accounts.player_state;

    match action {
        TradeAction::Increase {
            side,
            notional_usdc,
        } => {
            require!(notional_usdc > 0, TradeArenaError::InvalidNotional);
            let quantity = quantity_from_notional(notional_usdc, price)?;
            let cost = open_cost(quantity, price)?;

            require!(
                ps.virtual_usdc >= cost,
                TradeArenaError::InsufficientVirtualBalance
            );

            if ps.position_size == 0 {
                ps.virtual_usdc -= cost;
                ps.position_size = quantity;
                ps.position_side = side;
                ps.entry_price = price;
                msg!(
                    "Opened {:?} notional={} quantity={} entry={} cost={}",
                    ps.position_side,
                    notional_usdc,
                    quantity,
                    price,
                    cost
                );
            } else {
                require!(ps.position_side == side, TradeArenaError::DirectionMismatch);

                let new_size = ps
                    .position_size
                    .checked_add(quantity)
                    .ok_or(TradeArenaError::MathOverflow)?;
                let weighted = (ps.position_size as u128)
                    .checked_mul(ps.entry_price as u128)
                    .ok_or(TradeArenaError::MathOverflow)?
                    .checked_add(
                        (quantity as u128)
                            .checked_mul(price as u128)
                            .ok_or(TradeArenaError::MathOverflow)?,
                    )
                    .ok_or(TradeArenaError::MathOverflow)?
                    .checked_div(new_size as u128)
                    .ok_or(TradeArenaError::MathOverflow)? as u64;

                ps.virtual_usdc -= cost;
                ps.position_size = new_size;
                ps.entry_price = weighted;
                msg!(
                    "Increased {:?} notional={} quantity={} new_size={} avg_entry={} cost={}",
                    side,
                    notional_usdc,
                    quantity,
                    new_size,
                    weighted,
                    cost
                );
            }
        }
        TradeAction::Reduce { notional_usdc } => {
            require!(notional_usdc > 0, TradeArenaError::InvalidNotional);
            require!(ps.position_size > 0, TradeArenaError::NoOpenPosition);

            let quantity = quantity_from_notional(notional_usdc, price)?;
            require!(
                quantity <= ps.position_size,
                TradeArenaError::ReduceExceedsPosition
            );

            let pnl = realize_close(ps, quantity, price)?;
            ps.position_size -= quantity;
            if ps.position_size == 0 {
                ps.entry_price = 0;
            }

            msg!(
                "Reduced {:?} notional={} quantity={} remaining={} pnl={}",
                ps.position_side,
                notional_usdc,
                quantity,
                ps.position_size,
                pnl
            );
        }
        TradeAction::CloseAll => {
            require!(ps.position_size > 0, TradeArenaError::NoOpenPosition);

            let close_size = ps.position_size;
            let pnl = realize_close(ps, close_size, price)?;
            ps.position_size = 0;
            ps.entry_price = 0;

            msg!(
                "Closed {:?} quantity={} pnl={}",
                ps.position_side,
                close_size,
                pnl
            );
        }
    }

    Ok(())
}
