use crate::error::TradeArenaError;
use crate::state::Side;
use anchor_lang::prelude::*;

// ── Pyth Lazer / PriceUpdateV2 parsing ────────────────────────────────────────
//
// On MagicBlock ER, price feeds are `PriceUpdateV2` accounts written by the
// real-time-pricing-oracle chain pusher. These are 134-byte Anchor accounts
// owned by program `PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd`.
//
// Layout:
//   0..8:   Anchor discriminator  (sha256("account:PriceUpdateV2")[..8])
//           = ea a1 0e 24 ac ef 0f e8
//   8..40:  write_authority           (Pubkey)
//   40:     verification_level tag    (u8; 1 = Full)
//   41..73: feed_id                   ([u8; 32])
//   73..81: price                     (i64 LE)    ← what we read
//   81..89: conf                      (u64 LE)
//   89..93: exponent                  (i32 LE)    ← positive magnitude (e.g. 8 for 10^-8)
//   93..101:  publish_time            (i64 LE)
//   101..109: prev_publish_time       (i64 LE)
//   109..117: ema_price               (i64 LE)
//   117..125: ema_conf                (u64 LE)
//   125..133: posted_slot             (u64 LE)
//
// Note: Pyth Lazer stores the exponent as a **positive magnitude** — i.e. a
// BTC price of 75692 is encoded as `price=7569299923437, expo=8` meaning
// `real_price = price / 10^8`. We return `-expo` so the downstream
// `normalize_price` function (which treats expo the classic Pyth way, negative)
// keeps working unchanged.
pub const PRICE_UPDATE_V2_DISCRIMINATOR: [u8; 8] = [0xea, 0xa1, 0x0e, 0x24, 0xac, 0xef, 0x0f, 0xe8];

pub fn parse_pyth_price(account: &AccountInfo) -> Result<(i64, i32)> {
    let data = account.try_borrow_data()?;
    require!(data.len() >= 134, TradeArenaError::InvalidPriceFeed);
    require!(
        data[0..8] == PRICE_UPDATE_V2_DISCRIMINATOR,
        TradeArenaError::InvalidPriceFeed
    );

    let price = i64::from_le_bytes(data[73..81].try_into().unwrap());
    let expo = i32::from_le_bytes(data[89..93].try_into().unwrap());

    require!(price > 0, TradeArenaError::InvalidPrice);

    // Lazer stores expo as positive magnitude; flip sign so the rest of the
    // codebase can keep its "Pyth classic" mental model (expo = -8, etc.).
    Ok((price, -expo))
}

/// Normalise a Pyth (price, expo) pair to **USD × 1_000_000** (6 decimal places).
///
/// ```
/// // SOL at $150.00000000 → price=15000000000, expo=-8
/// // normalized = 15000000000 * 10^(-8+6) = 15000000000 / 100 = 150_000_000
/// ```
pub fn normalize_price(price: i64, expo: i32) -> Result<u64> {
    let shift = expo + 6i32;
    let out = if shift >= 0 {
        let factor = 10u64
            .checked_pow(shift as u32)
            .ok_or(TradeArenaError::MathOverflow)?;
        (price as u64)
            .checked_mul(factor)
            .ok_or(TradeArenaError::MathOverflow)?
    } else {
        let factor = 10u64
            .checked_pow((-shift) as u32)
            .ok_or(TradeArenaError::MathOverflow)?;
        (price as u64) / factor
    };
    Ok(out)
}

// ── Position maths ────────────────────────────────────────────────────────────
//
// All prices are "normalised price" (USD × 1_000_000).
// All sizes are in base asset units with 6 decimal places.
//
// LONG
//   Open:   virtual_usdc -= size × entry_price / 1_000_000
//   Close:  virtual_usdc += size × exit_price  / 1_000_000
//   PnL  =  (exit_price − entry_price) × size  / 1_000_000
//
// SHORT  (collateral model — same USDC locked as an equivalent long)
//   Open:   virtual_usdc -= size × entry_price / 1_000_000   ← collateral locked
//   Close:  return = max((2 × entry_price − exit_price) × size / 1_000_000, 0)
//           virtual_usdc += return
//   PnL  =  return − collateral
//         = max((entry_price − exit_price) × size / 1_000_000, −collateral)
//
//   • If price fell $30 on a 1-unit short → profit $30  ✓
//   • If price rose $30 on a 1-unit short → loss   $30  ✓
//   • Maximum loss = full collateral (like liquidation at 2× entry)  ✓

/// Cost to open a position (same formula for Long and Short).
pub fn open_cost(size: u64, price: u64) -> Result<u64> {
    Ok((size as u128)
        .checked_mul(price as u128)
        .ok_or(TradeArenaError::MathOverflow)?
        .checked_div(1_000_000)
        .ok_or(TradeArenaError::MathOverflow)? as u64)
}

/// USDC returned when closing a Long at `exit_price`.
pub fn long_close_return(size: u64, exit_price: u64) -> Result<u64> {
    open_cost(size, exit_price)
}

/// USDC returned when closing a Short at `exit_price`.
///
/// return = max((2 × entry_price − exit_price) × size / 1_000_000, 0)
pub fn short_close_return(size: u64, entry_price: u64, exit_price: u64) -> Result<u64> {
    let two_entry = 2u128 * entry_price as u128;
    let exit = exit_price as u128;
    if two_entry <= exit {
        return Ok(0); // total loss of collateral (price more than doubled against us)
    }
    Ok(((two_entry - exit) * size as u128 / 1_000_000) as u64)
}

/// Final portfolio value used by `end_game` to rank players.
///
/// Only **closed** positions count — `virtual_usdc` already reflects all
/// realized gains/losses.  Players with an open position at game end have
/// their collateral locked and unavailable, penalising them for not closing
/// in time.  This design:
///   • eliminates dependence on an oracle at game-end (no MTM needed)
///   • incentivises players to close before the clock runs out
///   • is trivially verifiable on-chain with no price feed required
///
/// `position_size`, `position_side`, and `entry_price` are retained as
/// parameters so callers do not need to change their call-sites and the
/// compiler can catch any future additions to the scoring model.
#[allow(unused_variables)]
pub fn compute_final_value(
    virtual_usdc: u64,
    position_size: u64,
    position_side: &Side,
    entry_price: u64,
    current_price: u64,
) -> u64 {
    // Collateral for open positions stays locked — only cash on hand scores.
    virtual_usdc
}
