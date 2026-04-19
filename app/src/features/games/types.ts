export type GameStatus = "registration" | "live" | "settled";

export type GameSummary = {
  id: string;
  title: string;
  subtitle: string;
  assetPair: string;
  network: "devnet";
  status: GameStatus;
  startsAt: string;
  entryFeeUsd: number;
  prizePoolUsd: number;
  playerCount: number;
  strategyCount: number;
};

export type PlayerStanding = {
  address: string;
  strategy: string;
  pnlUsd: number;
  conviction: "Measured" | "Balanced" | "Aggressive";
};

export type GameDetail = GameSummary & {
  summary: string;
  oracle: string;
  totalVolumeUsd: number;
  averageExposureUsd: number;
  prizeDistribution: string;
  standings: PlayerStanding[];
};
