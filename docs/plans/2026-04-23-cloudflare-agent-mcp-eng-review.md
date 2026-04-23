# Trade Arena Cloudflare Agent and MCP Engineering Review

## Scope Challenge

### What existing code already solves parts of this?

1. The on-chain game lifecycle already exists in `programs/trade_arena`, including `create_game`, `join_game`, `delegate_player`, `delegate_game`, `start_game`, and `trade_position`.
2. The current program already exposes the narrow trading action surface the agent needs: `Increase`, `Reduce`, and `CloseAll`.
3. Session-key-compatible trading is already modeled in the program and test harness, which means the backend should not invent a second authorization model.
4. The repo already has generated IDL and TypeScript types in `target/idl/trade_arena.json` and `target/types/trade_arena.ts`, which should be reused by all server-side builders.

### What is the minimum change set that achieves the goal?

1. Add one Cloudflare runtime package for the hosted trader agent.
2. Add one server-side MCP service that builds unsigned base64 transactions for the existing program instructions.
3. Add one server-side MCP service plus relay backend for accepting signed transactions and broadcasting them to the right cluster or relayer.
4. Add a small shared contract package or module for transaction envelopes, match metadata, and agent execution events.

### If this touches more than 8 files or adds more than 2 major abstractions, is that justified?

Yes. This is a justified `BIG CHANGE` because the missing functionality is not a UI tweak or protocol tweak. It is a new control plane with three distinct responsibilities:

1. Cloudflare trader runtime
2. Program transaction builder MCP
3. Execution MCP plus relay backend

Trying to collapse these into fewer abstractions would blur security boundaries and make rollout harder.

### Review Mode

Recommended mode: `BIG CHANGE`

Reason:

1. The repo already has the on-chain half.
2. The missing work is a new server-side runtime and two service boundaries.
3. The safest path is a deliberate split, not a clever minimal abstraction.

## What Already Exists

1. `Game` and `PlayerState` already define the match and per-player trading model.
2. `join_game` already handles entry-fee transfer and player-state initialization.
3. `trade_position` already enforces the narrow trade API and session-token-compatible authorization path.
4. `delegate_player` and `delegate_game` already define the transition from base layer to MagicBlock execution.
5. The simulation tests already prove the main program lifecycle and should be treated as the ground truth for account derivation and instruction ordering.

## Architecture

### Recommendation

Recommend one explicit split first:

1. `Program MCP` builds unsigned transactions for existing program instructions.
2. `Execution MCP` validates submission payloads and forwards signed transactions to a relay backend.
3. `Relay backend` owns routing, retries, confirmation tracking, and broadcast policy.
4. `Cloudflare Trader Agent` owns strategy prompt state, steering updates, session-key custody, and transaction signing.

Do not let the relay backend build business-logic transactions. Do not let the trader agent assemble low-level account metadata by itself.

### Ownership Boundaries

1. `Program MCP`
   Owns program-aware transaction construction.
   Inputs: match metadata, trader public key, action params, recent blockhash context.
   Outputs: unsigned base64 transaction envelope plus metadata.

2. `Execution MCP`
   Owns server-side submission API for signed payloads.
   Inputs: signed base64 transaction envelope plus target cluster metadata.
   Outputs: submission receipt, relay id, status handle.

3. `Relay backend`
   Owns actual chain delivery.
   Inputs: signed transaction bytes, target endpoint, delivery policy.
   Outputs: tx signature, confirmation state, failure reason, retry history.

4. `Cloudflare Trader Agent`
   Owns strategy state and key state.
   Inputs: base strategy prompt, steering prompt, match assignment, unsigned transaction envelope.
   Outputs: signed transaction envelope, execution events, user-visible reasoning summary.

### Dependency Graph

```text
Frontend / Admin Panel
  -> Match API / existing app backend
  -> Cloudflare Trader Agent runtime
      -> Program MCP
      -> Execution MCP
          -> Relay backend
              -> Solana RPC / MagicBlock ER endpoint

Shared dependencies
  -> target/idl/trade_arena.json
  -> target/types/trade_arena.ts
  -> shared transaction envelope types
```

### Data Flow

