import {
  AlertCircle,
  Bot,
  Dot,
  ExternalLink,
  Radio,
  RefreshCcw,
  Timer,
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
import {
  AGENTS,
  DEVNET_GAME,
  devnetTxUrl,
  explorerTxUrl,
} from "@/lib/agent-game";
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

const MARKET_SYMBOL = "Crypto.BTC/USD";
const MARKET_LABEL = "BTC / USD";
const CHART_COLOR = "#e6eadb";
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

function formatSignedUsd(value: number): string {
  const absolute = formatUsd(Math.abs(value));
  return value >= 0 ? `+${absolute}` : `-${absolute}`;
}

function shortKey(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function visibleCandles(candles: CandlePoint[], start: number, end: number) {
  return candles.filter((candle) => candle.time >= start && candle.time <= end);
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
    left: `${Math.min(96, Math.max(4, x))}%`,
    top: `${Math.min(88, Math.max(8, y))}%`,
  };
}

function StatPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-[#9ad48c]"
      : tone === "negative"
      ? "text-[#d98585]"
      : "text-foreground";

  return (
    <div className="min-w-0 rounded-[4px] border border-border/70 bg-background/45 px-2.5 py-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.02)]">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-0.5 truncate font-mono text-sm font-semibold ${toneClass}`}
      >
        {value}
      </p>
    </div>
  );
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
      <div className="absolute left-3 top-12 flex max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-[4px] border border-border/75 bg-background/82 px-3 py-2 text-[11px] font-medium text-muted-foreground shadow-[0_12px_40px_rgb(0_0_0/0.24)] backdrop-blur sm:left-4">
        <span className="font-semibold text-foreground">
          {focusedTrade ? focusedTrade.agent.name : "All agents"}
        </span>
        <span className="h-3 w-px bg-border" />
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" />
          Entry {markers.filter((marker) => marker.phase === "entry").length}
        </span>
        <span className="h-3 w-px bg-border" />
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#d98585]" />
          Exit {markers.filter((marker) => marker.phase === "exit").length}
        </span>
        {focusedTrade ? (
          <span
            className={`hidden font-mono sm:inline ${
              focusedTrade.trade.pnlUsd >= 0
                ? "text-[#9ad48c]"
                : "text-[#d98585]"
            }`}
          >
            {formatSignedUsd(focusedTrade.trade.pnlUsd)}
          </span>
        ) : null}
      </div>

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
              className="group pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
              style={position}
            >
              <div className="flex flex-col items-center">
                <span
                  className={`h-4 w-px ${
                    isEntry ? "bg-primary/75" : "bg-[#d98585]/75"
                  } ${isEntry ? "order-2" : "order-1"}`}
                />
                <span
                  className={`order-2 flex size-4 items-center justify-center rounded-full border-2 border-background shadow-[0_0_18px_rgb(230_234_219/0.10)] ${
                    isEntry ? "bg-primary" : "bg-[#d98585]"
                  }`}
                  style={{
                    backgroundColor: isEntry ? marker.agent.color : undefined,
                  }}
                >
                  <span className="size-1.5 rounded-full bg-background" />
                </span>
                <span
                  className={`hidden rounded-[4px] border bg-background/94 px-1.5 py-0.5 font-mono text-[10px] font-semibold shadow-sm backdrop-blur group-hover:block ${
                    isEntry
                      ? "order-3 mt-1 border-primary/25 text-primary"
                      : "order-0 mb-1 border-[#d98585]/25 text-[#d98585]"
                  }`}
                >
                  {isEntry ? "ENTRY" : "EXIT"}
                </span>
                <span className="absolute left-1/2 top-full mt-5 hidden -translate-x-1/2 whitespace-nowrap rounded-[4px] border border-border bg-background/96 px-2 py-1 font-mono text-[11px] font-semibold text-foreground shadow-md group-hover:block">
                  {marker.agent.name} {isEntry ? "entry" : "exit"}{" "}
                  {formatUsd(marker.price)}
                </span>
              </div>
            </div>
          );
        })}

      {focusedTrade && entryPosition && exitPosition ? (
        <>
          <svg className="absolute inset-0 z-[-1] h-full w-full overflow-visible">
            <line
              stroke={focusedTrade.agent.color}
              strokeDasharray="7 6"
              strokeLinecap="round"
              strokeWidth="2"
              x1={entryPosition.left}
              x2={exitPosition.left}
              y1={entryPosition.top}
              y2={exitPosition.top}
            />
          </svg>

          {[
            {
              label: "ENTRY",
              price: focusedTrade.trade.entryPrice,
              position: entryPosition,
              entry: true,
            },
            {
              label: "EXIT",
              price: focusedTrade.trade.exitPrice,
              position: exitPosition,
              entry: false,
            },
          ].map((marker) => (
            <div
              key={marker.label}
              className="group pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: marker.position.left, top: marker.position.top }}
            >
              <div className="flex flex-col items-center">
                <span
                  className={`h-4 w-px ${
                    marker.entry
                      ? "order-2 bg-primary/75"
                      : "order-1 bg-[#d98585]/75"
                  }`}
                />
                <span
                  className={`order-2 flex size-5 items-center justify-center rounded-full border-2 border-background shadow-[0_0_18px_rgb(230_234_219/0.18)] ${
                    marker.entry ? "bg-primary" : "bg-[#d98585]"
                  }`}
                  style={{
                    backgroundColor: marker.entry
                      ? focusedTrade.agent.color
                      : undefined,
                  }}
                >
                  <span className="size-2 rounded-full bg-background" />
                </span>
                <span
                  className={`rounded-[4px] border bg-background/94 px-1.5 py-0.5 font-mono text-[10px] font-semibold shadow-sm backdrop-blur ${
                    marker.entry
                      ? "order-3 mt-1 border-primary/25 text-primary"
                      : "order-0 mb-1 border-[#d98585]/25 text-[#d98585]"
                  }`}
                >
                  {marker.label}
                </span>
                <span className="absolute left-1/2 top-full mt-5 hidden -translate-x-1/2 whitespace-nowrap rounded-[4px] border border-border bg-background/96 px-2 py-1 font-mono text-[11px] font-semibold text-foreground shadow-md group-hover:block">
                  {formatUsd(marker.price)}
                </span>
              </div>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}

function AgentSidebar({
  activeAgentId,
  agents,
  latestPrice,
  selectedWindowLabel,
  focusedTrade,
  tradeRows,
  onSelectAgent,
  onSelectTrade,
}: {
  activeAgentId: ActiveAgentId;
  agents: ArenaAgent[];
  latestPrice: number;
  selectedWindowLabel: string;
  focusedTrade: TradeWithAgent | null;
  tradeRows: TradeWithAgent[];
  onSelectAgent: (id: ActiveAgentId) => void;
  onSelectTrade: (agent: ArenaAgent, trade: AgentTrade) => void;
}) {
  const liveCount = agents.filter((agent) => agent.trades.length > 0).length;
  const selectedAgent =
    focusedTrade?.agent ??
    (activeAgentId === ALL_AGENTS
      ? agents[0]
      : agents.find((agent) => agent.id === activeAgentId)) ??
    agents[0];

  return (
    <aside className="flex h-full min-h-[430px] flex-col border-t border-border/65 bg-card/88 lg:min-h-[500px] lg:border-l lg:border-t-0">
      <div className="border-b border-border/65 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-[4px] border border-border/70 bg-background/55">
              <Bot aria-hidden="true" className="size-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Agents</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                Watching{" "}
                {activeAgentId === ALL_AGENTS
                  ? "all session trades"
                  : selectedAgent.name}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="border-border/70 bg-background/45 font-mono text-muted-foreground"
          >
            <Radio
              aria-hidden="true"
              data-icon="inline-start"
              className="text-[#9ad48c]"
            />
            {liveCount}/{agents.length}
          </Badge>
        </div>
      </div>

      <div className="grid content-start gap-1 px-2 py-2">
        <button
          aria-pressed={activeAgentId === ALL_AGENTS}
          className={`relative grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 overflow-hidden rounded-[4px] px-2.5 py-2.5 text-left transition-colors hover:bg-muted/35 ${
            activeAgentId === ALL_AGENTS
              ? "bg-muted/50 before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-primary"
              : "bg-transparent"
          }`}
          onClick={() => onSelectAgent(ALL_AGENTS)}
          type="button"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="relative flex size-7 shrink-0 items-center justify-center rounded-[4px] border border-border/60 bg-background/45">
                <Users
                  aria-hidden="true"
                  className="size-3.5 text-muted-foreground"
                />
              </span>
              <span className="truncate text-sm font-semibold">All agents</span>
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Full MCP trade tape
            </span>
          </span>
          <span className="text-right">
            <span className="block font-mono text-sm font-semibold text-foreground">
              {tradeRows.length}
            </span>
            <span className="mt-1 block font-mono text-xs text-muted-foreground">
              trades
            </span>
          </span>
        </button>

        {agents.map((agent) => {
          const isPositive = agent.realizedPnlUsd >= 0;
          const isSelected = agent.id === activeAgentId;
          const rank =
            [...agents]
              .sort((a, b) => b.realizedPnlUsd - a.realizedPnlUsd)
              .findIndex((rankedAgent) => rankedAgent.id === agent.id) + 1;
          const latestTrade = agent.trades.at(-1);

          return (
            <button
              key={agent.id}
              aria-pressed={isSelected}
              className={`relative grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 overflow-hidden rounded-[4px] px-2.5 py-2.5 text-left transition-colors hover:bg-muted/35 ${
                isSelected
                  ? "bg-muted/50 before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-primary"
                  : "bg-transparent"
              }`}
              onClick={() => onSelectAgent(agent.id)}
              type="button"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="relative flex size-7 shrink-0 items-center justify-center rounded-[4px] border border-border/60 bg-background/45">
                    <Bot
                      aria-hidden="true"
                      className="size-3.5 text-muted-foreground"
                    />
                    <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-[#9ad48c] shadow-[0_0_10px_rgb(154_212_140/0.75)]" />
                  </span>
                  <span className="truncate text-sm font-semibold">
                    {agent.name}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    #{rank}
                  </span>
                  {rank === 1 ? (
                    <Trophy
                      aria-hidden="true"
                      className="size-3 text-[#9ad48c]"
                    />
                  ) : null}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {latestTrade?.side ?? "flat"} - {agent.trades.length} round
                  trips - {shortKey(agent.player)}
                </span>
              </span>

              <span className="text-right">
                <span
                  className={`block font-mono text-sm font-semibold ${
                    isPositive ? "text-[#9ad48c]" : "text-[#d98585]"
                  }`}
                >
                  {formatSignedUsd(agent.realizedPnlUsd)}
                </span>
                <span className="mt-1 block font-mono text-xs text-muted-foreground">
                  {formatUsd(agent.virtualCashUsd)}
                </span>
              </span>

              <span className="col-span-2 grid grid-cols-[1fr_auto] gap-2 text-[10px] text-muted-foreground">
                <span className="truncate">{agent.thesis}</span>
                <span className="font-mono">{selectedWindowLabel}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 border-t border-border/65 px-2 py-2">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">
            Trade tape
          </p>
          <a
            className="inline-flex items-center gap-1 text-[10px] font-medium text-primary underline-offset-4 hover:underline"
            href={devnetTxUrl(DEVNET_GAME.createGameTx)}
            rel="noreferrer"
            target="_blank"
          >
            Game {DEVNET_GAME.id}
            <ExternalLink aria-hidden="true" className="size-3" />
          </a>
        </div>
        <div className="grid max-h-[210px] gap-1 overflow-auto pr-1">
          {tradeRows.map(({ agent, trade }) => {
            const isActive = focusedTrade?.trade.id === trade.id;
            const isPositive = trade.pnlUsd >= 0;

            return (
              <button
                key={trade.id}
                aria-pressed={isActive}
                className={`grid gap-1 rounded-[4px] border px-2.5 py-2 text-left transition-colors hover:bg-muted/35 ${
                  isActive
                    ? "border-primary/40 bg-muted/45"
                    : "border-border/55 bg-background/30"
                }`}
                onClick={() => onSelectTrade(agent, trade)}
                type="button"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-xs font-semibold">
                    {agent.name} - Cycle {trade.cycle} {trade.side}
                  </span>
                  <span
                    className={`font-mono text-xs font-semibold ${
                      isPositive ? "text-[#9ad48c]" : "text-[#d98585]"
                    }`}
                  >
                    {formatSignedUsd(trade.pnlUsd)}
                  </span>
                </span>
                <span className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                  <span>Entry {formatUsd(trade.entryPrice)}</span>
                  <span>Exit {formatUsd(trade.exitPrice)}</span>
                </span>
                <span className="flex items-center gap-3 text-[10px]">
                  <a
                    className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                    href={explorerTxUrl(trade.openTx)}
                    onClick={(event) => event.stopPropagation()}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Entry tx
                    <ExternalLink aria-hidden="true" className="size-3" />
                  </a>
                  <a
                    className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                    href={explorerTxUrl(trade.closeTx)}
                    onClick={(event) => event.stopPropagation()}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Exit tx
                    <ExternalLink aria-hidden="true" className="size-3" />
                  </a>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-auto border-t border-border/65 p-2">
        <div className="rounded-[4px] bg-background/35 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                Viewing
              </p>
              <p className="mt-1 flex items-center gap-2 truncate text-sm font-semibold">
                <Bot aria-hidden="true" className="size-3.5 text-primary" />
                {focusedTrade
                  ? `${focusedTrade.agent.name} cycle ${focusedTrade.trade.cycle}`
                  : selectedAgent.name}
              </p>
            </div>
            <div className="text-right">
              <p
                className={`font-mono text-sm font-semibold ${
                  (focusedTrade?.trade.pnlUsd ??
                    selectedAgent.realizedPnlUsd) >= 0
                    ? "text-[#9ad48c]"
                    : "text-[#d98585]"
                }`}
              >
                {formatSignedUsd(
                  focusedTrade?.trade.pnlUsd ?? selectedAgent.realizedPnlUsd
                )}
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {formatUsd(latestPrice)}
              </p>
            </div>
          </div>
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
        className="relative h-full min-h-0 w-full rounded-[4px] border border-border/75 bg-card/95 py-0 shadow-[0_18px_70px_rgb(0_0_0/0.30)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-primary/20"
      >
        <CardHeader className="gap-2.5 border-b border-border/70 bg-background/20 py-2.5">
          <div className="grid gap-3 xl:grid-cols-[minmax(260px,0.8fr)_minmax(410px,1.15fr)_minmax(270px,0.62fr)_auto] xl:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-6 w-24 border border-primary/10 bg-primary/10" />
                <Skeleton className="h-3 w-9 bg-muted/35" />
                <Skeleton className="h-3 w-24 bg-muted/35" />
              </div>
              <div className="mt-2 space-y-1">
                <Skeleton className="h-3 w-20 bg-muted/35" />
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Skeleton className="h-10 w-52 bg-muted/55" />
                  <Skeleton className="h-4 w-16 bg-[#9ad48c]/15" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {["w-14", "w-16", "w-20", "w-14"].map((width, index) => (
                <div
                  key={index}
                  className="min-w-0 rounded-[4px] border border-border/70 bg-background/45 px-2.5 py-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.02)]"
                >
                  <Skeleton className="h-2.5 w-12 bg-muted/35" />
                  <Skeleton className={`mt-2 h-4 ${width} bg-muted/55`} />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 overflow-hidden rounded-[4px] border border-border/65 bg-background/45 text-xs sm:max-xl:max-w-xl">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className={
                    item === 0
                      ? "px-3 py-2"
                      : "border-l border-border/60 px-3 py-2"
                  }
                >
                  <Skeleton className="h-2.5 w-12 bg-muted/35" />
                  <Skeleton className="mt-2 h-4 w-14 bg-muted/55" />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end">
              <Skeleton className="size-8 border border-border/65 bg-background/45" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 p-0">
          <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="p-2">
              <div className="relative h-full min-h-[360px] w-full overflow-hidden rounded-[4px] border border-border/65 bg-background shadow-[inset_0_0_0_1px_rgb(255_255_255/0.012)]">
                <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 px-3 py-3">
                  <Skeleton className="h-3 w-24 bg-muted/35" />
                  <Skeleton className="h-6 w-28 border border-border/40 bg-card/70" />
                </div>

                <div className="absolute inset-x-4 bottom-[72px] top-[74px]">
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(217,232,217,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(217,232,217,0.045)_1px,transparent_1px)] bg-[size:100%_20%,12.5%_100%]" />
                  <svg
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full text-primary/30"
                    preserveAspectRatio="none"
                    viewBox="0 0 100 100"
                  >
                    <path
                      d="M0 66 C 10 62, 16 70, 24 54 S 39 48, 47 45 S 59 25, 68 33 S 82 50, 100 38"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="1.25"
                    />
                  </svg>
                  <div className="absolute left-[16%] top-[67%] size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow-[0_0_18px_rgb(230_234_219/0.10)]" />
                  <div className="absolute left-[42%] top-[58%] size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow-[0_0_18px_rgb(230_234_219/0.10)]" />
                  <div className="absolute left-[57%] top-[42%] size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-[#d98585] shadow-[0_0_18px_rgb(217_133_133/0.12)]" />
                  <div className="absolute left-[76%] top-[55%] size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-[#d98585] shadow-[0_0_18px_rgb(217_133_133/0.12)]" />
                </div>

                <div className="absolute left-3 top-12 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-[4px] border border-border/75 bg-background/82 px-3 py-2 shadow-[0_12px_40px_rgb(0_0_0/0.24)] backdrop-blur sm:left-4">
                  <Skeleton className="h-3 w-12 bg-muted/55" />
                  <span className="h-3 w-px bg-border" />
                  <Skeleton className="h-3 w-16 bg-primary/15" />
                  <span className="h-3 w-px bg-border" />
                  <Skeleton className="h-3 w-14 bg-[#d98585]/15" />
                </div>
              </div>
            </div>

            <aside className="flex h-full min-h-[430px] flex-col border-t border-border/65 bg-card/88 lg:min-h-[500px] lg:border-l lg:border-t-0">
              <div className="border-b border-border/65 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-[4px] border border-border/70 bg-background/55">
                      <Bot
                        aria-hidden="true"
                        className="size-4 text-primary/60"
                      />
                    </div>
                    <div className="min-w-0">
                      <Skeleton className="h-4 w-16 bg-muted/55" />
                      <Skeleton className="mt-2 h-3 w-28 bg-muted/35" />
                    </div>
                  </div>
                  <div className="flex h-6 items-center gap-1.5 rounded-[4px] border border-border/70 bg-background/45 px-2">
                    <Radio
                      aria-hidden="true"
                      className="size-3 text-[#9ad48c]/60"
                    />
                    <Skeleton className="h-3 w-8 bg-muted/45" />
                  </div>
                </div>
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
  const {
    candles,
    error,
    lastUpdatedAt,
    retry,
    selectedWindow,
    setSelectedWindow,
    status,
  } = usePythChart({
    symbol: MARKET_SYMBOL,
  });

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
  const hoverTime =
    hoverPoint?.time ?? liveCandle?.time ?? committed.at(-1)?.time ?? null;
  const syncLabel = lastUpdatedAt
    ? formatTimestamp(Math.floor(lastUpdatedAt / 1000))
    : "Pending";
  const chartAnchorTime =
    liveCandle?.time ?? committed.at(-1)?.time ?? fallbackNow;
  const selectedAgents =
    activeAgentId === ALL_AGENTS
      ? AGENTS
      : AGENTS.filter((agent) => agent.id === activeAgentId);
  const selectedTradeRows = selectedAgents.flatMap((agent) =>
    agent.trades.map((trade) => ({ agent, trade }))
  );
  const allTradeRows = AGENTS.flatMap((agent) =>
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
  const chartPrices = [
    ...candlesInView.flatMap((candle) => [candle.high, candle.low]),
    ...replayMarkers.map((marker) => marker.price),
    ...(focusedTrade
      ? [focusedTrade.trade.entryPrice, focusedTrade.trade.exitPrice]
      : []),
  ];
  const minReplayPrice = Math.min(...chartPrices, latestPrice) - 4;
  const maxReplayPrice = Math.max(...chartPrices, latestPrice) + 4;
  const totalPnl = AGENTS.reduce((sum, agent) => sum + agent.realizedPnlUsd, 0);
  const totalCash = AGENTS.reduce(
    (sum, agent) => sum + agent.virtualCashUsd,
    0
  );
  const leader = [...AGENTS].sort(
    (a, b) => b.realizedPnlUsd - a.realizedPnlUsd
  )[0];
  const liveCount = AGENTS.filter((agent) => agent.trades.length > 0).length;
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
    <section className="mx-auto flex min-h-0 w-full flex-1">
      <Card className="relative h-full min-h-0 w-full rounded-[4px] border border-border/75 bg-card/95 py-0 shadow-[0_18px_70px_rgb(0_0_0/0.30)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-primary/20">
        <CardHeader className="gap-2.5 border-b border-border/70 bg-background/20 py-2.5">
          <div className="grid gap-3 xl:grid-cols-[minmax(260px,0.8fr)_minmax(410px,1.15fr)_minmax(270px,0.62fr)_auto] xl:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-primary/25 bg-primary/10 text-primary"
                >
                  {MARKET_LABEL}
                </Badge>
                <span className="text-xs uppercase text-muted-foreground">
                  Pyth
                </span>
                <Badge
                  variant="secondary"
                  className="bg-secondary/80 text-secondary-foreground"
                >
                  {activeAgentId === ALL_AGENTS
                    ? "All agents"
                    : focusedTrade?.agent.name}
                </Badge>
                <span className="flex items-center text-xs text-muted-foreground">
                  <Dot
                    aria-hidden="true"
                    className="-mx-1 size-5 text-primary"
                  />
                  Sync {syncLabel}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                  Last price
                </p>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <CardTitle className="font-mono text-4xl font-semibold leading-none sm:text-[40px]">
                    {formatUsd(hoverValue)}
                  </CardTitle>
                  <span
                    className={
                      priceDeltaPositive
                        ? "text-sm font-medium text-[#9ad48c]"
                        : "text-sm font-medium text-[#d98585]"
                    }
                  >
                    {priceDelta}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatPill label="Window" value={selectedWindow.label} />
              <StatPill label="Trades" value={`${selectedTradeRows.length}`} />
              <StatPill
                label="Hover"
                value={hoverTime ? formatTimestamp(hoverTime) : "Pending"}
              />
              <StatPill
                label="Net PnL"
                tone={totalPnl >= 0 ? "positive" : "negative"}
                value={formatSignedUsd(totalPnl)}
              />
            </div>

            <div className="grid grid-cols-3 overflow-hidden rounded-[4px] border border-border/65 bg-background/45 text-xs sm:max-xl:max-w-xl">
              <div className="px-3 py-2">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Clock
                </p>
                <p className="mt-1 flex items-center gap-1.5 font-mono text-sm font-semibold text-foreground">
                  <Timer aria-hidden="true" className="size-3.5 text-primary" />
                  Live
                </p>
              </div>
              <div className="border-l border-border/60 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Agents
                </p>
                <p className="mt-1 flex items-center gap-1.5 font-mono text-sm font-semibold text-foreground">
                  <Radio
                    aria-hidden="true"
                    className="size-3.5 text-[#9ad48c]"
                  />
                  {liveCount}/{AGENTS.length}
                </p>
              </div>
              <div className="border-l border-border/60 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Leader
                </p>
                <p className="mt-1 truncate font-mono text-sm font-semibold text-[#9ad48c]">
                  {leader?.name ?? "Pending"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                aria-label="Show all agent trades"
                onClick={() => setActiveAgentId(ALL_AGENTS)}
                size="sm"
                variant={activeAgentId === ALL_AGENTS ? "secondary" : "outline"}
              >
                <Users aria-hidden="true" data-icon="inline-start" />
                All
              </Button>
              <Button
                aria-label="Refresh chart data"
                onClick={retry}
                size="icon-sm"
                variant="outline"
              >
                <RefreshCcw aria-hidden="true" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 p-0">
          <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="p-2">
              <div className="relative h-full min-h-[360px] w-full overflow-hidden rounded-[4px] border border-border/65 bg-background shadow-[inset_0_0_0_1px_rgb(255_255_255/0.012)]">
                <div className="h-full pt-3">
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
                    onModeChange={setDisplayMode}
                    onWindowChange={(secs) => {
                      const nextWindow = CHART_WINDOWS.find(
                        (entry) => entry.secs === secs
                      );
                      if (nextWindow) {
                        setSelectedWindow(nextWindow);
                      }
                    }}
                    padding={{ top: 44, right: 82, bottom: 72, left: 22 }}
                    pulse
                    referenceLine={livelineReference}
                    scrub
                    showValue={false}
                    style={{ height: "calc(100% - 42px)" }}
                    theme="dark"
                    tooltipY={18}
                    value={latestPrice}
                    window={selectedWindow.secs}
                    windows={CHART_WINDOWS.map(({ label, secs }) => ({
                      label,
                      secs,
                    }))}
                    windowStyle="rounded"
                  />
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

              <div className="mt-2 grid gap-3 rounded-[4px] border border-border/60 bg-muted/[0.20] px-3 py-2.5 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] uppercase text-muted-foreground/90">
                  <span className="text-foreground/80">
                    Feed {MARKET_SYMBOL}
                  </span>
                  <span>Mode {displayMode}</span>
                  <span>Cash {formatUsd(totalCash)}</span>
                  <span>Markers {replayMarkers.length}</span>
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
              agents={AGENTS}
              focusedTrade={focusedTrade}
              latestPrice={latestPrice}
              selectedWindowLabel={selectedWindow.label}
              tradeRows={selectedTradeRows}
              onSelectAgent={(id) => {
                setActiveAgentId(id);
                const nextAgent =
                  id === ALL_AGENTS
                    ? AGENTS[0]
                    : AGENTS.find((agent) => agent.id === id);
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
