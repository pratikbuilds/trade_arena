export type AgentSide = "long" | "short";
export type AgentTradeStatus = "open" | "pending_close" | "closed";
export type AgentParticipationStatus =
  | "not_joined"
  | "joined"
  | "in_position"
  | "settled";
export type ArenaGameStatus = "joinable" | "active" | "ended";

type AgentTradeBase = {
  id: string;
  cycle: number;
  side: AgentSide;
  status?: AgentTradeStatus;
  notionalUsd: number;
  sizeBtc: number;
  entryPrice: number;
  openTx: string;
  openTime?: number;
  openOffsetSeconds: number;
  markPrice?: number;
};

export type OpenAgentTrade = AgentTradeBase & {
  status: "open" | "pending_close";
  exitPrice?: number;
  pnlUsd?: number;
  closeTx?: string;
  closeOffsetSeconds?: number;
  closeTime?: number;
};

export type ClosedAgentTrade = AgentTradeBase & {
  status?: "closed";
  exitPrice: number;
  pnlUsd: number;
  closeTx: string;
  closeOffsetSeconds: number;
  closeTime?: number;
};

export type AgentTrade = OpenAgentTrade | ClosedAgentTrade;

export type ArenaAgent = {
  id: string;
  name: string;
  handle: string;
  thesis: string;
  color: string;
  player: string;
  session: string;
  participationStatus?: AgentParticipationStatus;
  hasOpenPosition?: boolean;
  virtualCashUsd: number;
  realizedPnlUsd: number;
  trades: AgentTrade[];
};

export type ArenaGameSummary = {
  id: string;
  gamePda: string;
  createGameTx: string;
  startedAtLabel: string;
  status?: "idle" | "creating" | ArenaGameStatus | "ending";
  elapsedSeconds?: number;
  durationSeconds?: number;
  startedAtMs?: number | null;
  endsAtMs?: number | null;
  playerCount?: number;
  maxPlayers?: number;
  prizePoolUsd?: number;
  winner?: string | null;
};

export type ArenaGameAccount = {
  pubkey: string;
  layer: "er" | "base";
  owner: string;
  lamports: number;
  dataLength: number;
  delegated: boolean;
  parsed: {
    creator: string;
    game_id: number;
    asset_feed: string;
    entry_fee_usdc: string;
    entry_fee_usd: number;
    duration_seconds: number;
    start_time: number;
    status: ArenaGameStatus;
    player_count: number;
    max_players: number;
    prize_pool_usdc: string;
    prize_pool_usd: number;
    token_mint: string;
    leader_value: string;
    leader_value_usd: number;
    winner: string | null;
    bump: number;
    vault_bump: number;
  };
};

export type ArenaGame = {
  game_pubkey: string;
  name: string;
  description: string;
  creator: string;
  game_id: number;
  game_pda: string;
  program_id: string;
  status: ArenaGameStatus;
  entry_fee_usdc: string;
  duration_seconds: number;
  start_time: number;
  player_count: number;
  max_players: number;
  prize_pool_usdc: string;
  asset_feed: string;
  token_mint: string;
  leader_value: string;
  winner: string | null;
  delegated: boolean;
};

export type ArenaSnapshot = {
  updatedAt: number;
  game: ArenaGameSummary;
  gameAccount: ArenaGameAccount | null;
  agents: ArenaAgent[];
};

export function explorerTxUrl(tx: string) {
  if (!tx) {
    return "#";
  }

  return `https://explorer.solana.com/tx/${tx}?cluster=custom&customUrl=${encodeURIComponent(
    "https://devnet.magicblock.app"
  )}`;
}

export function devnetTxUrl(tx: string) {
  if (!tx) {
    return "#";
  }

  return `https://explorer.solana.com/tx/${tx}?cluster=devnet`;
}
