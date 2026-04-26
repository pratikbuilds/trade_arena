import {
  AlertCircle,
  Bot,
  CircleDollarSign,
  Dot,
  ExternalLink,
  RefreshCcw,
  Trophy,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Liveline } from "liveline";
import type { CandlePoint, HoverPoint } from "liveline";

import { Badge } from "@/components/ui/badge";
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
import { AGENTS, DEVNET_GAME, devnetTxUrl, explorerTxUrl } from "@/lib/agent-game";
import type { AgentTrade, ArenaAgent } from "@/lib/agent-game";
import {
  CHART_WINDOWS,
  candlesToLineData,
  formatAxisUsd,
  formatChartTimestamp,
  formatPriceDelta,
  formatTimestamp,
  formatUsd,
  splitLiveCandle,
} from "@/lib/market";
import { cn } from "@/lib/utils";

const MARKET_SYMBOL = "Crypto.BTC/USD";
const MARKET_LABEL = "BTC / USD";
const CHART_COLOR = "#4f46e5";
const ALL_AGENTS = "all";
const DEFAULT_TRADE_ID = "alpha-1";

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

function formatSignedUsd(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatUsd(Math.abs(value))}`;
}

function shortKey(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function visibleCandles(candles: CandlePoint[], start: number, end: number) {
  return candles.filter((candle) => candle.time >= start && candle.time <= end);
}

function buildReplayMarkers(agents: ArenaAgent[], latestTime: number): ReplayMarker[] {
  const replayAnchor = latestTime - 90;

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
    ]),
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
    left: `${Math.min(96, Math.max(4, x))}%`,
    top: `${Math.min(88, Math.max(8, y))}%`,
  };
}

function TradeReplayOverlay({
  markers,
  focusedTrade,
  latestTime,
  startTime,
  endTime,
  minPrice,
  maxPrice,
}: {
  markers: ReplayMarker[];
  focusedTrade: TradeWithAgent | null;
  latestTime: number;
  startTime: number;
  endTime: number;
  minPrice: number;
  maxPrice: number;
}) {
  const replayAnchor = latestTime - 90;
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
    ? new Set([`${focusedTrade.trade.id}-entry`, `${focusedTrade.trade.id}-exit`])
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
    <div aria-label="Agent trade replay markers" className="pointer-events-none absolute inset-0">
      {markers
        .filter((marker) => !focusedMarkerIds.has(marker.id))
        .map((marker) => {
          const position = markerPosition({
            time: marker.time,
            price: marker.price,
            startTime,
            endTime,
            minPrice,
            maxPrice,
          });
        const isEntry = marker.phase === "entry";

        return (
          <div
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            key={marker.id}
            style={position}
          >
            <div
              className="flex size-3.5 items-center justify-center rounded-full border-2 bg-card shadow-sm"
              style={{
                backgroundColor: isEntry ? marker.agent.color : undefined,
                borderColor: marker.agent.color,
              }}
              title={`${marker.agent.name} ${isEntry ? "entry" : "exit"} ${formatUsd(marker.price)}`}
            />
          </div>
        );
        })}

      {focusedTrade && entryPosition && exitPosition ? (
        <>
          <svg className="absolute inset-0 z-10 h-full w-full overflow-visible">
            <line
              stroke={focusedTrade.agent.color}
              strokeDasharray="7 6"
              strokeLinecap="round"
              strokeWidth="2"
              x1="7%"
              x2="93%"
              y1={entryPosition.top}
              y2={entryPosition.top}
            />
            <line
              stroke={focusedTrade.trade.pnlUsd >= 0 ? "#16a34a" : "#dc2626"}
              strokeDasharray="3 5"
              strokeLinecap="round"
              strokeWidth="2"
              x1="7%"
              x2="93%"
              y1={exitPosition.top}
              y2={exitPosition.top}
            />
            <line
              stroke={focusedTrade.agent.color}
              strokeLinecap="round"
              strokeWidth="3"
              x1={entryPosition.left}
              x2={exitPosition.left}
              y1={entryPosition.top}
              y2={exitPosition.top}
            />
          </svg>

          <div
            className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
            style={{ left: entryPosition.left, top: entryPosition.top }}
          >
            <div
              className="rounded-full border-2 bg-card px-2.5 py-1 text-[11px] font-semibold shadow-sm"
              style={{ borderColor: focusedTrade.agent.color }}
            >
              IN {formatUsd(focusedTrade.trade.entryPrice)}
            </div>
          </div>
          <div
            className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
            style={{ left: exitPosition.left, top: exitPosition.top }}
          >
            <div
              className={cn(
                "rounded-full border-2 bg-card px-2.5 py-1 text-[11px] font-semibold shadow-sm",
                focusedTrade.trade.pnlUsd >= 0 ? "text-secondary-foreground" : "text-destructive",
              )}
              style={{ borderColor: focusedTrade.trade.pnlUsd >= 0 ? "#16a34a" : "#dc2626" }}
            >
              OUT {formatUsd(focusedTrade.trade.exitPrice)}
            </div>
          </div>

          <div
            className="absolute left-3 z-30 -translate-y-1/2 rounded-lg border bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur"
            style={{ top: entryPosition.top }}
          >
            <p className="font-semibold" style={{ color: focusedTrade.agent.color }}>
              Entry {formatUsd(focusedTrade.trade.entryPrice)}
            </p>
            <p className="text-muted-foreground">
              {focusedTrade.trade.side.toUpperCase()} {formatUsd(focusedTrade.trade.notionalUsd)} ·{" "}
              {focusedTrade.trade.sizeBtc.toFixed(6)} BTC
            </p>
          </div>

          <div
            className="absolute right-3 z-30 -translate-y-1/2 rounded-lg border bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur"
            style={{ top: exitPosition.top }}
          >
            <p
              className={cn(
                "font-semibold",
                focusedTrade.trade.pnlUsd >= 0 ? "text-secondary-foreground" : "text-destructive",
              )}
            >
              Exit {formatUsd(focusedTrade.trade.exitPrice)}
            </p>
            <p className="text-muted-foreground">PnL {formatSignedUsd(focusedTrade.trade.pnlUsd)}</p>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ActiveTradeSummary({
  focusedTrade,
  onClear,
}: {
  focusedTrade: TradeWithAgent | null;
  onClear: () => void;
}) {
  if (!focusedTrade) return null;

  const { agent, trade } = focusedTrade;
  const positive = trade.pnlUsd >= 0;

  return (
    <div className="rounded-xl border border-border/70 bg-muted/[0.28] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span className="size-2 rounded-full" style={{ backgroundColor: agent.color }} />
            {agent.name} · Cycle {trade.cycle} {trade.side.toUpperCase()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{agent.thesis}</p>
        </div>
        <Button onClick={onClear} size="xs" variant="outline">
          All
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <span className="rounded-lg bg-muted/45 px-2.5 py-2">
          <span className="block text-[11px] text-muted-foreground">Amount</span>
          <span className="font-mono text-xs font-semibold">{formatUsd(trade.notionalUsd)}</span>
        </span>
        <span className="rounded-lg bg-muted/45 px-2.5 py-2">
          <span className="block text-[11px] text-muted-foreground">Entry</span>
          <span className="font-mono text-xs font-semibold">{formatUsd(trade.entryPrice)}</span>
        </span>
        <span className="rounded-lg bg-muted/45 px-2.5 py-2">
          <span className="block text-[11px] text-muted-foreground">Exit</span>
          <span className="font-mono text-xs font-semibold">{formatUsd(trade.exitPrice)}</span>
        </span>
        <span className="rounded-lg bg-muted/45 px-2.5 py-2">
          <span className="block text-[11px] text-muted-foreground">PnL</span>
          <span className={cn("font-mono text-xs font-semibold", positive ? "text-secondary-foreground" : "text-destructive")}>
            {formatSignedUsd(trade.pnlUsd)}
          </span>
        </span>
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  active,
  onClick,
}: {
  agent: ArenaAgent;
  active: boolean;
  onClick: () => void;
}) {
  const won = agent.id === "alpha";
  const pnlPositive = agent.realizedPnlUsd >= 0;

  return (
    <button
      aria-pressed={active}
      className={cn(
        "w-full rounded-xl border bg-card p-3 text-left transition hover:border-primary/45 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
        active ? "border-primary/70 ring-2 ring-primary/15" : "border-border/70",
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: agent.color }}
          >
            <Bot aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{agent.name}</span>
              {won ? (
                <Badge className="bg-secondary text-secondary-foreground" variant="secondary">
                  <Trophy aria-hidden="true" className="size-3" />
                  Winner
                </Badge>
              ) : null}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">{agent.handle}</span>
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <span className="rounded-lg border border-border/60 bg-muted/35 px-2.5 py-2">
          <span className="block text-[11px] text-muted-foreground">Virtual cash</span>
          <span className="font-mono text-sm font-semibold">{formatUsd(agent.virtualCashUsd)}</span>
        </span>
        <span className="rounded-lg border border-border/60 bg-muted/35 px-2.5 py-2">
          <span className="block text-[11px] text-muted-foreground">Realized PnL</span>
          <span
            className={cn(
              "font-mono text-sm font-semibold",
              pnlPositive ? "text-secondary-foreground" : "text-destructive",
            )}
          >
            {formatSignedUsd(agent.realizedPnlUsd)}
          </span>
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{agent.trades.length} round trips</span>
        <span>{shortKey(agent.player)}</span>
      </div>
    </button>
  );
}

function TradeRow({
  agent,
  trade,
  active,
  onSelect,
}: {
  agent: ArenaAgent;
  trade: AgentTrade;
  active: boolean;
  onSelect: () => void;
}) {
  const positive = trade.pnlUsd >= 0;

  return (
    <button
      aria-pressed={active}
      className={cn(
        "grid gap-2 rounded-lg border bg-background/65 p-3 text-left transition hover:border-primary/50 hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
        active ? "border-primary/70 ring-2 ring-primary/15" : "border-border/60",
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: agent.color }} />
          <span className="text-sm font-medium">{agent.name}</span>
          <Badge variant={trade.side === "long" ? "outline" : "secondary"}>{trade.side}</Badge>
        </div>
        <span className={cn("font-mono text-xs font-semibold", positive ? "text-secondary-foreground" : "text-destructive")}>
          {formatSignedUsd(trade.pnlUsd)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <span>Entry {formatUsd(trade.entryPrice)}</span>
        <span>Exit {formatUsd(trade.exitPrice)}</span>
        <span>Notional {formatUsd(trade.notionalUsd)}</span>
        <span>Size {trade.sizeBtc.toFixed(6)} BTC</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <a
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
          href={explorerTxUrl(trade.openTx)}
          rel="noreferrer"
          target="_blank"
        >
          Entry tx
          <ExternalLink aria-hidden="true" className="size-3" />
        </a>
        <a
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
          href={explorerTxUrl(trade.closeTx)}
          rel="noreferrer"
          target="_blank"
        >
          Exit tx
          <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      </div>
    </button>
  );
}

function ChartLoadingState() {
  return (
    <Card className="border border-border/70 bg-card py-0 shadow-none">
      <CardContent className="grid gap-4 py-4">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-[520px] rounded-[28px]" />
        <Skeleton className="h-10 rounded-xl" />
      </CardContent>
    </Card>
  );
}

export function MarketChart() {
  const [hoverPoint, setHoverPoint] = useState<HoverPoint | null>(null);
  const [displayMode, setDisplayMode] = useState<"line" | "candle">("candle");
  const [activeAgentId, setActiveAgentId] = useState<ActiveAgentId>(ALL_AGENTS);
  const [activeTradeId, setActiveTradeId] = useState(DEFAULT_TRADE_ID);
  const [fallbackNow] = useState(() => Math.floor(Date.now() / 1000));
  const { candles, error, lastUpdatedAt, retry, selectedWindow, setSelectedWindow, status } =
    usePythChart({
      symbol: MARKET_SYMBOL,
    });

  const { committed, liveCandle } = splitLiveCandle(candles, selectedWindow.candleWidth);
  const lineData = candlesToLineData(committed, liveCandle);
  const latestPrice = liveCandle?.close ?? committed.at(-1)?.close ?? 0;
  const openingPrice = committed.at(0)?.open ?? liveCandle?.open ?? latestPrice;
  const priceDelta = formatPriceDelta(latestPrice, openingPrice);
  const priceDeltaPositive = latestPrice >= openingPrice;
  const hoverValue = hoverPoint?.value ?? latestPrice;
  const hoverTime = hoverPoint?.time ?? liveCandle?.time ?? committed.at(-1)?.time ?? null;
  const syncLabel = lastUpdatedAt ? formatTimestamp(Math.floor(lastUpdatedAt / 1000)) : "Pending";
  const selectedAgents =
    activeAgentId === ALL_AGENTS
      ? AGENTS
      : AGENTS.filter((agent) => agent.id === activeAgentId);
  const allTradeRows = AGENTS.flatMap((agent) =>
    agent.trades.map((trade) => ({ agent, trade })),
  );
  const latestTime = hoverTime ?? liveCandle?.time ?? committed.at(-1)?.time ?? fallbackNow;
  const selectedTradeRows = selectedAgents.flatMap((agent) =>
    agent.trades.map((trade) => ({ agent, trade })),
  );
  const focusedTrade =
    selectedTradeRows.find(({ trade }) => trade.id === activeTradeId) ??
    allTradeRows.find(({ trade }) => trade.id === activeTradeId) ??
    selectedTradeRows[0] ??
    null;
  const replayMarkers = buildReplayMarkers(selectedAgents, latestTime);
  const replayStart = latestTime - selectedWindow.secs;
  const replayEnd = latestTime;
  const candlesInView = visibleCandles(candles, replayStart, replayEnd);
  const chartPrices = [
    ...candlesInView.flatMap((candle) => [candle.high, candle.low]),
    ...replayMarkers.map((marker) => marker.price),
    ...(focusedTrade ? [focusedTrade.trade.entryPrice, focusedTrade.trade.exitPrice] : []),
  ];
  const minReplayPrice = Math.min(...chartPrices, latestPrice) - 4;
  const maxReplayPrice = Math.max(...chartPrices, latestPrice) + 4;
  const allCash = AGENTS.reduce((sum, agent) => sum + agent.virtualCashUsd, 0);
  const totalPnl = AGENTS.reduce((sum, agent) => sum + agent.realizedPnlUsd, 0);
  const livelineReference =
    focusedTrade && activeAgentId !== ALL_AGENTS
      ? {
          value: focusedTrade.trade.entryPrice,
                label: `${focusedTrade.trade.side.toUpperCase()} ${formatUsd(
                  focusedTrade.trade.notionalUsd,
                )}`,
        }
      : undefined;

  if (status === "loading" && candles.length === 0) {
    return <ChartLoadingState />;
  }

  if (status === "error" && candles.length === 0) {
    return (
      <Card className="border border-border/70 bg-card py-0 shadow-none">
        <CardHeader className="border-b border-border/70 py-6">
          <CardTitle className="flex items-center gap-2 text-2xl">
            <AlertCircle aria-hidden="true" className="size-5 text-destructive" />
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
      <Card className="border border-border/70 bg-card py-0 shadow-none">
        <CardHeader className="border-b border-border/70 py-6">
          <CardTitle className="text-2xl">No chart data yet</CardTitle>
          <CardDescription>
            Pyth returned an empty history window for {MARKET_LABEL}. Retry in a moment.
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
    <section className="mx-auto grid w-full max-w-[1240px] items-start gap-4 xl:grid-cols-[minmax(0,850px)_360px]">
      <Card className="self-start border border-border/70 bg-card py-0 shadow-none lg:col-start-1">
        <CardHeader className="gap-4 border-b border-border/70 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{MARKET_LABEL}</Badge>
                <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Pyth
                </span>
                <Badge className="bg-secondary text-secondary-foreground" variant="secondary">
                  {activeAgentId === ALL_AGENTS ? "All agents" : selectedAgents[0]?.name}
                </Badge>
                <span className="flex items-center text-xs text-muted-foreground">
                  <Dot aria-hidden="true" className="-mx-1 size-5 text-primary" />
                  Sync {syncLabel}
                </span>
              </div>

              <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Last price
                  </p>
                  <div className="flex items-baseline gap-3">
                    <CardTitle className="text-4xl font-semibold tracking-tight">
                      {formatUsd(hoverValue)}
                    </CardTitle>
                    <span
                      className={
                        priceDeltaPositive ? "text-sm font-medium text-secondary" : "text-sm font-medium text-destructive"
                      }
                    >
                      {priceDelta}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span>Window {selectedWindow.label}</span>
                  <span>Interval {selectedWindow.intervalLabel}</span>
                  <span>{hoverTime ? formatTimestamp(hoverTime) : "Waiting for ticks"}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                aria-label="Show all agent trades"
                onClick={() => setActiveAgentId(ALL_AGENTS)}
                size="sm"
                variant={activeAgentId === ALL_AGENTS ? "secondary" : "outline"}
              >
                <Users aria-hidden="true" data-icon="inline-start" />
                All
              </Button>
              <Button aria-label="Refresh chart data" onClick={retry} size="icon-sm" variant="outline">
                <RefreshCcw aria-hidden="true" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4 py-4">
          <div className="rounded-[26px] border border-border/70 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_90%,white),var(--background))] p-2 sm:p-2.5">
            <div className="relative h-[340px] w-full overflow-hidden rounded-[20px] sm:h-[390px]">
              <Liveline
                badge
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
                onModeChange={setDisplayMode}
                onWindowChange={(secs) => {
                  const nextWindow = CHART_WINDOWS.find((entry) => entry.secs === secs);
                  if (nextWindow) {
                    setSelectedWindow(nextWindow);
                  }
                }}
                padding={{ top: 18, right: 64, bottom: 52, left: 10 }}
                pulse
                referenceLine={livelineReference}
                scrub
                showValue={false}
                theme="light"
                tooltipOutline
                tooltipY={18}
                value={latestPrice}
                window={selectedWindow.secs}
                windows={CHART_WINDOWS.map(({ label, secs }) => ({ label, secs }))}
                windowStyle="rounded"
              />
              <TradeReplayOverlay
                endTime={replayEnd}
                focusedTrade={focusedTrade}
                latestTime={latestTime}
                markers={replayMarkers}
                maxPrice={maxReplayPrice}
                minPrice={minReplayPrice}
                startTime={replayStart}
              />
            </div>
          </div>

          <ActiveTradeSummary
            focusedTrade={focusedTrade}
            onClear={() => setActiveAgentId(ALL_AGENTS)}
          />

          <div className="grid gap-3 rounded-[18px] border border-border/60 bg-muted/[0.32] px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/90">
              <span className="text-foreground/80">Feed {MARKET_SYMBOL}</span>
              <span>Mode {displayMode}</span>
              <span>Replay markers {replayMarkers.length}</span>
              <span className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-primary/85" />
                Proxy active
              </span>
            </div>
            <a
              className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
              href={devnetTxUrl(DEVNET_GAME.createGameTx)}
              rel="noreferrer"
              target="_blank"
            >
              Game tx
              <ExternalLink aria-hidden="true" className="size-3" />
            </a>
          </div>

          {status === "error" && candles.length > 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 text-destructive" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">Live refresh slipped.</p>
                <p className="text-muted-foreground">
                  {error ?? "The chart is still showing the last successful snapshot."}
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <aside className="grid gap-4 xl:col-start-2">
        <Card className="border border-border/70 bg-card py-0 shadow-none">
          <CardHeader className="border-b border-border/70 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CircleDollarSign aria-hidden="true" className="size-4 text-primary" />
                  Agent book
                </CardTitle>
                <CardDescription>Click an agent to isolate chart entries and exits.</CardDescription>
              </div>
              <Badge variant="outline">Game {DEVNET_GAME.id}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 py-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border/60 bg-muted/35 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Virtual cash</p>
                <p className="font-mono text-sm font-semibold">{formatUsd(allCash)}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/35 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Net PnL</p>
                <p className="font-mono text-sm font-semibold">{formatSignedUsd(totalPnl)}</p>
              </div>
            </div>

            <div className="grid gap-2">
              {AGENTS.map((agent) => (
                <AgentCard
                  active={activeAgentId === agent.id}
                  agent={agent}
                  key={agent.id}
                  onClick={() => {
                    setActiveAgentId(agent.id);
                    setActiveTradeId(agent.trades[0]?.id ?? DEFAULT_TRADE_ID);
                  }}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/70 bg-card py-0 shadow-none">
          <CardHeader className="border-b border-border/70 py-4">
            <CardTitle>Trade tape</CardTitle>
            <CardDescription>
              {activeAgentId === ALL_AGENTS ? "All session-signed MCP trades" : `${selectedAgents[0]?.name} entries and exits`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid max-h-[460px] gap-2 overflow-auto py-4 pr-2">
            {selectedTradeRows.map(({ agent, trade }) => (
              <TradeRow
                active={focusedTrade?.trade.id === trade.id}
                agent={agent}
                key={trade.id}
                onSelect={() => {
                  setActiveTradeId(trade.id);
                  setActiveAgentId(agent.id);
                }}
                trade={trade}
              />
            ))}
          </CardContent>
        </Card>
      </aside>
    </section>
  );
}
