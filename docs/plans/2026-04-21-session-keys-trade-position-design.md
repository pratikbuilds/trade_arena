# Session Keys, Trade Position API, and Auto-Settlement Design

## Summary

This design updates the trading protocol for the prototype trading competition so that:

- agent trading is authorized at the program level with MagicBlock session keys
- position management is exposed as one explicit `trade_position` instruction
- trade inputs are expressed in virtual USDC notional
- end-of-game scoring auto-settles open positions at the final oracle price

The current `open_position` instruction already acts as a full position mutation primitive. It can open, scale in, reduce, fully close, and flip a net position. The current `close_position` instruction is therefore redundant at the protocol layer, and the name `open_position` is misleading for both agent tooling and session-key scoping.

The current scoring model is also unsuitable for a trading competition because `end_game` only scores `virtual_usdc`, which penalizes players who still have open exposure instead of valuing their portfolio at the end of the game.

## Goals

- allow agent sandboxes to trade with session keys validated by the `trade_arena` program
- reduce protocol ambiguity for agent tools and client code
- make trade notional semantics explicit and consistent
- ensure the final ranking reflects actual economic outcome at game expiry
- keep the first prototype small and easy to reason about

## Non-Goals

- backward compatibility with existing instruction names or client APIs
- a multi-position portfolio model
- per-market leverage or margin rules beyond the current collateral model
- session-key authorization for lifecycle instructions such as `commit_player`

## Current Problems

### Misnamed Trading Instruction

`open_position` is currently the real position-management state machine:

- flat -> open
- same side -> scale in
- opposite side, smaller size -> partial close
- opposite side, equal size -> full close
- opposite side, larger size -> flip

This means instruction-name-based permissioning for `open_position` versus `close_position` is not a meaningful security boundary.

### Ambiguous Trade Input Units

The program currently describes size as asset units with 6 implied decimals, but the instruction argument name `size` is too vague. It does not clearly tell client authors or agents whether the value is:

- base asset quantity
- notional USDC
- lot count
- contract count

### Broken Scoring

The current scoring path uses `virtual_usdc` only. That means open positions are not marked to the final price at all. Instead, their collateral remains locked and their unrealized PnL is ignored. This creates the wrong competition incentive.

## Recommended Protocol Design

### One Trading Instruction

Replace:

- `open_position(size, side)`
- `close_position()`

With:

- `trade_position(action: TradeAction)`

`trade_position` becomes the only position-mutating instruction in the program.

### Explicit Trade Actions

Use an explicit action enum rather than overloading opposite-side math in the instruction interface.

