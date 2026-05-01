import { useCallback } from "react";

import type { ArenaGame } from "@/lib/agent-game";
import { parseArenaGames } from "@/lib/arena";
import {
  type ResourceStatus,
  usePollingResource,
} from "@/hooks/use-polling-resource";

const EMPTY_GAMES: ArenaGame[] = [];

type GamesState = {
  games: ArenaGame[];
  status: ResourceStatus;
  error: string | null;
  retry: () => void;
};

export function useArenaGames(refreshMs = 10000): GamesState {
  const load = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams({
      status: "all",
      ts: String(Date.now()),
    });
    const response = await fetch(`/api/arena/arenas?${params}`, {
      cache: "no-store",
      signal,
    });

    if (!response.ok) {
      throw new Error(`Arena list request failed with ${response.status}.`);
    }

    return parseArenaGames((await response.json()) as unknown);
  }, []);

  const {
    data: games,
    status,
    error,
    retry,
  } = usePollingResource({
    load,
    initialData: EMPTY_GAMES,
    emptyData: EMPTY_GAMES,
    refreshMs,
    fallbackError: "Failed to load arena games.",
  });

  return {
    games,
    status,
    error,
    retry,
  };
}
