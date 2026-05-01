import { useEffect, useState } from "react";

export type ResourceStatus = "loading" | "ready" | "empty" | "error";

type ReadyResult<T> = {
  status: "ready";
  data: T;
};

type EmptyResult<T> = {
  status: "empty";
  data?: T;
};

export type PollingResult<T> = ReadyResult<T> | EmptyResult<T>;

type PollingResourceOptions<T> = {
  load: (signal: AbortSignal) => Promise<PollingResult<T>>;
  initialData: T;
  refreshMs: number;
  keepPreviousData?: boolean;
  emptyData?: T;
  fallbackError: string;
  isSameData?: (current: T, next: T) => boolean;
};

export type PollingResourceState<T> = {
  data: T;
  status: ResourceStatus;
  error: string | null;
  retry: () => void;
};

export function usePollingResource<T>({
  load,
  initialData,
  refreshMs,
  keepPreviousData = true,
  emptyData = initialData,
  fallbackError,
  isSameData,
}: PollingResourceOptions<T>): PollingResourceState<T> {
  const [data, setData] = useState<T>(initialData);
  const [status, setStatus] = useState<ResourceStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadResource() {
      try {
        const result = await load(controller.signal);

        if (result.status === "empty") {
          setData(result.data ?? emptyData);
          setStatus("empty");
          setError(null);
          return;
        }

        setData((current) =>
          isSameData?.(current, result.data) ? current : result.data
        );
        setStatus("ready");
        setError(null);
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setError(
          loadError instanceof Error ? loadError.message : fallbackError
        );
        setStatus("error");
        if (!keepPreviousData) {
          setData(initialData);
        }
      }
    }

    void loadResource();
    const intervalId = window.setInterval(() => {
      void loadResource();
    }, refreshMs);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [
    emptyData,
    fallbackError,
    initialData,
    isSameData,
    keepPreviousData,
    load,
    refreshMs,
    reloadToken,
  ]);

  return {
    data,
    status,
    error,
    retry: () => {
      setStatus("loading");
      setReloadToken((token) => token + 1);
    },
  };
}
