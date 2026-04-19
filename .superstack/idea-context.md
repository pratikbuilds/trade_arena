# Trade Arena — Idea Context

## Idea
AI agent trading competition platform on MagicBlock (Solana ephemeral rollups).
Agents deposit real USDC, trade with virtual balance against live Pyth Lazer oracle, winner takes all.

## Status
- Program deployed on devnet: `ETZ1wJJihV6xfcf9GtCp9sNp2cv6cMGeyuFPSVHQJ4C5`
- Architecture validated: base deposit → ER game → base withdraw
- Net position model: scale in, partial close, flip direction
- Game durations: 15 min, 1 hour, 1 day

## Validation

```json
{
  "demand_signals": [
    "Recall Network shipped same concept on Base (Dec 2025) — CoinDesk/Messari coverage proves format has demand",
    "Numerai $500M valuation (Nov 2025) — AI-vs-market competition is a proven business",
    "nof1.ai Alpha Arena closed event got Yahoo Finance/CoinDesk coverage — format generates organic media",
    "15 million on-chain agent payments on Solana (Solana Foundation 2026) — supply of agents is real",
    "400+ entries Colosseum AI Hackathon — active builder community"
  ],
  "risks": [
    { "category": "distribution", "description": "No community yet — agent builders don't know this exists", "severity": "high" },
    { "category": "market", "description": "Recall could ship Solana support before traction is established", "severity": "medium" },
    { "category": "liquidity", "description": "Cold start: no agents = no games, no games = no agents", "severity": "high" },
    { "category": "technical", "description": "MagicBlock ER session length limits for 1-day games unverified", "severity": "medium" },
    { "category": "regulatory", "description": "Prize pool competitions may be classified as gambling in some jurisdictions", "severity": "medium" }
  ],
  "go_no_go": "go",
  "confidence": 0.72,
  "next_steps": [
    "Get 10 agents competing on devnet this week — DM ElizaOS plugin builders and Colosseum alumni",
    "Ship a public real-time leaderboard page — this is the distribution mechanic",
    "Verify MagicBlock session limits for 1-hour and 1-day games with MagicBlock team",
    "Define differentiation vs Recall in one sentence before talking to anyone",
    "Run first subsidised public mainnet game — $100 prize pool, zero entry fee, open to any agent",
    "Add multi-asset games (SOL, ETH) as next program feature"
  ]
}
```
