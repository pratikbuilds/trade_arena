import type { CandlePoint } from "liveline";

import type {
  AgentTrade,
  ArenaAgent,
  ArenaGameSummary,
} from "@/lib/agent-game";
import { formatUsd, type ChartWindow, type MarketView } from "@/lib/market";

export type ReplayMarker = {
  id: string;
  agent: ArenaAgent;
  trade: AgentTrade;
  phase: "entry" | "exit";
  time: number;
  price: number;
};

export type TradeWithAgent = {
  agent: ArenaAgent;
  trade: AgentTrade;
};

export type ClosedTrade = AgentTrade & {
  exitPrice: number;
  pnlUsd: number;
  closeTx: string;
  closeOffsetSeconds: number;
};

export type MarkerPosition = {
  left: string;
  top: string;
};

export type FocusedTradeDot = {
  id: string;
  position: MarkerPosition;
  phase: "entry" | "exit";
};

export type ReplayProjection = {
  agents: ArenaAgent[];
  game: ArenaGameSummary | null;
  selectedAgents: ArenaAgent[];
  selectedTradeRows: TradeWithAgent[];
  allTradeRows: TradeWithAgent[];
  focusedTrade: TradeWithAgent | null;
  replayMarkers: ReplayMarker[];
  visibleReplayMarkers: ReplayMarker[];
  replayStart: number;
  replayEnd: number;
  minReplayPrice: number;
  maxReplayPrice: number;
  livelineReference:
    | {
        value: number;
        label: string;
      }
    | undefined;
};

export function formatSignedUsd(value: number): string {
  const absValue = Math.abs(value);
  const absolute =
    absValue > 0 && absValue < 0.01
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 4,
          maximumFractionDigits: 4,
        }).format(absValue)
      : formatUsd(absValue);
  return value >= 0 ? `+${absolute}` : `-${absolute}`;
}

export function isClosedTrade(trade: AgentTrade): trade is ClosedTrade {
  return (
    (trade.status === "closed" || trade.status === undefined) &&
    typeof trade.exitPrice === "number" &&
    typeof trade.pnlUsd === "number" &&
    typeof trade.closeTx === "string" &&
    typeof trade.closeOffsetSeconds === "number"
  );
}

export function tradeStatusLabel(trade: AgentTrade): string {
  if (isClosedTrade(trade)) {
    return formatSignedUsd(trade.pnlUsd);
  }

  return trade.status === "pending_close" ? "Closing" : "Open";
}

export function participationLabel(agent: ArenaAgent): string {
  if (agent.hasOpenPosition || agent.participationStatus === "in_position") {
    return "In trade";
  }

  if (
    agent.participationStatus === "joined" ||
    agent.participationStatus === "settled" ||
    agent.trades.length > 0
  ) {
    return "Joined";
  }

  return "Waiting";
}

function formatRemainingDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  const paddedSeconds = remainingSeconds.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}

export function formatGameClock(
  game: ArenaGameSummary | null,
  snapshotUpdatedAt: number | undefined,
  nowMs: number
): string {
  if (!game) {
    return "MCP";
  }

  if (game.status === "ended") {
    return "Ended";
  }

  if (typeof game.endsAtMs === "number") {
    return formatRemainingDuration((game.endsAtMs - nowMs) / 1000);
  }

  if (
    typeof game.elapsedSeconds !== "number" ||
    typeof game.durationSeconds !== "number"
  ) {
    return "Pending";
  }

  const staleSeconds =
    typeof snapshotUpdatedAt === "number"
      ? Math.max(0, Math.floor((nowMs - snapshotUpdatedAt) / 1000))
      : 0;
  const elapsedSeconds =
    game.status === "active"
      ? game.elapsedSeconds + staleSeconds
      : game.elapsedSeconds;

  return formatRemainingDuration(game.durationSeconds - elapsedSeconds);
}

export function visibleCandles(
  candles: CandlePoint[],
  start: number,
  end: number
) {
  return candles.filter((candle) => candle.time >= start && candle.time <= end);
}

export function candleRangeForOverlay(
  candles: CandlePoint[],
  fallbackPrice: number
) {
  if (candles.length === 0) {
    return {
      min: fallbackPrice - 1,
      max: fallbackPrice + 1,
    };
  }

  const low = Math.min(...candles.map((candle) => candle.low));
  const high = Math.max(...candles.map((candle) => candle.high));
  const range = high - low;
  const margin = range * 0.12;

  if (range <= 0) {
    return {
      min: low - 0.2,
      max: high + 0.2,
    };
  }

  return {
    min: low - margin,
    max: high + margin,
  };
}

export function tradeOpenTime(
  trade: AgentTrade,
  chartAnchorTime: number
): number {
  const replayAnchor = chartAnchorTime - 90;
  return typeof trade.openTime === "number"
    ? Math.floor(trade.openTime / 1000)
    : replayAnchor + trade.openOffsetSeconds;
}

