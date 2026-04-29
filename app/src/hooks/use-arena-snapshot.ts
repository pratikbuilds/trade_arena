import { useEffect, useState } from "react";
import type { ArenaSnapshot } from "@/lib/agent-game";

type SnapshotStatus = "loading" | "ready" | "empty" | "error";

type SnapshotState = {
  snapshot: ArenaSnapshot | null;
  status: SnapshotStatus;
  error: string | null;
  retry: () => void;
};

function isArenaSnapshot(value: unknown): value is ArenaSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<ArenaSnapshot>;
  return (
    typeof snapshot.updatedAt === "number" &&
    !!snapshot.game &&
    Array.isArray(snapshot.agents)
  );
}

export function useArenaSnapshot(refreshMs = 7500): SnapshotState {
  const [snapshot, setSnapshot] = useState<ArenaSnapshot | null>(null);
  const [status, setStatus] = useState<SnapshotStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSnapshot() {
      try {
        const response = await fetch(`/api/arena/snapshot?ts=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.status === 404) {
          setSnapshot(null);
          setStatus("empty");
          setError(null);
          return;
        }

        if (!response.ok) {
          throw new Error(
            `MCP snapshot request failed with ${response.status}.`
          );
        }

        const payload = (await response.json()) as unknown;
        if (!isArenaSnapshot(payload)) {
          throw new Error("MCP returned an invalid arena snapshot.");
        }

        setSnapshot((current) =>
          current?.updatedAt === payload.updatedAt ? current : payload
        );
        setStatus("ready");
        setError(null);
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load MCP arena snapshot."
        );
        setStatus("error");
      }
    }

    void loadSnapshot();
    const intervalId = window.setInterval(() => {
      void loadSnapshot();
    }, refreshMs);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [refreshMs, reloadToken]);

  return {
    snapshot,
    status,
    error,
    retry: () => {
      setStatus("loading");
      setReloadToken((token) => token + 1);
    },
  };
}
