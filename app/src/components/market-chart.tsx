import {
  AlertCircle,
  CandlestickChart,
  LineChart,
  RefreshCcw,
  Timer,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Liveline } from "liveline";
import type { CandlePoint, HoverPoint } from "liveline";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePythChart } from "@/hooks/use-pyth-chart";
import { AGENTS, DEVNET_GAME } from "@/lib/agent-game";
import type {
  AgentTrade,
  ArenaAgent,
  ArenaGameSummary,
  LiveArenaSnapshot,
} from "@/lib/agent-game";
import {
  CHART_WINDOWS,
  candlesToLineData,
  formatAxisUsd,
  formatChartTimestamp,
  formatPriceDelta,
  formatUsd,
  splitLiveCandle,
} from "@/lib/market";

const MARKET_SYMBOL = "Crypto.BTC/USD";
const MARKET_LABEL = "BTC / USD";
const CHART_COLOR = "#e6eadb";
const ALL_AGENTS = "all";
const DEFAULT_TRADE_ID = "alpha-1";
const CHART_PLOT_INSET = {
  top: 57,
  right: 82,
  bottom: 72,
  left: 22,
};

type ActiveAgentId = typeof ALL_AGENTS | ArenaAgent["id"];

type ReplayMarker = {
  id: string;
  agent: ArenaAgent;
  trade: AgentTrade;
  phase: "entry" | "exit";
  time: number;
  price: number;
};

type TradeWithAgent = {
  agent: ArenaAgent;
  trade: AgentTrade;
};

