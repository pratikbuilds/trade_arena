import { PublicKey, type AccountInfo } from "@solana/web3.js";
import { DELEGATION_PROGRAM_ID } from "./pdas";
import {
  decodeGameAccount,
  type Arena,
  type DecodedGame,
  getArenaByPubkey,
  listArenas,
} from "./arena-registry";
import { baseConnection, erConnection } from "./transactions";
import { getUserTrades, type UserTrade } from "./trade-history";
import { getAgentProfile } from "./agent-profiles";
import {
  decodePlayerState,
  PLAYER_STATE_ACCOUNT_LENGTH,
  type DecodedPlayerState,
} from "./player-state";

const MICROS_PER_USD = 1_000_000;
const AGENT_COLORS = ["#f43f5e", "#22d3ee", "#a3e635", "#f59e0b", "#c084fc"];
const SNAPSHOT_CACHE_MS = Number(
  process.env.TRADE_ARENA_SNAPSHOT_CACHE_MS ?? "7500"
);

export type SnapshotTradeStatus = "open" | "pending_close" | "closed";
export type SnapshotParticipationStatus =
  | "not_joined"
  | "joined"
  | "in_position"
  | "settled";
export type SnapshotSide = "long" | "short";

export type SnapshotTrade = {
  id: string;
  cycle: number;
  side: SnapshotSide;
  status: SnapshotTradeStatus;
  notionalUsd: number;
  sizeBtc: number;
  entryPrice: number;
  openTx: string;
  openTime?: number;
  closeTx?: string;
  exitPrice?: number;
  pnlUsd?: number;
  openOffsetSeconds: number;
  closeOffsetSeconds?: number;
  closeTime?: number;
  markPrice?: number;
};

export type SnapshotAgent = {
  id: string;
  name: string;
  handle: string;
  thesis: string;
  color: string;
  player: string;
  session: string;
  playerState: string;
  participationStatus: SnapshotParticipationStatus;
  hasOpenPosition: boolean;
  virtualCashUsd: number;
  realizedPnlUsd: number;
  trades: SnapshotTrade[];
};

export type SnapshotGameAccount = {
  pubkey: string;
  layer: "er" | "base";
  owner: string;
  lamports: number;
  dataLength: number;
  delegated: boolean;
  parsed: DecodedGame & {
    entry_fee_usd: number;
    prize_pool_usd: number;
    leader_value_usd: number;
  };
};

export type ArenaSnapshot = {
  updatedAt: number;
  game: {
    id: string;
    gamePda: string;
    createGameTx: string;
    startedAtLabel: string;
    status: Arena["status"];
    elapsedSeconds: number;
    durationSeconds: number;
    startedAtMs: number | null;
    endsAtMs: number | null;
    playerCount: number;
    maxPlayers: number;
    prizePoolUsd: number;
    winner: string | null;
  };
  gameAccount: SnapshotGameAccount | null;
  agents: SnapshotAgent[];
};

type PlayerStateRecord = {
  pubkey: PublicKey;
  parsed: DecodedPlayerState;
  layer: "er" | "base";
};

type OpenTradeDraft = {
  id: string;
  cycle: number;
  side: SnapshotSide;
  notionalUsd: number;
  sizeBtc: number;
  entryPrice: number;
  openTx: string;
  openBlockTime: number | null;
};

const snapshotCache = new Map<
  string,
  { updatedAt: number; snapshot: ArenaSnapshot }
>();
const snapshotRequests = new Map<string, Promise<ArenaSnapshot | null>>();

function microsToUsd(value: bigint | string | number): number {
  return Number(value) / MICROS_PER_USD;
}

function shortPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`;
}

function isPlayerStateForGame(
  game: PublicKey,
  account: AccountInfo<Buffer>
): DecodedPlayerState | null {
  const parsed = decodePlayerState(Buffer.from(account.data));
  if (!parsed || !parsed.game.equals(game)) {
    return null;
  }

  return parsed;
}

async function scanPlayerStates(arena: Arena): Promise<PlayerStateRecord[]> {
  const game = new PublicKey(arena.game_pda);
  const programId = new PublicKey(arena.program_id);
  const filters = [
    { dataSize: PLAYER_STATE_ACCOUNT_LENGTH },
    { memcmp: { offset: 40, bytes: game.toBase58() } },
  ];
  const base = baseConnection();
  const er = erConnection();
  const scans = await Promise.all([
    er
      .getProgramAccounts(programId, { filters })
      .then((accounts) => ({ layer: "er" as const, accounts }))
      .catch(() => ({ layer: "er" as const, accounts: [] })),
    er
      .getProgramAccounts(DELEGATION_PROGRAM_ID, { filters })
      .then((accounts) => ({ layer: "er" as const, accounts }))
      .catch(() => ({ layer: "er" as const, accounts: [] })),
    base
      .getProgramAccounts(programId, { filters })
      .then((accounts) => ({ layer: "base" as const, accounts }))
      .catch(() => ({ layer: "base" as const, accounts: [] })),
    base
      .getProgramAccounts(DELEGATION_PROGRAM_ID, { filters })
      .then((accounts) => ({ layer: "base" as const, accounts }))
      .catch(() => ({ layer: "base" as const, accounts: [] })),
  ]);

  const byPlayerState = new Map<string, PlayerStateRecord>();
  for (const scan of scans) {
    for (const { pubkey, account } of scan.accounts) {
      const parsed = isPlayerStateForGame(game, account);
      if (!parsed) continue;

      const existing = byPlayerState.get(pubkey.toBase58());
      if (existing?.layer === "er") continue;
      byPlayerState.set(pubkey.toBase58(), {
        pubkey,
        parsed,
        layer: scan.layer,
      });
    }
  }

  return [...byPlayerState.values()].sort((left, right) =>
    left.parsed.player.toBase58().localeCompare(right.parsed.player.toBase58())
  );
}

function logNumber(logs: string[], key: string): bigint | null {
  const joined = logs.join(" ");
  const match = new RegExp(`${key}=(-?\\d+)`).exec(joined);
  return match ? BigInt(match[1]) : null;
}

function estimateExitPrice(trade: OpenTradeDraft, pnlUsd: number): number {
  if (trade.sizeBtc <= 0) return trade.entryPrice;
  if (trade.side === "long") {
    return trade.entryPrice + pnlUsd / trade.sizeBtc;
  }

  return trade.entryPrice - pnlUsd / trade.sizeBtc;
}

function openRowFromDraft(args: {
  trade: OpenTradeDraft;
  updatedAtMs: number;
  markPrice: number | null;
}): SnapshotTrade {
  return {
    ...args.trade,
    status: "open",
    openTime: blockTimeMs(args.trade.openBlockTime),
    openOffsetSeconds: tradeOffset(args.trade.openBlockTime, args.updatedAtMs),
    markPrice: args.markPrice ?? args.trade.entryPrice,
  };
}

function closedRowFromDraft(args: {
  trade: OpenTradeDraft;
  id: string;
  pnlUsd: number;
  closeTx: string;
  closeBlockTime: number | null;
  updatedAtMs: number;
  sizeBtc?: number;
  notionalUsd?: number;
}): SnapshotTrade {
  const trade = {
    ...args.trade,
    id: args.id,
    sizeBtc: args.sizeBtc ?? args.trade.sizeBtc,
    notionalUsd: args.notionalUsd ?? args.trade.notionalUsd,
  };

  return {
    ...trade,
    status: "closed",
    exitPrice: estimateExitPrice(trade, args.pnlUsd),
    pnlUsd: args.pnlUsd,
    closeTx: args.closeTx,
    openTime: blockTimeMs(args.trade.openBlockTime),
    openOffsetSeconds: tradeOffset(args.trade.openBlockTime, args.updatedAtMs),
    closeOffsetSeconds: tradeOffset(args.closeBlockTime, args.updatedAtMs),
    closeTime: blockTimeMs(args.closeBlockTime),
  };
}

function tradeOffset(blockTime: number | null, updatedAtMs: number): number {
  if (!blockTime) return -90;
  return blockTime - Math.floor(updatedAtMs / 1000) + 90;
}

function blockTimeMs(blockTime: number | null): number | undefined {
  return typeof blockTime === "number" ? blockTime * 1000 : undefined;
}

export function buildTrades(
  playerId: string,
  trades: UserTrade[],
  playerState: DecodedPlayerState,
  updatedAtMs: number,
  markPrice: number | null
): SnapshotTrade[] {
  const chronological = [...trades].reverse();
  const rows: SnapshotTrade[] = [];
  let openTrade: OpenTradeDraft | null = null;
  let openRowIndex = -1;
  let cycle = 0;
  let partialCloseCount = 0;

  for (const trade of chronological) {
    if (trade.err) continue;

    if (trade.action.kind === "increase") {
      const quantity = logNumber(trade.logs, "quantity");
      const entry =
        logNumber(trade.logs, "avg_entry") ??
        logNumber(trade.logs, "entry") ??
        playerState.entryPrice;
      const notionalUsd = microsToUsd(trade.action.notional_usdc);
      const sizeBtc = quantity ? microsToUsd(quantity) : 0;

      const currentOpenTrade: OpenTradeDraft | null = openTrade;
      if (currentOpenTrade && currentOpenTrade.side === trade.action.side) {
        const updatedOpenTrade: OpenTradeDraft = {
          ...currentOpenTrade,
          notionalUsd: currentOpenTrade.notionalUsd + notionalUsd,
          sizeBtc: currentOpenTrade.sizeBtc + sizeBtc,
          entryPrice: microsToUsd(entry),
        };
        openTrade = updatedOpenTrade;
        if (openRowIndex >= 0) {
          rows[openRowIndex] = openRowFromDraft({
            trade: updatedOpenTrade,
            updatedAtMs,
            markPrice,
          });
        }
        continue;
      }

      cycle += 1;
      partialCloseCount = 0;
      openTrade = {
        id: `${playerId}-${cycle}`,
        cycle,
        side: trade.action.side,
        notionalUsd,
        sizeBtc,
        entryPrice: microsToUsd(entry),
        openTx: trade.signature,
        openBlockTime: trade.block_time,
      };
      rows.push(
        openRowFromDraft({
          trade: openTrade,
          updatedAtMs,
          markPrice,
        })
      );
      openRowIndex = rows.length - 1;
      continue;
    }

    if (trade.action.kind === "reduce") {
      if (!openTrade) {
        continue;
      }
      const currentOpenTrade: OpenTradeDraft = openTrade;

      const quantity = logNumber(trade.logs, "quantity");
      const remaining = logNumber(trade.logs, "remaining");
      const pnl = logNumber(trade.logs, "pnl") ?? 0n;
      const pnlUsd = microsToUsd(pnl);
      const reducedSizeBtc = quantity
        ? microsToUsd(quantity)
        : Math.min(
            currentOpenTrade.sizeBtc,
            microsToUsd(trade.action.notional_usdc)
          );
      const remainingSizeBtc = remaining
        ? microsToUsd(remaining)
        : Math.max(0, currentOpenTrade.sizeBtc - reducedSizeBtc);
      const isFullReduce =
        remainingSizeBtc <= 0 ||
        reducedSizeBtc >= currentOpenTrade.sizeBtc ||
        Math.abs(currentOpenTrade.sizeBtc - reducedSizeBtc) < 0.000001;

      if (isFullReduce) {
        const closed = closedRowFromDraft({
          trade: currentOpenTrade,
          id: currentOpenTrade.id,
          pnlUsd,
          closeTx: trade.signature,
          closeBlockTime: trade.block_time,
          updatedAtMs,
        });
        if (openRowIndex >= 0) {
          rows[openRowIndex] = closed;
        } else {
          rows.push(closed);
        }
        openTrade = null;
        openRowIndex = -1;
        continue;
      }

      partialCloseCount += 1;
      rows.push(
        closedRowFromDraft({
          trade: currentOpenTrade,
          id: `${currentOpenTrade.id}-reduce-${partialCloseCount}`,
          pnlUsd,
          closeTx: trade.signature,
          closeBlockTime: trade.block_time,
          updatedAtMs,
          sizeBtc: reducedSizeBtc,
          notionalUsd: microsToUsd(trade.action.notional_usdc),
        })
      );

      const remainingOpenTrade: OpenTradeDraft = {
        ...currentOpenTrade,
        sizeBtc: remainingSizeBtc,
        notionalUsd: Math.max(
          0,
          currentOpenTrade.notionalUsd - microsToUsd(trade.action.notional_usdc)
        ),
      };
      openTrade = remainingOpenTrade;
      if (openRowIndex >= 0) {
        rows[openRowIndex] = openRowFromDraft({
          trade: remainingOpenTrade,
          updatedAtMs,
          markPrice,
        });
      }
      continue;
    }

    if (trade.action.kind === "close_all" && openTrade) {
      const pnl = logNumber(trade.logs, "pnl") ?? 0n;
      const pnlUsd = microsToUsd(pnl);
      const closed = closedRowFromDraft({
        trade: openTrade,
        id: openTrade.id,
        pnlUsd,
        closeTx: trade.signature,
        closeBlockTime: trade.block_time,
        updatedAtMs,
      });
      if (openRowIndex >= 0) {
        rows[openRowIndex] = closed;
      } else {
        rows.push(closed);
      }
      openTrade = null;
      openRowIndex = -1;
    }
  }

  return rows;
}

async function fetchLivePriceUsd(arena: Arena): Promise<number | null> {
  try {
    const account = await erConnection().getAccountInfo(
      new PublicKey(arena.asset_feed),
      "confirmed"
    );
    if (!account || account.data.length < 134) return null;

    const data = Buffer.from(account.data);
    const rawPrice = Number(data.readBigInt64LE(73));
    const expoMagnitude = data.readInt32LE(89);
    const price = rawPrice / 10 ** expoMagnitude;
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function fetchGameAccountState(
  arena: Arena
): Promise<SnapshotGameAccount | null> {
  const gamePda = new PublicKey(arena.game_pda);

  async function readLayer(
    layer: SnapshotGameAccount["layer"]
  ): Promise<SnapshotGameAccount | null> {
    const account =
      layer === "er"
        ? await erConnection().getAccountInfo(gamePda, "confirmed")
        : await baseConnection().getAccountInfo(gamePda, "confirmed");
    if (!account) return null;

    try {
      const parsed = decodeGameAccount(Buffer.from(account.data));
      return {
        pubkey: gamePda.toBase58(),
        layer,
        owner: account.owner.toBase58(),
        lamports: account.lamports,
        dataLength: account.data.length,
        delegated: arena.delegated,
        parsed: {
          ...parsed,
          entry_fee_usd: microsToUsd(parsed.entry_fee_usdc),
          prize_pool_usd: microsToUsd(parsed.prize_pool_usdc),
          leader_value_usd: microsToUsd(parsed.leader_value),
        },
      };
    } catch {
      return null;
    }
  }

  const [er, base] = await Promise.all([readLayer("er"), readLayer("base")]);
  return arena.delegated ? er ?? base : base ?? er;
}

async function selectArena(gamePubkey?: string): Promise<Arena | null> {
  if (gamePubkey) {
    return getArenaByPubkey(gamePubkey);
  }

  const arenas = await listArenas("all");
  return (
    arenas.find((arena) => arena.status === "active") ??
    arenas.find((arena) => arena.status === "joinable") ??
    arenas[0] ??
    null
  );
}

async function buildArenaSnapshot(
  gamePubkey?: string
): Promise<ArenaSnapshot | null> {
  const arena = await selectArena(gamePubkey);
  if (!arena) return null;

  const updatedAt = Date.now();
  const startedAtMs = arena.start_time > 0 ? arena.start_time * 1000 : null;
  const endsAtMs = startedAtMs
    ? startedAtMs + arena.duration_seconds * 1000
    : null;
  const elapsedSeconds = startedAtMs
    ? Math.max(0, Math.floor((updatedAt - startedAtMs) / 1000))
    : 0;

  const [playerStates, markPrice, gameAccount] = await Promise.all([
    scanPlayerStates(arena),
    fetchLivePriceUsd(arena),
    fetchGameAccountState(arena),
  ]);

  const agents = await Promise.all(
    playerStates.map(async (state, index): Promise<SnapshotAgent> => {
      const player = state.parsed.player.toBase58();
      const profile = getAgentProfile(arena.game_pubkey, player);
      const playerId = profile?.id ?? `agent-${index + 1}`;
      const userTrades = await getUserTrades({
        gamePubkey: arena.game_pubkey,
        player: state.parsed.player,
        limit: 100,
      });
      const hasOpenPosition = state.parsed.positionSize > 0n;
      const participationStatus: SnapshotParticipationStatus =
        arena.status === "ended"
          ? "settled"
          : hasOpenPosition
          ? "in_position"
          : "joined";

      return {
        id: playerId,
        name: profile?.name ?? `Agent ${index + 1}`,
        handle: profile?.handle ?? `MCP wallet ${shortPubkey(player)}`,
        thesis: profile?.thesis ?? "Live MCP-controlled participant",
        color: profile?.color ?? AGENT_COLORS[index % AGENT_COLORS.length],
        player,
        session: profile?.session ?? player,
        playerState: state.pubkey.toBase58(),
        participationStatus,
        hasOpenPosition,
        virtualCashUsd: microsToUsd(state.parsed.virtualUsdc),
        realizedPnlUsd: microsToUsd(state.parsed.realizedPnl),
        trades: buildTrades(
          playerId,
          userTrades?.trades ?? [],
          state.parsed,
          updatedAt,
          markPrice
        ),
      };
    })
  );
  agents.sort((left, right) => {
    const leftProfile = getAgentProfile(arena.game_pubkey, left.player);
    const rightProfile = getAgentProfile(arena.game_pubkey, right.player);
    return (
      (leftProfile?.order ?? Number.MAX_SAFE_INTEGER) -
        (rightProfile?.order ?? Number.MAX_SAFE_INTEGER) ||
      left.player.localeCompare(right.player)
    );
  });

  return {
    updatedAt,
    game: {
      id: String(arena.game_id),
      gamePda: arena.game_pda,
      createGameTx: "",
      startedAtLabel:
        arena.status === "active"
          ? `MCP live game T+${elapsedSeconds}s / ${arena.duration_seconds}s`
          : `MCP ${arena.status} game`,
      status: arena.status,
      elapsedSeconds,
      durationSeconds: arena.duration_seconds,
      startedAtMs,
      endsAtMs,
      playerCount: arena.player_count,
      maxPlayers: arena.max_players,
      prizePoolUsd: microsToUsd(arena.prize_pool_usdc),
      winner: arena.winner,
    },
    gameAccount,
    agents,
  };
}

export async function getArenaSnapshot(
  gamePubkey?: string
): Promise<ArenaSnapshot | null> {
  const cacheKey = gamePubkey ?? "__latest__";
  const cached = snapshotCache.get(cacheKey);
  if (cached && Date.now() - cached.updatedAt < SNAPSHOT_CACHE_MS) {
    return cached.snapshot;
  }

  const inFlight = snapshotRequests.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = buildArenaSnapshot(gamePubkey)
    .then((snapshot) => {
      if (snapshot) {
        snapshotCache.set(cacheKey, { updatedAt: Date.now(), snapshot });
        snapshotCache.set(snapshot.game.gamePda, {
          updatedAt: Date.now(),
          snapshot,
        });
      }
      return snapshot;
    })
    .catch((error) => {
      if (cached) {
        return cached.snapshot;
      }
      throw error;
    })
    .finally(() => {
      snapshotRequests.delete(cacheKey);
    });

  snapshotRequests.set(cacheKey, request);
  return request;
}

export function invalidateArenaSnapshot(gamePubkey?: string): void {
  if (gamePubkey) {
    snapshotCache.delete(gamePubkey);
  }
  snapshotCache.delete("__latest__");
}
