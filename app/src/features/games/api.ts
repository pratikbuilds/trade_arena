import { gameDetails } from "@/features/games/mock-data";
import type { GameDetail, GameSummary } from "@/features/games/types";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function listGames(): Promise<GameSummary[]> {
  await sleep(250);

  return gameDetails.map((game) => ({
    id: game.id,
    title: game.title,
    subtitle: game.subtitle,
    assetPair: game.assetPair,
    network: game.network,
    status: game.status,
    startsAt: game.startsAt,
    entryFeeUsd: game.entryFeeUsd,
    prizePoolUsd: game.prizePoolUsd,
    playerCount: game.playerCount,
    strategyCount: game.strategyCount,
  }));
}

export async function getGameById(gameId: string): Promise<GameDetail | null> {
  await sleep(350);
  return gameDetails.find((game) => game.id === gameId) ?? null;
}