Recommended shape:

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, InitSpace)]
pub enum TradeAction {
    Increase {
        side: Side,
        notional_usdc: u64,
    },
    Reduce {
        notional_usdc: u64,
    },
    CloseAll,
}
```

Rationale:

- `Increase` is explicit about adding exposure in a given direction
- `Reduce` removes exposure from the current net position without requiring the caller to provide the opposite side
- `CloseAll` is a clear primitive for agents and avoids requiring them to fetch current position size before flattening

This design intentionally omits a separate `Flip` variant. A flip can be expressed as:

1. `CloseAll`
2. `Increase` in the new direction

That keeps the on-chain instruction semantics smaller and easier to audit. If needed later, flip can be optimized as a convenience action.

## Notional Semantics

### Canonical On-Chain Meaning

Replace the external instruction input `size` with `notional_usdc`.

`notional_usdc` means:

- virtual USD notional of the trade
- represented as an integer with 6 implied decimal places
- denominated in the same unit system as `virtual_usdc`

Examples:

- `1_000_000_000` = 1000.0 USDC
- `100_000_000` = 100.0 USDC
- `10_000_000` = 10.0 USDC

This should be reflected consistently in:

- instruction args
- state field comments
- program docs
- TypeScript helpers
- agent tool descriptions

### Internal Quantity Derivation

The program should continue to store position size internally as base asset quantity with 6 implied decimals, but derive that quantity from the current oracle price:

```text
quantity = floor(notional_usdc * 1_000_000 / normalized_price)
```

Where:

- `notional_usdc` has 6 decimals
- `normalized_price` is USD price with 6 decimals
- `quantity` is base asset amount with 6 decimals

### Rounding Rules

Because quantity is derived from notional, the program must define deterministic rounding:

- use floor rounding when converting notional into quantity
- reject the trade if the derived quantity is zero
- use the derived quantity for collateral and PnL accounting

### Optional Client Helpers

Client code should expose helpers such as:

- `toNotional(uiAmount: string): BN`
- `fromNotional(raw: BN): string`

The user- and agent-facing API should speak in notional USDC, not raw quantity.

## Updated Trading State Machine

The program will continue to track a single net position per player.

### `Increase`

If the player is flat:

- open a new position
- derive quantity from `notional_usdc` and current price
- lock collateral based on the derived quantity and price

If the player already has a position in the same direction:

- add to position
- recompute weighted average entry price
- lock additional collateral based on the derived quantity and price

If the player has a position in the opposite direction:

- reject with a dedicated error such as `DirectionMismatch`

This keeps action semantics explicit and prevents hidden reduces via `Increase`.

### `Reduce`

Requirements:

- player must already have an open position
- `notional_usdc` must resolve to a quantity that is `<= current_position_quantity`

Behavior:

- derive quantity to reduce from `notional_usdc` and the current oracle price
- realize PnL on the reduced portion using the current oracle price
- release the corresponding collateral
- if the derived quantity equals the current position quantity, flatten the position
- otherwise leave the remaining position with unchanged side and entry price

### `CloseAll`

Requirements:

- player must already have an open position

Behavior:

- realize PnL on the full remaining position using the current oracle price
- release all collateral
- flatten the position

## Session-Key Design

### Authorization Model

Trading must be authorized by the `trade_arena` program itself, not by the backend.

Adopt the MagicBlock session-key pattern:

- transaction presents the ephemeral signer
- transaction presents the optional `SessionToken`
- the program validates that the session token authority matches the player who owns the `PlayerState`

The backend server is only a relay to the ER endpoint. It must not be treated as the trust boundary.

### Scope

For v1, session keys should be valid for:

- `trade_position` only

They should not be valid for:

- `commit_player`
- `delegate_player`
- `delegate_game`
- `end_game`
- `claim_prize`

This keeps the session permission narrowly scoped to trading actions.

### Account Pattern

Trading accounts should follow the session-keys integration model:

- derive `Session` on the accounts struct
- add optional `session_token`
- replace the current `player: Signer<'info>` naming with a neutral `signer: Signer<'info>` pattern
- authenticate with `session_auth_or(...)`

The auth predicate should verify either:

- direct wallet ownership of the `PlayerState`
- or a valid session token whose authority is the player recorded in `PlayerState`

## End-of-Game Auto-Settlement

### New Scoring Rule

At game expiry, `end_game` must settle every open position at the final oracle price and use the settled account state for ranking.

This means the final score becomes the true post-settlement portfolio cash value, not just pre-settlement cash on hand.

### Required Changes

`end_game` must:

- accept the price feed account
- read the final price from oracle data
- iterate through all `PlayerState` accounts
- if a player is flat, score `virtual_usdc`
- if a player has an open position:
  - compute settlement return from the final price
  - add that return to `virtual_usdc`
  - realize PnL into `realized_pnl`
  - flatten the position
- rank players on the resulting settled balance

### Why Mutate Player State

`end_game` should mutate and settle the delegated `PlayerState` accounts, not just compute a temporary score, because:

- the final state becomes canonical and inspectable
- there is no mismatch between ranked value and stored player state
- later debugging and analytics are simpler
- it removes ambiguity around whether unrealized PnL still exists after settlement

## Agent Tool Surface

The agent sandbox should expose a single trading tool aligned with the protocol:

- `trade_position`

Suggested tool schema:

- `action`: `increase | reduce | close_all`
- `side`: required only for `increase`
- `notional_usdc`: required only for `increase` and `reduce`, expressed in human-readable USD terms at the tool boundary

The sandbox adapter should convert human-readable notional into on-chain `notional_usdc` units with 6 implied decimals.

Examples:

- `trade_position(action="increase", side="long", notional_usdc="1000")`
- `trade_position(action="reduce", notional_usdc="300")`
- `trade_position(action="close_all")`

## Error Handling

Add or revise errors to match the explicit action model:

- `DirectionMismatch`
- `ReduceExceedsPosition`
- `NoOpenPosition`
- `InvalidQuantity`
- `Unauthorized`
- `WrongPriceFeed`
- `GameEnded`

Remove or de-emphasize errors that reflect the old instruction model.

## Testing Plan

### Program Tests

Update tests to cover:

- direct wallet trading with `Increase`, `Reduce`, `CloseAll`
- session-key-authorized trading with valid session token
- rejection with invalid or mismatched session token
- notional semantics and client helper conversions
- reduce equal to full position flattening correctly
- reduce larger than current position failing
- tiny notional that rounds to zero quantity failing
- same-side weighted average entry calculation
- `end_game` auto-settling long and short positions correctly
- ranking after auto-settlement across multiple players

### Regression Cases

Specifically test:

- open long, leave it open until expiry, verify end-game settlement scores it correctly
- open short, leave it open until expiry, verify end-game settlement scores it correctly
- one player flat and one player in profit but still open, verify the profitable open position wins after settlement

## Implementation Outline

1. Replace `open_position` and `close_position` with `trade_position`
2. Add `TradeAction`
3. Change the instruction input model from asset quantity to USD notional
4. Update trading math and validation to derive quantity from the current oracle price
5. Integrate session-token auth into `trade_position`
6. Update `end_game` to require the price feed and auto-settle all positions
7. Update tests and TS helpers
8. Update sandbox tool contract and docs

## Recommendation

Implement the prototype with:

- one explicit `trade_position` instruction
- action-based API with `Increase`, `Reduce`, `CloseAll`
- `notional_usdc` as the instruction input with 6 implied decimals
- internal quantity derived from notional and oracle price
- session-key authorization at the program level for `trade_position`
- automatic settlement of all open positions in `end_game`

This gives the cleanest model for agents, removes naming confusion, fixes scoring, and creates a meaningful permission boundary for session keys.