export function tradeCloseTime(
  trade: AgentTrade,
  chartAnchorTime: number
): number | null {
  if (!isClosedTrade(trade)) {
    return null;
  }

  const replayAnchor = chartAnchorTime - 90;
  return typeof trade.closeTime === "number"
    ? Math.floor(trade.closeTime / 1000)
    : replayAnchor + trade.closeOffsetSeconds;
}

export function buildReplayMarkers(
  agents: ArenaAgent[],
  chartAnchorTime: number
): ReplayMarker[] {
  return agents.flatMap((agent) =>
    agent.trades.flatMap((trade) => {
      const markers: ReplayMarker[] = [
        {
          id: `${trade.id}-entry`,
          agent,
          trade,
          phase: "entry",
          time: tradeOpenTime(trade, chartAnchorTime),
          price: trade.entryPrice,
        },
      ];

      if (isClosedTrade(trade)) {
        markers.push({
          id: `${trade.id}-exit`,
          agent,
          trade,
          phase: "exit",
          time: tradeCloseTime(trade, chartAnchorTime) ?? chartAnchorTime,
          price: trade.exitPrice,
        });
      }

      return markers;
    })
  );
}

export function markerPosition(args: {
  time: number;
  price: number;
  startTime: number;
  endTime: number;
  minPrice: number;
  maxPrice: number;
}): MarkerPosition {
  const { time, price, startTime, endTime, minPrice, maxPrice } = args;
  const x = ((time - startTime) / Math.max(endTime - startTime, 1)) * 100;
  const y = ((maxPrice - price) / Math.max(maxPrice - minPrice, 1)) * 100;

  return {
    left: `${Math.min(97, Math.max(3, x))}%`,
    top: `${Math.min(90, Math.max(10, y))}%`,
  };
}

export function tradeExitPoint(
  trade: AgentTrade,
  chartAnchorTime: number
): { time: number; price: number } | null {
  if (!isClosedTrade(trade)) {
    return null;
  }

  return {
    time: tradeCloseTime(trade, chartAnchorTime) ?? chartAnchorTime,
    price: trade.exitPrice,
  };
}

export function focusedTradeDots(
  focusedTrade: TradeWithAgent,
  entryPosition: MarkerPosition,
  exitPosition: MarkerPosition | null
): FocusedTradeDot[] {
  return [
    {
      id: `${focusedTrade.trade.id}-entry`,
      position: entryPosition,
      phase: "entry",
    },
    ...(exitPosition
      ? [
          {
            id: `${focusedTrade.trade.id}-exit`,
            position: exitPosition,
            phase: "exit" as const,
          },
        ]
      : []),
  ];
}

export function buildReplayProjection({
  agents,
  game,
  activeAgentId,
  allAgentsId,
  activeTradeId,
  marketView,
  selectedWindow,
  candles,
}: {
  agents: ArenaAgent[];
  game: ArenaGameSummary | null;
  activeAgentId: string;
  allAgentsId: string;
  activeTradeId: string;
  marketView: MarketView;
  selectedWindow: ChartWindow;
  candles: CandlePoint[];
}): ReplayProjection {
  const selectedAgents =
    activeAgentId === allAgentsId
      ? agents
      : agents.filter((agent) => agent.id === activeAgentId);
  const selectedTradeRows = selectedAgents.flatMap((agent) =>
    agent.trades.map((trade) => ({ agent, trade }))
  );
  const allTradeRows = agents.flatMap((agent) =>
    agent.trades.map((trade) => ({ agent, trade }))
  );
  const focusedTrade =
    selectedTradeRows.find(({ trade }) => trade.id === activeTradeId) ??
    allTradeRows.find(({ trade }) => trade.id === activeTradeId) ??
    selectedTradeRows[0] ??
    null;
  const replayMarkers = buildReplayMarkers(
    selectedAgents,
    marketView.chartAnchorTime
  );
  const replayStart = marketView.chartAnchorTime - selectedWindow.secs;
  const replayEnd = marketView.chartAnchorTime;
  const candlesInView = visibleCandles(candles, replayStart, replayEnd);
  const visibleReplayMarkers = replayMarkers.filter(
    (marker) => marker.time >= replayStart && marker.time <= replayEnd
  );
  const markerPrices = visibleReplayMarkers.map((marker) => ({
    time: marker.time,
    open: marker.price,
    high: marker.price,
    low: marker.price,
    close: marker.price,
  }));
  const replayPriceRange = candleRangeForOverlay(
    [...candlesInView, ...markerPrices],
    marketView.latestPrice
  );
  const livelineReference =
    focusedTrade && activeAgentId !== allAgentsId
      ? {
          value: focusedTrade.trade.entryPrice,
          label: `${focusedTrade.trade.side.toUpperCase()} ${formatUsd(
            focusedTrade.trade.notionalUsd
          )}`,
        }
      : undefined;

  return {
    agents,
    game,
    selectedAgents,
    selectedTradeRows,
    allTradeRows,
    focusedTrade,
    replayMarkers,
    visibleReplayMarkers,
    replayStart,
    replayEnd,
    minReplayPrice: replayPriceRange.min,
    maxReplayPrice: replayPriceRange.max,
    livelineReference,
  };
}
