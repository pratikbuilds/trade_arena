use crate::constants::*;
use crate::error::TradeArenaError;
use crate::state::*;
use crate::utils::{
    long_close_return, normalize_price, open_cost, parse_pyth_price, short_close_return,
};
use anchor_lang::prelude::*;

/// Open, scale, reduce, or flip a paper-trade position.
///
/// **Send to: Ephemeral Rollup** (after `delegate_player`).
///
/// A single instruction handles all position management — agents never have
/// to call `close_position` first. The behaviour depends on the current
/// position state and the requested `(size, side)`:
///
/// | Current state   | Request          | Result                                   |
/// |-----------------|------------------|------------------------------------------|
/// | Flat            | any side         | Open new position, lock collateral        |
/// | Same direction  | same side        | Scale in — add to position, weighted avg  |
/// | Opposite side   | size < current   | Partial close — realise PnL on `size`     |
/// | Opposite side   | size == current  | Full close — go flat, realise all PnL     |
/// | Opposite side   | size > current   | Close all + flip — open remainder on ER   |
///
/// # Collateral model (Long and Short identical)
///   Open cost  = size × price / 1_000_000
///   Long PnL   = (exit − entry) × size / 1_000_000
///   Short PnL  = max((2×entry − exit) × size / 1_000_000, 0) − collateral
///
/// # Weighted average entry (scale-in)
///   new_entry = (old_size × old_entry + add_size × price) / (old_size + add_size)
#[derive(Accounts)]
pub struct OpenPosition<'info> {
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

    /// CHECK: Must be the Pyth feed stored on `game.asset_feed`
    #[account(
        constraint = price_feed.key() == game.asset_feed @ TradeArenaError::WrongPriceFeed,
    )]
    pub price_feed: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<OpenPosition>, size: u64, side: Side) -> Result<()> {
    let game = &ctx.accounts.game;
    let clock = Clock::get()?;

    require!(
        clock.unix_timestamp < game.start_time + game.duration,
        TradeArenaError::GameEnded
    );
    require!(size > 0, TradeArenaError::InvalidSize);

    let (raw_price, expo) = parse_pyth_price(&ctx.accounts.price_feed.to_account_info())?;
    let price = normalize_price(raw_price, expo)?;

    let ps = &mut ctx.accounts.player_state;

    if ps.position_size == 0 {
        // ── Case 1: Flat → open new position ──────────────────────────────
        let cost = open_cost(size, price)?;
        require!(
            ps.virtual_usdc >= cost,
            TradeArenaError::InsufficientVirtualBalance
        );
        let side_str = if matches!(side, Side::Long) {
            "LONG"
        } else {
            "SHORT"
        };
        ps.virtual_usdc -= cost;
        ps.position_size = size;
        ps.position_side = side;
        ps.entry_price = price;
        msg!(
            "Opened {}  size={}  entry={}  cost={}",
            side_str,
            size,
            price,
            cost
        );
    } else if ps.position_side == side {
        // ── Case 2: Same direction → scale in ─────────────────────────────
        let cost = open_cost(size, price)?;
        require!(
            ps.virtual_usdc >= cost,
            TradeArenaError::InsufficientVirtualBalance
        );

        // Weighted average entry price
        let new_size = ps
            .position_size
            .checked_add(size)
            .ok_or(TradeArenaError::MathOverflow)?;
        let weighted = (ps.position_size as u128)
            .checked_mul(ps.entry_price as u128)
            .ok_or(TradeArenaError::MathOverflow)?
            .checked_add(
                (size as u128)
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
            "Scaled in {:?}  +size={}  new_size={}  avg_entry={}  cost={}",
            side,
            size,
            new_size,
            weighted,
            cost
        );
    } else {
        // ── Case 3 / 4 / 5: Opposite direction → reduce or flip ───────────
        let cur_size = ps.position_size;
        let cur_entry = ps.entry_price;
        let cur_side = ps.position_side.clone();

        let close_size = size.min(cur_size);

        // Realise PnL on the closed portion
        let return_value = match cur_side {
            Side::Long => long_close_return(close_size, price)?,
            Side::Short => short_close_return(close_size, cur_entry, price)?,
        };
        let cost_basis = open_cost(close_size, cur_entry)?;
        let pnl: i64 = return_value as i64 - cost_basis as i64;

        ps.virtual_usdc = ps
            .virtual_usdc
            .checked_add(return_value)
            .ok_or(TradeArenaError::MathOverflow)?;
        ps.realized_pnl = ps
            .realized_pnl
            .checked_add(pnl)
            .ok_or(TradeArenaError::MathOverflow)?;

        if size < cur_size {
            // ── Case 3: Partial close ──────────────────────────────────────
            ps.position_size -= size;
            // entry_price and side unchanged for the remaining portion
            msg!(
                "Partial close {:?}  closed={}  remaining={}  pnl={}",
                cur_side,
                size,
                ps.position_size,
                pnl
            );
        } else if size == cur_size {
            // ── Case 4: Exact / full close → go flat ──────────────────────
            ps.position_size = 0;
            ps.entry_price = 0;
            msg!("Full close {:?}  size={}  pnl={}", cur_side, size, pnl);
        } else {
            // ── Case 5: Flip — close all, open remainder in new direction ──
            let remaining = size - cur_size;
            let new_cost = open_cost(remaining, price)?;
            require!(
                ps.virtual_usdc >= new_cost,
                TradeArenaError::InsufficientVirtualBalance
            );

            ps.virtual_usdc -= new_cost;
            ps.position_size = remaining;
            ps.position_side = side.clone();
            ps.entry_price = price;
            msg!(
                "Flip {:?}→{:?}  closed={}  pnl={}  new_size={}  new_entry={}",
                cur_side,
                side,
                cur_size,
                pnl,
                remaining,
                price
            );
        }
    }

    Ok(())
}
