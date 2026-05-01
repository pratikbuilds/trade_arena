import type {
  ArenaGame,
  ArenaGameStatus,
  ArenaSnapshot,
} from "@/lib/agent-game";
import { formatUsd } from "@/lib/market";

const MICROS_PER_USD = 1_000_000;

export type ArenaPayload<T> =
  | { status: "ready"; data: T }
  | { status: "empty"; data: T };

export function isArenaGame(value: unknown): value is ArenaGame {
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

export function parseArenaGames(value: unknown): ArenaPayload<ArenaGame[]> {
  if (!Array.isArray(value) || !value.every(isArenaGame)) {
    throw new Error("Arena list returned an invalid payload.");
  }

  return value.length > 0
    ? { status: "ready", data: value }
    : { status: "empty", data: [] };
}

export function isArenaSnapshot(value: unknown): value is ArenaSnapshot {
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

export function parseArenaSnapshot(value: unknown): ArenaSnapshot {
  if (!isArenaSnapshot(value)) {
    throw new Error("MCP returned an invalid arena snapshot.");
  }

  return value;
}

export function shortPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`;
}

export function microsToUsd(value: string): number {
  return Number(value) / MICROS_PER_USD;
}

export function formatMicrosUsd(value: string): string {
  return formatUsd(microsToUsd(value));
}

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

export function formatStartTime(startTime: number): string {
  if (startTime <= 0) {
    return "Not started";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(startTime * 1000);
}

export function statusLabel(status: ArenaGameStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "joinable":
      return "Joinable";
    case "ended":
      return "Ended";
  }
}

export function statusTone(
  status: ArenaGameStatus
): "default" | "secondary" | "outline" {
  if (status === "active") {
    return "default";
  }

  return status === "joinable" ? "secondary" : "outline";
}
