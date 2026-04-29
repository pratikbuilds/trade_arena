# Trade Arena

Trade Arena is a prototype Solana trading competition built with Anchor and MagicBlock Ephemeral Rollups. Players join an arena with a real USDC entry fee, trade a virtual portfolio during a short timed round, and settle the final winner back to the base layer.

The repository also includes a Vite React app for the arena UI and a Model Context Protocol (MCP) service that lets agent clients discover arenas and prepare unsigned join/trade transactions.

## What Is Here

- `programs/trade_arena`: Anchor program for game lifecycle, player state, trading, settlement, and prize claims.
- `app`: React + Vite frontend for the Trade Arena experience.
- `services/user-mcp`: MCP HTTP service for arena discovery and transaction preparation.
- `tests`: Anchor integration tests and simulation scripts.
- `docs/plans`: product and engineering design notes.
- `brand.md`: visual direction and UI theme notes.

## Program Flow

1. Create a game with an entry fee, duration, max player count, and price feed.
2. Players join on the base layer and fund the prize vault.
3. Game and player accounts are delegated to the MagicBlock Ephemeral Rollup.
4. The game starts and players submit `trade_position` actions against virtual USDC balances.
5. The game ends, open positions are valued, a winner is recorded, and final state is committed back.
6. The winner claims the prize pool from the base-layer vault.

## Requirements

- Rust toolchain from `rust-toolchain.toml`
- Anchor CLI
- Solana CLI
- Yarn
- Node.js compatible with the workspace TypeScript dependencies

Install JavaScript dependencies from the repo root:

```bash
yarn install
```

## Anchor Commands

Build the on-chain program:

```bash
anchor build
```

Run the Anchor test suite:

```bash
yarn test
```

Run the real-game simulation:

```bash
yarn ts-mocha -p ./tsconfig.json -t 1000000 tests/simulate_real_game.ts
```

Create a game as the admin against the configured devnet program:

```bash
yarn launch:game:create
```

View a created game's on-chain state:

```bash
yarn launch:game:status <GAME_PDA>
```

After at least two players have joined, delegate the game account to MagicBlock
so `start_game`, `trade_position`, and `end_game` can run on the ER:

```bash
yarn launch:game:delegate <GAME_PDA>
```

For a shorter smoke-create command:

```bash
yarn launch:game:quick
```

The launch runner calls `create_game` directly and accepts
`LAUNCH_GAME_ID`, `LAUNCH_ENTRY_FEE_MICRO_USDC`,
`LAUNCH_DURATION_SECONDS`, `LAUNCH_MAX_PLAYERS`, `LAUNCH_TOKEN_MINT`,
`TRADE_ARENA_PRICE_FEED`, `ANCHOR_PROVIDER_URL`, and `ANCHOR_WALLET`.
If `LAUNCH_TOKEN_MINT` is omitted, it creates a devnet test mint for the game.
The program currently accepts `LAUNCH_DURATION_SECONDS=300` or `900`.
Delegation is intentionally a separate admin command. The script verifies that
the current wallet is the game creator before sending `delegate_game`; any
additional lifecycle rules are enforced by the on-chain program.

`Anchor.toml` is configured for devnet by default and uses the wallet at `~/.config/solana/id.json`.

## Frontend App

The app lives in `app`.

```bash
cd app
yarn dev
yarn build
yarn lint
yarn typecheck
```

The UI uses the project brand tokens from `brand.md`, Tailwind CSS, shadcn-style primitives, and a chart-first arena layout.

## User MCP Service

The MCP service lives in `services/user-mcp` and exposes tools for:

- `ping`
- `list_arenas`
- `get_arena_details`
- `get_game_status`
- `get_user_trades`
- `prepare_join_arena`
- `prepare_trade_position`

Build and run it from the repo root:

```bash
yarn mcp:build
yarn mcp:serve
```

Required environment variables:

```bash
TRADE_ARENA_BASE_RPC_URL=https://api.devnet.solana.com
TRADE_ARENA_ER_RPC_URL=<magicblock-er-rpc-url>
TRADE_ARENA_PROGRAM_ID=ETZ1wJJihV6xfcf9GtCp9sNp2cv6cMGeyuFPSVHQJ4C5
PORT=3000
```

`TRADE_ARENA_PROGRAM_ID` defaults to the deployed devnet program id above. The
MCP server discovers arenas by scanning real `Game` accounts on the configured
base RPC endpoint, including delegated accounts owned by the MagicBlock
delegation program; it does not read a local arena JSON registry.

Run MCP service tests:

```bash
yarn mcp:test
```

Run the live MCP integration test against real devnet + MagicBlock RPC:

```bash
yarn mcp:test:live
```

The live test uses the configured RPC URLs and program id, discovers real
base-layer `Game` accounts, checks decoded account data against raw RPC account
data, and prepares unsigned join/trade transactions from live blockhashes.
MCP tools that target a specific game use `game_pubkey`, the `Game` account PDA.

## Notes

- Virtual balances and trade notionals use 6 decimal places.
- `TradeAction` supports increasing, reducing, or fully closing a single net position.
- The deployed program id currently configured for localnet and devnet is `ETZ1wJJihV6xfcf9GtCp9sNp2cv6cMGeyuFPSVHQJ4C5`.
