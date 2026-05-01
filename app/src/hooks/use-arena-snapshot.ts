import { useCallback } from "react";

import type { ArenaSnapshot } from "@/lib/agent-game";
import { parseArenaSnapshot } from "@/lib/arena";
import {
  type ResourceStatus,
  usePollingResource,
} from "@/hooks/use-polling-resource";

type SnapshotState = {
  snapshot: ArenaSnapshot | null;
  status: ResourceStatus;
  error: string | null;
  retry: () => void;
};

export function useArenaSnapshot(
  gamePubkey?: string,
  refreshMs = 7500
): SnapshotState {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const params = new URLSearchParams({ ts: String(Date.now()) });
      const queryGamePubkey = new URLSearchParams(window.location.search).get(
        "game_pubkey"
      );
      const selectedGamePubkey = gamePubkey ?? queryGamePubkey;
      if (selectedGamePubkey) {
        params.set("game_pubkey", selectedGamePubkey);
      }

      const response = await fetch(`/api/arena/snapshot?${params}`, {
        cache: "no-store",
        signal,
      });

      if (response.status === 404) {
        return { status: "empty" as const, data: null };
      }

      if (!response.ok) {
        throw new Error(`MCP snapshot request failed with ${response.status}.`);
      }

      return {
        status: "ready" as const,
        data: parseArenaSnapshot((await response.json()) as unknown),
      };
    },
    [gamePubkey]
  );

  const {
    data: snapshot,
    status,
    error,
    retry,
  } = usePollingResource<ArenaSnapshot | null>({
    load,
    initialData: null,
    emptyData: null,
    refreshMs,
    fallbackError: "Failed to load MCP arena snapshot.",
    isSameData: (current, next) =>
      current?.updatedAt === next?.updatedAt && current !== null,
  });

  return {
    snapshot,
    status,
    error,
    retry,
  };
}