```text
Admin creates match
  -> match metadata stored server-side

User joins competition
  -> user pays entry fee through existing join flow
  -> user creates strategy prompt
  -> Cloudflare Trader Agent is provisioned
  -> agent session key is generated or loaded

Agent wants to act
  -> asks Program MCP for unsigned base64 tx
  -> signs tx with session key inside agent runtime
  -> sends signed tx to Execution MCP
  -> Execution MCP forwards to relay backend
  -> relay backend submits to base or ER
  -> status flows back to agent and UI
```

### State Transitions

```text
MATCH_CREATED
  -> USER_JOINED
  -> AGENT_PROVISIONED
  -> AGENT_READY
  -> AGENT_SIGNING_CAPABLE
  -> TX_REQUESTED
  -> TX_SIGNED
  -> TX_SUBMITTED
  -> TX_CONFIRMED | TX_FAILED
  -> MATCH_ENDED
```

### Parallel Workstreams

These can proceed in parallel after the transaction envelope contract is fixed.

```text
Track A: Cloudflare agent setup
  -> agent package scaffold
  -> session-key storage
  -> prompt + steering state
  -> signing helpers

Track B: Program MCP
  -> account derivation helpers
  -> join tx builder
  -> trade tx builder
  -> envelope format

Track C: Execution MCP + relay backend
  -> signed payload schema
  -> relay endpoint
  -> status tracking
  -> retry policy
```

### Rollback Posture

1. The program remains the source of truth, so the new server surfaces can be rolled back without migrating on-chain data.
2. The relay backend should be disable-able independently from Program MCP.
3. Cloudflare agent rollout should be feature-flagged so manual or test traders can continue to participate if the agent runtime is unstable.

### Security Boundaries

1. Program MCP must never sign transactions.
2. Execution MCP must never mutate a signed payload.
3. Relay backend must treat the signed payload as opaque bytes plus routing metadata.
4. Agent session keys must never leave the Cloudflare runtime in raw form.
5. Prompt steering must never widen signing authority beyond the fixed join and trade transaction surfaces.

## Code Quality

1. Keep one shared `transaction-envelope` contract instead of duplicating request and response shapes across Program MCP, Execution MCP, backend, and agent runtime.
2. Keep PDA derivation in one module reused by Program MCP tests and relay validation. Do not duplicate PDA logic in the frontend and backend separately.
3. Build around the generated IDL and types rather than hand-maintained discriminator constants spread across services.
4. Avoid an abstraction explosion in the Cloudflare runtime. Start with one `TraderAgent` and one state model; do not invent a generic agent framework yet.
5. Put cluster routing policy in the relay backend, not in the Program MCP. Program MCP should only express whether the instruction belongs on base layer or ER.
6. Keep comments focused on trust boundaries and transaction semantics. Avoid verbose comments that restate the code and will go stale.

### Recommended Module Layout

```text
cloudflare/
  src/agents/
    trader-agent.ts
  src/lib/
    env.ts
    session-key.ts
    transaction-envelope.ts
    trader-events.ts

services/program-mcp/
  src/
    tools/
      build-join-tx.ts
      build-trade-tx.ts
    lib/
      idl.ts
      pdas.ts
      tx-builder.ts

services/execution-mcp/
  src/
    tools/
      submit-signed-tx.ts
      get-submission-status.ts

services/relay-backend/
  src/
    routes/
      transactions.ts
      statuses.ts
    lib/
      broadcaster.ts
      retry-policy.ts
      endpoint-router.ts
```

## Test Diagram

```text
                    +----------------------+
                    |    Test Coverage     |
                    +----------------------+
                               |
        +----------------------+----------------------+
        |                      |                      |
        v                      v                      v
   UX / API flows         Data flows             Failure branches
        |                      |                      |
        v                      v                      v
 provision / steer      build -> sign -> send   stale tx / bad route /
 join / trade / watch   -> confirm / fail       relay timeout / mismatch
```

### New UX Flows

1. `Provision trader`
   Unit test:
   Agent state initialization, prompt merge logic, session-key creation helpers.
   Integration test:
   API to Cloudflare runtime provisioning flow.
   Explicit failures:
   Duplicate trader id, missing match metadata, key-generation failure.

2. `Steer trader`
   Unit test:
   Steering prompt replacement or append rules.
   Integration test:
   UI or API update reflected in agent state.
   Explicit failures:
   Oversized prompt, invalid match state, update after match end.

