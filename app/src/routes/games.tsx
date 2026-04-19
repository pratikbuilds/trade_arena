import { startTransition, useDeferredValue, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { listGames } from "@/features/games/api";
import type { GameStatus } from "@/features/games/types";
import { formatCompactNumber, formatShortDate, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

const filters: Array<{ label: string; value: GameStatus | "all" }> = [
  { label: "All rooms", value: "all" },
  { label: "Registration", value: "registration" },
  { label: "Live", value: "live" },
  { label: "Settled", value: "settled" },
];

export function GamesRoute() {
  const gamesQuery = useQuery({
    queryKey: ["games"],
    queryFn: listGames,
  });
  const [statusFilter, setStatusFilter] = useState<GameStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();
  const filteredGames = (gamesQuery.data ?? []).filter((game) => {
    const matchesStatus = statusFilter === "all" || game.status === statusFilter;
    const matchesSearch =
      normalizedSearchQuery.length === 0 ||
      [game.title, game.subtitle, game.assetPair].some((field) =>
        field.toLowerCase().includes(normalizedSearchQuery),
      );

    return matchesStatus && matchesSearch;
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Card className="border border-border py-0">
        <CardHeader className="gap-4 border-b border-border/70 py-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="rounded-full px-3 py-1">
              games explorer
            </Badge>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              mocked with React Query
            </Badge>
          </div>
          <CardTitle className="text-3xl sm:text-4xl">
            Inspect room shape before program reads arrive.
          </CardTitle>
          <CardDescription className="max-w-3xl text-base">
            This route is designed to pressure-test navigation, filtering, and information density while the real Solana read layer is still being wired.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="grid gap-2">
            <label htmlFor="game-search" className="text-sm font-medium">
              Search games
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="game-search"
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                }}
                placeholder="BTC, SOL, breakout, settled..."
                className="pl-10"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={cn(
                  buttonVariants({
                    size: "sm",
                    variant: filter.value === statusFilter ? "default" : "outline",
                  }),
                  "rounded-full px-4",
                )}
                onClick={() => {
                  startTransition(() => {
                    setStatusFilter(filter.value);
                  });
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {gamesQuery.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="border border-border py-0">
              <CardHeader className="gap-3 border-b border-border/70 py-5">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-7 w-2/3" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent className="grid gap-4 py-5">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-10 w-full rounded-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : gamesQuery.isError ? (
        <Card className="border border-destructive/60 py-0">
          <CardHeader className="gap-3 border-b border-destructive/30 py-6">
            <CardTitle className="text-2xl">Game data did not load.</CardTitle>
            <CardDescription>
              The mock query layer failed, which is useful here because this screen will eventually need the same recovery shape for RPC issues.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 py-6">
            <button
              type="button"
              className={cn(buttonVariants())}
              onClick={() => {
                void gamesQuery.refetch();
              }}
            >
              Retry query
            </button>
          </CardContent>
        </Card>
      ) : filteredGames.length === 0 ? (
        <Card className="border border-border py-0">
          <CardHeader className="gap-3 border-b border-border/70 py-6">
            <CardTitle className="text-2xl">No rooms match this view.</CardTitle>
            <CardDescription>
              Try a different search term or switch filters to widen the room set.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <Sparkles aria-hidden="true" />
            The empty state is intentional. It gives us a clear place for future onboarding prompts and creation flows.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredGames.map((game) => (
            <Card key={game.id} className="border border-border py-0">
              <CardHeader className="gap-4 border-b border-border/70 py-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge
                    variant={
                      game.status === "live"
                        ? "default"
                        : game.status === "registration"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {game.status}
                  </Badge>
                  <Badge variant="outline">{game.assetPair}</Badge>
                </div>
                <div>
                  <CardTitle className="text-2xl">{game.title}</CardTitle>
                  <CardDescription className="mt-1">{game.subtitle}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5 py-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/80 bg-background p-4">
                    <p className="text-sm text-muted-foreground">Prize pool</p>
                    <p className="mt-1 font-mono text-xl tabular-nums">
                      {formatUsd(game.prizePoolUsd)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-background p-4">
                    <p className="text-sm text-muted-foreground">Players</p>
                    <p className="mt-1 font-mono text-xl tabular-nums">
                      {formatCompactNumber(game.playerCount)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span>Starts {formatShortDate(game.startsAt)}</span>
                  <span>{game.strategyCount} strategies queued</span>
                </div>
                <Link
                  to="/games/$gameId"
                  params={{ gameId: game.id }}
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  Open room
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