function formatSignedUsd(value: number): string {
  const absolute = formatUsd(Math.abs(value));
  return value >= 0 ? `+${absolute}` : `-${absolute}`;
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

function formatGameClock(
  game: ArenaGameSummary,
  snapshotUpdatedAt: number | undefined,
  nowMs: number
): string {
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

function isLiveArenaSnapshot(value: unknown): value is LiveArenaSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<LiveArenaSnapshot>;
  return (
    typeof snapshot.updatedAt === "number" &&
    !!snapshot.game &&
    Array.isArray(snapshot.agents)
  );
}

function visibleCandles(candles: CandlePoint[], start: number, end: number) {
  return candles.filter((candle) => candle.time >= start && candle.time <= end);
}

function candleRangeForOverlay(candles: CandlePoint[], fallbackPrice: number) {
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

function buildReplayMarkers(
  agents: ArenaAgent[],
  chartAnchorTime: number
): ReplayMarker[] {
  const replayAnchor = chartAnchorTime - 90;

  return agents.flatMap((agent) =>
    agent.trades.flatMap((trade) => [
      {
        id: `${trade.id}-entry`,
        agent,
        trade,
        phase: "entry" as const,
        time: replayAnchor + trade.openOffsetSeconds,
        price: trade.entryPrice,
      },
      {
        id: `${trade.id}-exit`,
        agent,
        trade,
        phase: "exit" as const,
        time: replayAnchor + trade.closeOffsetSeconds,
        price: trade.exitPrice,
      },
    ])
  );
}

function markerPosition(args: {
  time: number;
  price: number;
  startTime: number;
  endTime: number;
  minPrice: number;
  maxPrice: number;
}) {
  const { time, price, startTime, endTime, minPrice, maxPrice } = args;
  const x = ((time - startTime) / Math.max(endTime - startTime, 1)) * 100;
  const y = ((maxPrice - price) / Math.max(maxPrice - minPrice, 1)) * 100;

  return {
    left: `${Math.min(97, Math.max(3, x))}%`,
    top: `${Math.min(90, Math.max(10, y))}%`,
  };
}

function TradeExecutionOverlay({
  markers,
  focusedTrade,
  chartAnchorTime,
  startTime,
  endTime,
  minPrice,
  maxPrice,
}: {
  markers: ReplayMarker[];
  focusedTrade: TradeWithAgent | null;
  chartAnchorTime: number;
  startTime: number;
  endTime: number;
  minPrice: number;
  maxPrice: number;
}) {
  const replayAnchor = chartAnchorTime - 90;
  const focusedEntry = focusedTrade
    ? {
        time: replayAnchor + focusedTrade.trade.openOffsetSeconds,
        price: focusedTrade.trade.entryPrice,
      }
    : null;
  const focusedExit = focusedTrade
    ? {
        time: replayAnchor + focusedTrade.trade.closeOffsetSeconds,
        price: focusedTrade.trade.exitPrice,
      }
    : null;
  const focusedMarkerIds = focusedTrade
    ? new Set([
        `${focusedTrade.trade.id}-entry`,
        `${focusedTrade.trade.id}-exit`,
      ])
    : new Set<string>();
  const entryPosition =
    focusedEntry &&
    markerPosition({
      time: focusedEntry.time,
      price: focusedEntry.price,
      startTime,
      endTime,
      minPrice,
      maxPrice,
    });
  const exitPosition =
    focusedExit &&
    markerPosition({
      time: focusedExit.time,
      price: focusedExit.price,
      startTime,
      endTime,
      minPrice,
      maxPrice,
    });

  return (
    <div
      aria-label="Agent trade replay markers"
      className="pointer-events-none absolute inset-0 z-10"
    >
      <div className="absolute" style={CHART_PLOT_INSET}>
        {markers
          .filter((marker) => !focusedMarkerIds.has(marker.id))
          .map((marker) => {
            const isEntry = marker.phase === "entry";
            const position = markerPosition({
              time: marker.time,
              price: marker.price,
              startTime,
              endTime,
              minPrice,
              maxPrice,
            });

            return (
              <div
                key={marker.id}
                className="marker-group pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
                style={position}
              >
                <span
                  className={`block size-2.5 rounded-full border border-background ${
                    isEntry ? "bg-primary" : "bg-[#d98585]"
                  }`}
                  style={{
                    backgroundColor: isEntry ? marker.agent.color : undefined,
                  }}
                />
                <span className="marker-callout absolute left-1/2 top-full mt-1 whitespace-nowrap rounded border border-border/70 bg-background/95 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                  {marker.agent.name} {formatUsd(marker.price)}
                </span>
              </div>
            );
          })}

        {focusedTrade && entryPosition && exitPosition ? (
          <>
            <svg className="absolute inset-0 h-full w-full overflow-visible">
              <line
                stroke={focusedTrade.agent.color}
                strokeDasharray="4 3"
                strokeLinecap="round"
                strokeWidth="1.5"
                x1={entryPosition.left}
                x2={exitPosition.left}
                y1={entryPosition.top}
                y2={exitPosition.top}
              />
            </svg>

            {[
              {
                label: "Entry",
                price: focusedTrade.trade.entryPrice,
                position: entryPosition,
                entry: true,
              },
              {
                label: "Exit",
                price: focusedTrade.trade.exitPrice,
                position: exitPosition,
                entry: false,
              },
            ].map((marker) => (
              <div
                key={marker.label}
                className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: marker.position.left, top: marker.position.top }}
              >
                <span
                  className={`block size-3 rounded-full border-2 border-background ${
                    marker.entry ? "bg-primary" : "bg-[#d98585]"
                  }`}
                  style={{
                    backgroundColor: marker.entry
                      ? focusedTrade.agent.color
                      : undefined,
                  }}
                />
              </div>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

function AgentSidebar({
  activeAgentId,
  agents,
  focusedTrade,
  tradeRows,
  onSelectAgent,
  onSelectTrade,
}: {
  activeAgentId: ActiveAgentId;
  agents: ArenaAgent[];
  focusedTrade: TradeWithAgent | null;
  tradeRows: TradeWithAgent[];
  onSelectAgent: (id: ActiveAgentId) => void;
  onSelectTrade: (agent: ArenaAgent, trade: AgentTrade) => void;
}) {
  const liveCount = agents.filter((agent) => agent.trades.length > 0).length;
  const compactTradeRows = focusedTrade
    ? [
        focusedTrade,
        ...tradeRows.filter(({ trade }) => trade.id !== focusedTrade.trade.id),
      ].slice(0, 6)
    : tradeRows.slice(0, 6);

  return (
    <aside className="flex min-h-0 flex-col border-t border-border/70 bg-card lg:h-full lg:min-h-[420px] lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2.5">
        <span className="text-sm font-semibold">Agents</span>
        <span className="font-mono text-xs text-muted-foreground">
          {liveCount}/{agents.length} live
        </span>
      </div>

      <div className="grid content-start gap-px px-1.5 py-1.5">
        <button
          aria-pressed={activeAgentId === ALL_AGENTS}
          className={`selectable-row flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:outline-none ${
            activeAgentId === ALL_AGENTS ? "bg-muted/60" : ""
          }`}
          onClick={() => onSelectAgent(ALL_AGENTS)}
          type="button"
        >
          <span className="flex items-center gap-2">
            <Users aria-hidden="true" className="size-3 text-muted-foreground" />
            <span className="text-sm">All</span>
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {tradeRows.length} trades
          </span>
        </button>

        {agents.map((agent) => {
          const isPositive = agent.realizedPnlUsd >= 0;
          const isSelected = agent.id === activeAgentId;

          return (
            <button
              key={agent.id}
              aria-pressed={isSelected}
              className={`selectable-row flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:outline-none ${
                isSelected ? "bg-muted/60" : ""
              }`}
              onClick={() => onSelectAgent(agent.id)}
              type="button"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: agent.color }}
                />
                <span className="truncate text-sm">{agent.name}</span>
              </span>
              <span
                className={`font-mono text-xs ${
                  isPositive ? "text-[#9ad48c]" : "text-[#d98585]"
                }`}
              >
                {formatSignedUsd(agent.realizedPnlUsd)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 border-t border-border/70 px-1.5 py-1.5">
        <p className="mb-1 px-2 text-xs text-muted-foreground">Trades</p>
        <div className="grid gap-px overflow-auto">
          {compactTradeRows.map(({ agent, trade }) => {
            const isActive = focusedTrade?.trade.id === trade.id;
            const isPositive = trade.pnlUsd >= 0;

            return (
              <button
                key={trade.id}
                aria-pressed={isActive}
                className={`selectable-row flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:outline-none ${
                  isActive ? "bg-muted/60" : ""
                }`}
                onClick={() => onSelectTrade(agent, trade)}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: agent.color }}
                  />
                  <span className="truncate text-xs">
                    {agent.name} · {trade.side}
                  </span>
                </span>
                <span
                  className={`font-mono text-xs ${
                    isPositive ? "text-[#9ad48c]" : "text-[#d98585]"
                  }`}
                >
                  {formatSignedUsd(trade.pnlUsd)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function ChartLoadingState() {
  return (
    <section className="mx-auto flex min-h-0 w-full flex-1">
      <Card
        aria-busy="true"
        aria-label="Loading market chart"
        className="min-h-0 w-full rounded-md border border-border/70 bg-card py-0 shadow-lg lg:h-full"
      >
        <CardHeader className="border-b border-border/70 px-3 py-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <Skeleton className="h-7 w-32 bg-muted/55" />
              <Skeleton className="h-4 w-12 bg-muted/35" />
              <Skeleton className="h-3 w-16 bg-muted/25" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-16 rounded-md bg-muted/35" />
              <Skeleton className="size-7 rounded bg-muted/25" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 p-0">
          <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-h-0 p-2">
              <div className="relative h-[400px] w-full overflow-hidden rounded-md border border-border/70 bg-background lg:h-full">
                <div className="absolute right-3 top-3 z-10">
                  <Skeleton className="h-7 w-24 rounded bg-muted/35" />
                </div>
                <div className="absolute inset-4 top-14">
                  <svg
                    aria-hidden="true"
                    className="h-full w-full text-primary/20"
                    preserveAspectRatio="none"
                    viewBox="0 0 100 100"
                  >
                    <path
                      d="M0 66 C 10 62, 16 70, 24 54 S 39 48, 47 45 S 59 25, 68 33 S 82 50, 100 38"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="1"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <aside className="flex min-h-[420px] flex-col border-t border-border/70 bg-card lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2.5">
                <Skeleton className="h-4 w-14 bg-muted/55" />
                <Skeleton className="h-3 w-10 bg-muted/35" />
              </div>
              <div className="grid gap-1 p-1.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-7 w-full bg-muted/25" />
                ))}
              </div>
            </aside>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function MarketChart() {
  const [hoverPoint, setHoverPoint] = useState<HoverPoint | null>(null);
  const [displayMode, setDisplayMode] = useState<"line" | "candle">("candle");
  const [activeAgentId, setActiveAgentId] = useState<ActiveAgentId>("alpha");
  const [activeTradeId, setActiveTradeId] = useState(DEFAULT_TRADE_ID);
  const [fallbackNow] = useState(() => Math.floor(Date.now() / 1000));
  const [liveArena, setLiveArena] = useState<LiveArenaSnapshot | null>(null);
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const {
    candles,
    error,
    retry,
    selectedWindow,
    setSelectedWindow,
    status,
  } = usePythChart({
    symbol: MARKET_SYMBOL,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadLiveArena() {
      try {
        const response = await fetch(`/live-arena.json?ts=${Date.now()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          if (!cancelled) {
            setLiveArena(null);
          }
          return;
        }

        const payload = (await response.json()) as unknown;
        if (!cancelled) {
          setLiveArena((current) => {
            if (!isLiveArenaSnapshot(payload)) {
              return null;
            }

            return current?.updatedAt === payload.updatedAt ? current : payload;
          });
        }
      } catch {
        if (!cancelled) {
          setLiveArena(null);
        }
      }
    }

    void loadLiveArena();
    const intervalId = window.setInterval(loadLiveArena, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setClockNowMs(Date.now()),
      1000
    );

    return () => window.clearInterval(intervalId);
  }, []);

  const { committed, liveCandle } = splitLiveCandle(
    candles,
    selectedWindow.candleWidth
  );
  const lineData = candlesToLineData(committed, liveCandle);
  const latestPrice = liveCandle?.close ?? committed.at(-1)?.close ?? 0;
  const openingPrice = committed.at(0)?.open ?? liveCandle?.open ?? latestPrice;
  const priceDelta = formatPriceDelta(latestPrice, openingPrice);
  const priceDeltaPositive = latestPrice >= openingPrice;
  const hoverValue = hoverPoint?.value ?? latestPrice;
  const chartAnchorTime =
    liveCandle?.time ?? committed.at(-1)?.time ?? fallbackNow;
  const agents = liveArena?.agents.length ? liveArena.agents : AGENTS;
  const game = liveArena?.game ?? DEVNET_GAME;
  const selectedAgents =
    activeAgentId === ALL_AGENTS
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
  const replayMarkers = buildReplayMarkers(selectedAgents, chartAnchorTime);
  const replayStart = chartAnchorTime - selectedWindow.secs;
  const replayEnd = chartAnchorTime;
  const candlesInView = visibleCandles(candles, replayStart, replayEnd);
  const replayPriceRange = candleRangeForOverlay(candlesInView, latestPrice);
  const minReplayPrice = replayPriceRange.min;
  const maxReplayPrice = replayPriceRange.max;
  const gameClockLabel = formatGameClock(
    game,
    liveArena?.updatedAt,
    clockNowMs
  );
  const livelineReference =
    focusedTrade && activeAgentId !== ALL_AGENTS
      ? {
          value: focusedTrade.trade.entryPrice,
          label: `${focusedTrade.trade.side.toUpperCase()} ${formatUsd(
            focusedTrade.trade.notionalUsd
          )}`,
        }
      : undefined;

  if (status === "loading" && candles.length === 0) {
    return <ChartLoadingState />;
  }

  if (status === "error" && candles.length === 0) {
    return (
      <Card className="rounded-[4px] border border-border/80 bg-card py-0 shadow-none">
        <CardHeader className="border-b border-border/80 py-6">
          <CardTitle className="flex items-center gap-2 text-2xl">
            <AlertCircle
              aria-hidden="true"
              className="size-5 text-destructive"
            />
            Couldn&apos;t load the chart
          </CardTitle>
          <CardDescription>
            {error ?? "Pyth did not return price history for this feed."}
          </CardDescription>
        </CardHeader>
        <CardContent className="py-6">
          <Button onClick={retry}>
            <RefreshCcw aria-hidden="true" data-icon="inline-start" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === "empty") {
    return (
      <Card className="rounded-[4px] border border-border/80 bg-card py-0 shadow-none">
        <CardHeader className="border-b border-border/80 py-6">
          <CardTitle className="text-2xl">No chart data yet</CardTitle>
          <CardDescription>
            Pyth returned an empty history window for {MARKET_LABEL}. Retry in a
            moment.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-6">
          <Button onClick={retry} variant="secondary">
            <RefreshCcw aria-hidden="true" data-icon="inline-start" />
            Refresh feed
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="mx-auto flex w-full lg:min-h-0 lg:flex-1">
      <Card className="min-h-0 w-full rounded-md border border-border/70 bg-card py-0 shadow-lg lg:h-full">
        <CardHeader className="border-b border-border/70 px-3 py-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <CardTitle className="font-mono text-2xl font-semibold leading-none">
                {formatUsd(hoverValue)}
              </CardTitle>
              <span
                className={`text-sm font-medium ${
                  priceDeltaPositive ? "text-[#9ad48c]" : "text-[#d98585]"
                }`}
              >
                {priceDelta}
              </span>
              <span className="text-xs text-muted-foreground">{MARKET_LABEL}</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 rounded-md border border-border/70 bg-background/50 px-2 py-1 font-mono text-xs text-muted-foreground">
                <Timer aria-hidden="true" className="size-3 text-primary" />
                {gameClockLabel}
              </span>
              <Button
                aria-label="Refresh chart data"
                onClick={retry}
                size="icon-sm"
                variant="ghost"
              >
                <RefreshCcw aria-hidden="true" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 p-0 lg:flex-1">
          <div className="grid min-h-0 lg:h-full lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-h-0 p-2">
              <div className="relative h-[430px] min-h-[360px] w-full overflow-hidden rounded-[4px] border border-border/65 bg-background shadow-[inset_0_0_0_1px_rgb(255_255_255/0.012)] sm:h-[500px] lg:h-full">
                <div className="flex h-full flex-col lg:block lg:pt-3">
                  <div className="relative z-20 flex flex-wrap items-center justify-end gap-2 px-3 pt-3 lg:absolute lg:right-3 lg:top-3 lg:px-0 lg:pt-0">
                    <div className="inline-flex rounded-[4px] border border-border/65 bg-background/80 p-0.5 shadow-[0_10px_30px_rgb(0_0_0/0.22)] backdrop-blur">
                      {CHART_WINDOWS.map((chartWindow) => (
                        <button
                          key={chartWindow.secs}
                          className={`chart-control rounded-[3px] px-2.5 py-1 text-[11px] font-medium focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:outline-none ${
                            selectedWindow.secs === chartWindow.secs
                              ? "bg-muted text-foreground"
                              : "text-muted-foreground"
                          }`}
                          onClick={() => setSelectedWindow(chartWindow)}
                          type="button"
                        >
                          {chartWindow.label}
                        </button>
                      ))}
                    </div>
                    <div className="inline-flex rounded-[4px] border border-border/65 bg-background/80 p-0.5 shadow-[0_10px_30px_rgb(0_0_0/0.22)] backdrop-blur">
                      <button
                        aria-label="Show line chart"
                        className={`chart-control flex size-7 items-center justify-center rounded-[3px] focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:outline-none ${
                          displayMode === "line"
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground"
                        }`}
                        onClick={() => setDisplayMode("line")}
                        type="button"
                      >
                        <LineChart aria-hidden="true" className="size-3.5" />
                      </button>
                      <button
                        aria-label="Show candlestick chart"
                        className={`chart-control flex size-7 items-center justify-center rounded-[3px] focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:outline-none ${
                          displayMode === "candle"
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground"
                        }`}
                        onClick={() => setDisplayMode("candle")}
                        type="button"
                      >
                        <CandlestickChart
                          aria-hidden="true"
                          className="size-3.5"
                        />
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 lg:h-full">
                    <Liveline
                      badge={false}
                      badgeVariant="minimal"
                      candleWidth={selectedWindow.candleWidth}
                      candles={committed}
                      color={CHART_COLOR}
                      data={lineData}
                      emptyText="Waiting for Pyth candles"
                      fill={false}
                      formatTime={formatChartTimestamp}
                      formatValue={formatAxisUsd}
                      grid
                      lineData={lineData}
                      lineMode={displayMode === "line"}
                      lineValue={latestPrice}
                      liveCandle={liveCandle ?? undefined}
                      mode="candle"
                      momentum
                      onHover={setHoverPoint}
                      padding={{ top: 44, right: 82, bottom: 72, left: 22 }}
                      pulse
                      referenceLine={livelineReference}
                      scrub
                      showValue={false}
                      style={{ height: "100%" }}
                      theme="dark"
                      tooltipY={18}
                      value={latestPrice}
                      window={selectedWindow.secs}
                    />
                  </div>
                </div>
                <TradeExecutionOverlay
                  chartAnchorTime={chartAnchorTime}
                  endTime={replayEnd}
                  focusedTrade={focusedTrade}
                  markers={replayMarkers}
                  maxPrice={maxReplayPrice}
                  minPrice={minReplayPrice}
                  startTime={replayStart}
                />
              </div>

              {status === "error" && candles.length > 0 ? (
                <div className="mt-2 flex items-start gap-3 rounded-[4px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
                  <AlertCircle
                    aria-hidden="true"
                    className="mt-0.5 size-4 text-destructive"
                  />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">
                      Live refresh slipped.
                    </p>
                    <p className="text-muted-foreground">
                      {error ??
                        "The chart is still showing the last successful snapshot."}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <AgentSidebar
              activeAgentId={activeAgentId}
              agents={agents}
              focusedTrade={focusedTrade}
              tradeRows={selectedTradeRows}
              onSelectAgent={(id) => {
                setActiveAgentId(id);
                const nextAgent =
                  id === ALL_AGENTS
                    ? agents[0]
                    : agents.find((agent) => agent.id === id);
                setActiveTradeId(nextAgent?.trades[0]?.id ?? DEFAULT_TRADE_ID);
              }}
              onSelectTrade={(agent, trade) => {
                setActiveAgentId(agent.id);
                setActiveTradeId(trade.id);
              }}
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
