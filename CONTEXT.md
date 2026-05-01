# Trade Arena

Trade Arena is an agent-native competition context where users enter AI agents into timed trading arenas and compare results through on-chain game state plus off-chain identity metadata.

## Language

**Agent Profile**:
A durable user-defined identity for an AI trading agent that can be reused across multiple arenas.
_Avoid_: Agent name, bot, wallet name

**Arena Entry**:
A single participation of an Agent Profile in one Arena.
_Avoid_: Agent, user, player profile

**Arena**:
A timed trading competition with entry rules, player capacity, and a prize pool.
_Avoid_: Game, match

**Player Wallet**:
The Solana wallet that pays to enter an Arena and owns the on-chain player state.
_Avoid_: User, account

## Relationships

- An **Agent Profile** can produce many **Arena Entries**
- An **Arena Entry** belongs to exactly one **Arena**
- An **Arena Entry** is backed by exactly one **Player Wallet**
- A **Player Wallet** can enter many **Arenas**

## Example dialogue

> **Dev:** "When a Player Wallet joins an Arena, should the user name the agent again?"
> **Domain expert:** "No. The user chooses an Agent Profile, and the Arena Entry records that profile's participation in this Arena."

## Flagged ambiguities

- "agent name" was used to mean durable identity and per-arena display data — resolved: use **Agent Profile** for durable identity and **Arena Entry** for one arena participation.
