export type AgentSide = "long" | "short";
export type AgentTradeStatus = "open" | "pending_close" | "closed";
export type AgentParticipationStatus =
  | "not_joined"
  | "joined"
  | "in_position"
  | "settled";

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
  status?: "idle" | "creating" | "joinable" | "active" | "ending" | "ended";
  elapsedSeconds?: number;
  durationSeconds?: number;
  startedAtMs?: number | null;
  endsAtMs?: number | null;
  playerCount?: number;
  maxPlayers?: number;
  prizePoolUsd?: number;
  winner?: string | null;
};

export type ArenaSnapshot = {
  updatedAt: number;
  game: ArenaGameSummary;
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
