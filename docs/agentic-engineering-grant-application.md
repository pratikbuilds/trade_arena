# Agentic Engineering Grant Application Draft

Submit here: https://superteam.fun/earn/grants/agentic-engineering

## Step 1: Basics

**Project Title**
> Trade Arena

**One Line Description**
> Agent-native Solana competition infrastructure where AI agents join USDC-funded arenas, execute through MCP-prepared transactions on MagicBlock Ephemeral Rollups, and settle winners back to Solana.

**TG username**
> t.me/pratikbuild

**Wallet Address**
> F8maeqC4R43KqvrVb9yMp8rzEV4P6Qqqd2UAhnCJMJKA

## Step 2: Details

**Project Details**
> Trade Arena is agent-native competition infrastructure for Solana, with trading as the first arena type. Players or AI agents join a short timed arena with a real entry fee, trade during the round, and compete on final portfolio value. The current prototype uses USDC prize vaults and MagicBlock Ephemeral Rollups for low-latency execution, but the architecture is not limited to USDC or MagicBlock-only markets. The roadmap includes expanding arenas to trading venues such as Phenix and JupPredict as additional competition surfaces.
>
> The current prototype includes an Anchor program for arena lifecycle, player state, delegated execution, settlement, and prize claims; a React/Vite frontend for arena discovery and gameplay; and a Model Context Protocol service that lets agent clients discover live arenas, inspect player/game state, and prepare unsigned join or trade transactions. The protocol shape is intentionally reusable: MCP transaction preparation, venue-specific trading adapters, delegated low-latency execution, and base-layer settlement can support multiple agent competition formats beyond the initial USDC/MagicBlock implementation.
>
> This grant will help harden the agent execution loop rather than just polish a game UI. The next milestone is to make the MCP surface reliable, improve the agent transaction flow, finish the user-facing arena experience, and package the project for Colosseum submission with reproducible devnet demos that prove create, join, delegate, trade, end, commit, and claim flows.

**Deadline**
> 2026-05-09 23:59 IST

**Proof of Work**
> GitHub repo: https://github.com/pratikbuilds/trade_arena
>
> Deployed devnet program id: `HxqxwrurkZDcyVQVTaiz7DSaKXdPgypMzGiRj7kPjBdB`
>
> The repo contains an Anchor program under `programs/trade_arena`, a Vite React frontend under `app`, an MCP service under `services/user-mcp`, integration tests, simulation scripts, and engineering plans under `docs/plans`.
>
> Recent commits show progress across the full product: game discovery page, launch rehearsal verification, live MCP arena state, admin game launch runner, MCP joinability fixes, user MCP server, agent trade UI, frontend prototype, market chart UI, and the initial on-chain scaffold.
>
> Devnet/MagicBlock proof: `artifacts/launch-game-2026-04-29T07-06-27-087Z.md` records a full 75-second devnet game with player funding, USDC minting, game creation, three joins, player/game delegation to MagicBlock ER, live trades, game end, commit back to devnet, and prize claim.
>
> Extended simulation proof: `artifacts/15m-simulation-report.md` records a 900-second game with 3 players, 30 completed trades per player, 201 total logged instructions, MagicBlock ER execution, base-layer commit, and prize claim.
>
> AI-assisted development proof: attach the sanitized `claude-session.jsonl` and `codex-session.jsonl` files from the project root.

**Personal X Profile**
> x.com/pratikdevv

**Personal GitHub Profile**
> github.com/pratikbuilds

**Colosseum Crowdedness Score**
> 270. Colosseum Copilot maps Trade Arena most closely to AI-native Solana DeFi assistants and agent trading competitions, including Model Context Swap, Trade Rings, Aegis, and Agent Royale. Broader AI agent infrastructure is more crowded, but Trade Arena's differentiated wedge is agent competition infrastructure: MCP-prepared transactions, MagicBlock delegated execution, real prize settlement, planned support for additional trading venues such as Phenix and JupPredict, and reproducible arena lifecycle simulations. Screenshot this Copilot result, upload it to a publicly accessible Google Drive link, and paste that link here.

**AI Session Transcript**
> Attach the sanitized `claude-session.jsonl` and `codex-session.jsonl` files from the project root.

## Step 3: Milestones

**Goals and Milestones**
> 1. By 2026-05-03: finalize the current devnet arena flow, including create, join, delegate, trade, end, commit, and claim flows with reproducible scripts.
>
> 2. By 2026-05-05: harden the MCP service for agent clients, including arena discovery, player state, trade history, snapshots, and unsigned join/trade transaction preparation against live devnet data.
>
> 3. By 2026-05-07: polish the React arena experience so users can discover live games, inspect arena state, and follow agent/human trading activity from the UI.
>
> 4. By 2026-05-08: complete a public launch rehearsal artifact with transaction links, game PDA, snapshot URLs, agent profiles, and instructions for reviewers to reproduce the demo.
>
> 5. By 2026-05-09: submit the Colosseum project page, public GitHub repo, AI transcript, and proof assets required for final grant review.

**Primary KPI**
> Complete at least 3 public devnet arena rehearsals with 3+ participants or agents each, end-to-end settlement, and reproducible transaction artifacts before final submission.

**Final tranche checkbox**
> I understand that to receive the final tranche I must submit the Colosseum project link, GitHub repo, and AI subscription receipt.

## Submission Checklist

- Session transcripts: sanitized `claude-session.jsonl` and `codex-session.jsonl`
- Crowdedness Score screenshot link from Colosseum Copilot
- GitHub repo link: https://github.com/pratikbuilds/trade_arena
- Devnet program id: `HxqxwrurkZDcyVQVTaiz7DSaKXdPgypMzGiRj7kPjBdB`
- Optional proof artifacts from `artifacts/`
