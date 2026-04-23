import { AlertCircle, Dot, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { Liveline } from "liveline";
import type { HoverPoint } from "liveline";

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
const CHART_COLOR = "#4f46e5";

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
    <section className="mx-auto grid max-w-[1180px] gap-4 lg:grid-cols-[minmax(0,860px)_1fr]">
      <Card className="border border-border/70 bg-card py-0 shadow-none lg:col-start-1">
        <CardHeader className="gap-4 border-b border-border/70 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{MARKET_LABEL}</Badge>
                <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Pyth
                </span>
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

            <Button aria-label="Refresh chart data" onClick={retry} size="icon-sm" variant="outline">
              <RefreshCcw aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4 py-4">
          <div className="rounded-[26px] border border-border/70 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_90%,white),var(--background))] p-2 sm:p-2.5">
            <div className="h-[340px] w-full sm:h-[390px]">
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
                scrub
                showValue={false}
                theme="light"
                tooltipY={18}
                value={latestPrice}
                window={selectedWindow.secs}
                windows={CHART_WINDOWS.map(({ label, secs }) => ({ label, secs }))}
                windowStyle="rounded"
              />
            </div>
          </div>

          <div className="rounded-[18px] border border-border/60 bg-muted/[0.32] px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/90">
              <span className="text-foreground/80">Feed {MARKET_SYMBOL}</span>
              <span>Mode {displayMode}</span>
              <span>Live edge 700ms</span>
              <span className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-primary/85" />
                Proxy active
              </span>
            </div>
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

      <div aria-hidden="true" className="hidden lg:block" />
    </section>
  );
}
