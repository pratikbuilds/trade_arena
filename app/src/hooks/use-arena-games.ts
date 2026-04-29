import { useEffect, useState } from "react";
import type { ArenaGame } from "@/lib/agent-game";

type GamesStatus = "loading" | "ready" | "empty" | "error";

type GamesState = {
  games: ArenaGame[];
  status: GamesStatus;
  error: string | null;
  retry: () => void;
};

function isArenaGame(value: unknown): value is ArenaGame {
  if (!value || typeof value !== "object") {
    return false;
  }

  const game = value as Partial<ArenaGame>;
  return (
    typeof game.game_pubkey === "string" &&
    typeof game.game_id === "number" &&
    (game.status === "joinable" ||
      game.status === "active" ||
      game.status === "ended")
  );
}

export function useArenaGames(refreshMs = 10000): GamesState {
  const [games, setGames] = useState<ArenaGame[]>([]);
  const [status, setStatus] = useState<GamesStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadGames() {
      try {
        const params = new URLSearchParams({
          status: "all",
          ts: String(Date.now()),
        });
        const response = await fetch(`/api/arena/arenas?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Arena list request failed with ${response.status}.`);
        }

        const payload = (await response.json()) as unknown;
        if (!Array.isArray(payload) || !payload.every(isArenaGame)) {
          throw new Error("Arena list returned an invalid payload.");
        }

        setGames(payload);
        setStatus(payload.length > 0 ? "ready" : "empty");
        setError(null);
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load arena games."
        );
        setStatus("error");
      }
    }

    void loadGames();
    const intervalId = window.setInterval(() => {
      void loadGames();
    }, refreshMs);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [refreshMs, reloadToken]);

  return {
    games,
    status,
    error,
    retry: () => {
      setStatus("loading");
      setReloadToken((token) => token + 1);
    },
  };
}