3. `User watches trade history`
   Unit test:
   Event normalization and transaction status mapping.
   Integration test:
   Relay status emitted back to agent and surfaced to UI.
   Explicit failures:
   Missing relay receipt, duplicate status updates, partial confirmation data.

### New Data Flows

1. `Program MCP build flow`
   Unit test:
   PDA derivation, account selection, instruction-to-cluster mapping, envelope schema.
   Integration test:
   Build unsigned join and trade transactions against current IDL.
   Explicit failures:
   Wrong game id, wrong vault derivation, missing recent blockhash, unsupported action.

2. `Agent sign flow`
   Unit test:
   Base64 decode, signature insertion, public-key ownership checks.
   Integration test:
   Unsigned tx from Program MCP signed by Cloudflare agent and accepted by relay backend.
   Explicit failures:
   Corrupt base64, wrong fee payer, agent key mismatch, expired blockhash.

3. `Execution flow`
   Unit test:
   Submission schema validation and endpoint routing.
   Integration test:
   Signed tx accepted by Execution MCP and delivered by relay backend.
   Explicit failures:
   wrong target cluster, transport timeout, RPC rejection, duplicate submission id.

### New Code Paths

1. Base-layer join transaction path
2. ER trade transaction path
3. Signed payload submission path
4. Relay confirmation polling or webhook path
5. Agent state update path after tx success or failure

### New Branches and Outcomes

1. Join succeeds
2. Join fails before submission
3. Join submitted but not confirmed
4. Trade succeeds on ER
5. Trade rejected by program
6. Relay retries then confirms
7. Relay exhausts retries

## Performance

1. Do not fetch or parse the full IDL on every request. Load it once per process or compile the required instruction metadata into a small module.
2. Avoid repeated PDA derivation in multiple layers for the same request. Program MCP should derive once and return the resolved transaction envelope.
3. Relay backend should avoid blind confirmation polling for every transaction. Use bounded polling with status caching keyed by tx signature or submission id.
4. Agent runtime should not keep full transaction history in hot state forever. Persist only the recent summary needed for user steering and current match context.
5. Watch out for concurrency on the same agent session key. Overlapping sign-and-submit calls can cause nonce or recent-blockhash churn and ambiguous status.

## Failure Modes

1. Product-level mismatch: the user story says the human pays entry fee and joins, but one proposed server flow has the agent signing join. This must be resolved before implementation.
   Recommendation:
   Keep user-wallet join separate from agent-signed trade unless there is a deliberate decision to fund agent wallets directly.

2. Transaction envelope drift between Program MCP and relay backend.
   Recommendation:
   Share one schema package and version every envelope.

3. Agent key drift or accidental re-provisioning.
   Recommendation:
   Make trader identity stable and treat session-key rotation as an explicit admin operation.

4. Relay backend submits to wrong cluster.
   Recommendation:
   Program MCP marks each transaction as `base` or `er`; relay backend validates before send.

5. Signed payload tampering in transit.
   Recommendation:
   Execution MCP and relay backend must treat signed bytes as immutable and log the digest on receipt.

6. Steering prompt causes unsafe or malformed action requests.
   Recommendation:
   Keep the Program MCP tool surface narrow and schema-validated so prompt changes only influence allowed parameters.

7. Generated IDL changes but Program MCP keeps building stale transactions.
   Recommendation:
   Tie Program MCP build validation to current `target/idl/trade_arena.json` and fail CI on drift.

## Not In Scope

1. Generic third-party tool marketplace
2. User-supplied arbitrary code execution
3. Broad transaction composition beyond the approved join and trade flows
4. Monetization and paid plan logic
5. Cross-match long-term agent memory or agent reputation systems
6. New on-chain protocol changes unless a server-side gap cannot be solved with the existing instruction set

## Completion Summary

1. The repo already has the protocol half; the missing work is the hosted control plane.
2. This should be implemented as three parallel tracks with one shared transaction envelope contract.
3. Recommended starting order:
   1. Finalize envelope schema and target-cluster metadata.
   2. Scaffold Program MCP and validate unsigned join and trade builds against the current IDL.
   3. Scaffold relay backend and Execution MCP around signed-payload submission and status tracking.
   4. Scaffold Cloudflare Trader Agent with prompt state, steering state, and signing capability.
4. The one design issue that still needs a firm product decision is whether join is signed by the user wallet or the agent wallet in v1.
5. Everything else is concrete enough that implementation can start immediately after this review.
