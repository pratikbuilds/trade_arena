import type { CandlePoint, LivelinePoint } from "liveline";

export type ChartWindow = {
  label: string;
  secs: number;
  resolution: "1" | "5" | "15";
  candleWidth: number;
  historySpan: number;
  intervalLabel: string;
};

type PythHistoryResponse = {
  s: "ok" | "error";
  errmsg?: string;
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
  v?: number[];
};

export const CHART_WINDOWS: ChartWindow[] = [
  {
    label: "30m",
    secs: 30 * 60,
    resolution: "1",
    candleWidth: 60,
    historySpan: 4 * 60 * 60,
    intervalLabel: "1m candles",
  },
  {
    label: "2h",
    secs: 2 * 60 * 60,
    resolution: "5",
    candleWidth: 5 * 60,
    historySpan: 18 * 60 * 60,
    intervalLabel: "5m candles",
  },
  {
    label: "8h",
    secs: 8 * 60 * 60,
    resolution: "15",
    candleWidth: 15 * 60,
    historySpan: 48 * 60 * 60,
    intervalLabel: "15m candles",
  },
];

async function fetchHistoryRange(
  symbol: string,
  from: number,
  to: number,
  resolution: ChartWindow["resolution"],
  signal?: AbortSignal,
): Promise<CandlePoint[]> {
  const params = new URLSearchParams({
    symbol,
    from: String(from),
    to: String(to),
    resolution,
  });

  const response = await fetch(`/api/pyth/history?${params.toString()}`, { signal });

  if (!response.ok) {
    throw new Error(`Pyth history request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as PythHistoryResponse;

  if (
    payload.s !== "ok" ||
    !payload.t ||
    !payload.o ||
    !payload.h ||
    !payload.l ||
    !payload.c
  ) {
    throw new Error(payload.errmsg ?? "Pyth returned an invalid candle payload.");
  }

  return payload.t.map((time, index) => ({
    time,
    open: payload.o![index],
    high: payload.h![index],
    low: payload.l![index],
    close: payload.c![index],
  }));
}

export async function fetchPythCandles(
  symbol: string,
  chartWindow: ChartWindow,
  signal?: AbortSignal,
): Promise<CandlePoint[]> {
  const now = Math.floor(Date.now() / 1000);
  return fetchHistoryRange(
    symbol,
    now - chartWindow.historySpan,
    now,
    chartWindow.resolution,
    signal,
  );
}

export async function fetchRecentPythCandles(
  symbol: string,
  chartWindow: ChartWindow,
  signal?: AbortSignal,
): Promise<CandlePoint[]> {
  const now = Math.floor(Date.now() / 1000);
  return fetchHistoryRange(
    symbol,
    now - chartWindow.candleWidth * 3,
    now,
    chartWindow.resolution,
    signal,
  );
}

export function splitLiveCandle(candles: CandlePoint[], candleWidth: number): {
  committed: CandlePoint[];
  liveCandle: CandlePoint | null;
} {
  if (candles.length === 0) {
    return { committed: [], liveCandle: null };
  }

  const lastCandle = candles.at(-1)!;
  const now = Math.floor(Date.now() / 1000);
  const isLive = now < lastCandle.time + candleWidth;

  if (!isLive) {
    return { committed: candles, liveCandle: null };
  }

  return {
    committed: candles.slice(0, -1),
    liveCandle: lastCandle,
  };
}

export function candlesToLineData(candles: CandlePoint[], liveCandle: CandlePoint | null): LivelinePoint[] {
  const points = candles.map((candle) => ({
    time: candle.time,
    value: candle.close,
  }));

  if (liveCandle) {
    points.push({
      time: liveCandle.time,
      value: liveCandle.close,
    });
  }

  return points;
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

export function formatPriceDelta(current: number, previous: number): string {
  const delta = current - previous;
  const percent = previous === 0 ? 0 : (delta / previous) * 100;
  const sign = delta >= 0 ? "+" : "";

  return `${sign}${formatUsd(delta)} (${sign}${percent.toFixed(2)}%)`;
}

export function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

export function formatChartTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp * 1000));
}

export function formatAxisUsd(value: number): string {
  if (Math.abs(value) >= 1000) {
    const compact = new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);

    return `$${compact}`;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}
