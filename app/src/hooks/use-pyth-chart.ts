import { useEffect, useState } from "react";
import type { CandlePoint } from "liveline";

import {
  CHART_WINDOWS,
  type ChartWindow,
  fetchPythCandles,
  fetchRecentPythCandles,
  mergeCandles,
} from "@/lib/market";

type ChartStatus = "loading" | "ready" | "empty" | "error";

type UsePythChartOptions = {
  symbol: string;
  refreshMs?: number;
};

export function usePythChart({
  symbol,
  refreshMs = 2000,
}: UsePythChartOptions) {
  const [selectedWindow, setSelectedWindow] = useState<ChartWindow>(
    CHART_WINDOWS[0]
  );
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [status, setStatus] = useState<ChartStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCandles() {
      try {
        const nextCandles = await fetchPythCandles(
          symbol,
          selectedWindow,
          controller.signal
        );
        setCandles(nextCandles);
        setError(null);
        setStatus(nextCandles.length === 0 ? "empty" : "ready");
        setLastUpdatedAt(Date.now());
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        const message =
          loadError instanceof Error
            ? loadError.message
            : "Failed to load Pyth market data.";

        setError(message);
        setStatus("error");
      }
    }

    void loadCandles();

    const intervalId = window.setInterval(() => {
      void loadCandles();
    }, refreshMs);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [refreshMs, reloadToken, selectedWindow, symbol]);

  useEffect(() => {
    if (status !== "ready") {
      return;
    }

    const controller = new AbortController();

    async function refreshLiveEdge() {
      try {
        const recentCandles = await fetchRecentPythCandles(
          symbol,
          selectedWindow,
          controller.signal
        );

        if (recentCandles.length === 0) {
          return;
        }

        setCandles((currentCandles) =>
          mergeCandles(currentCandles, recentCandles)
        );

        setLastUpdatedAt(Date.now());
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        const message =
          loadError instanceof Error
            ? loadError.message
            : "Failed to refresh the live candle.";

        setError(message);
      }
    }

    void refreshLiveEdge();
    const intervalId = window.setInterval(() => {
      void refreshLiveEdge();
    }, 700);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [selectedWindow, status, symbol]);

  return {
    candles,
    error,
    lastUpdatedAt,
    retry: () => {
      setStatus("loading");
      setReloadToken((token) => token + 1);
    },
    selectedWindow,
    setSelectedWindow,
    status,
  };
}
