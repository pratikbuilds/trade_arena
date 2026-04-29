import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  RefreshCcw,
  Timer,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { MarketChart } from "@/components/market-chart";
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
import { useArenaGames } from "@/hooks/use-arena-games";
import type { ArenaGame, ArenaGameStatus } from "@/lib/agent-game";
import { formatUsd } from "@/lib/market";

const MICROS_PER_USD = 1_000_000;

type Route =
  | {
      name: "discovery";
    }
  | {
      name: "game";
      gamePubkey: string;
    };

function routeFromPath(pathname: string): Route {
  const gameMatch = /^\/game\/([^/]+)\/?$/.exec(pathname);
  if (gameMatch?.[1]) {
    return {
      name: "game",
      gamePubkey: decodeURIComponent(gameMatch[1]),
    };
  }

  return { name: "discovery" };
}

function useRoute(): [Route, (path: string) => void] {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState(null, "", path);
    setPathname(window.location.pathname);
  };

  return [routeFromPath(pathname), navigate];
}

function shortPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`;
}

function microsToUsd(value: string): number {
  return Number(value) / MICROS_PER_USD;
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatStartTime(startTime: number): string {
  if (startTime <= 0) {
    return "Not started";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(startTime * 1000);
}

function statusLabel(status: ArenaGameStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "joinable":
      return "Joinable";
    case "ended":
      return "Ended";
  }
}

function statusTone(status: ArenaGameStatus): "default" | "secondary" | "outline" {
  if (status === "active") {
    return "default";
  }

  return status === "joinable" ? "secondary" : "outline";
}

function GameCard({
  game,
  onNavigate,
}: {
  game: ArenaGame;
  onNavigate: (path: string) => void;
}) {
  const path = `/game/${encodeURIComponent(game.game_pubkey)}`;
  const prizePool = formatUsd(microsToUsd(game.prize_pool_usdc));

  return (
    <a
      className="group block rounded-[4px] focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:outline-none"
      href={path}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(path);
      }}
    >
      <Card className="h-full border border-border/70 bg-card py-0 shadow-lg transition-colors group-hover:border-primary/35 group-hover:bg-card/95">
        <CardHeader className="border-b border-border/70 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate font-mono text-base">
                Trade Arena #{game.game_id}
              </CardTitle>
              <CardDescription className="mt-1 font-mono text-xs">
                {shortPubkey(game.game_pubkey)}
              </CardDescription>
            </div>
            <Badge className="shrink-0" variant={statusTone(game.status)}>
              {statusLabel(game.status)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="grid gap-3 px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[4px] border border-border/60 bg-background/55 px-2.5 py-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users aria-hidden="true" className="size-3" />
                Agents
              </div>
              <p className="mt-1 font-mono text-sm">
                {game.player_count}/{game.max_players}
              </p>
            </div>
            <div className="rounded-[4px] border border-border/60 bg-background/55 px-2.5 py-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Trophy aria-hidden="true" className="size-3" />
                Pool
              </div>
              <p className="mt-1 font-mono text-sm">{prizePool}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1.5">
              <Timer aria-hidden="true" className="size-3 text-primary" />
              <span className="truncate">
                {formatDuration(game.duration_seconds)} ·{" "}
                {formatStartTime(game.start_time)}
              </span>
            </span>
            <ChevronRight
              aria-hidden="true"
              className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5"
            />
          </div>

          {game.winner ? (
            <p className="truncate border-t border-border/60 pt-2 font-mono text-xs text-muted-foreground">
              Winner {shortPubkey(game.winner)}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </a>
  );
}

function GameSection({
  title,
  games,
  emptyText,
  onNavigate,
}: {
  title: string;
  games: ArenaGame[];
  emptyText: string;
  onNavigate: (path: string) => void;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="font-mono text-xs text-muted-foreground">
          {games.length}
        </span>
      </div>

      {games.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {games.map((game) => (
            <GameCard
              key={game.game_pubkey}
              game={game}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[4px] border border-border/70 bg-card/70 px-4 py-8 text-sm text-muted-foreground">
          {emptyText}
        </div>
      )}
    </section>
  );
}

function DiscoveryLoadingState() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <Card
          key={item}
          className="border border-border/70 bg-card py-0 shadow-lg"
        >
          <CardHeader className="border-b border-border/70 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-2">
                <Skeleton className="h-4 w-32 bg-muted/55" />
                <Skeleton className="h-3 w-20 bg-muted/35" />
              </div>
              <Skeleton className="h-5 w-16 rounded bg-muted/35" />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 px-3 py-3">
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-16 rounded bg-muted/25" />
              <Skeleton className="h-16 rounded bg-muted/25" />
            </div>
            <Skeleton className="h-4 w-full bg-muted/25" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function GameDiscovery({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { games, status, error, retry } = useArenaGames();
  const currentGames = useMemo(
    () => games.filter((game) => game.status !== "ended"),
    [games]
  );
  const oldGames = useMemo(
    () => games.filter((game) => game.status === "ended"),
    [games]
  );

  if (status === "loading" && games.length === 0) {
    return (
      <section className="mx-auto grid w-full max-w-[1560px] gap-5">
        <DiscoveryLoadingState />
      </section>
    );
  }

  if (status === "error" && games.length === 0) {
    return (
      <Card className="rounded-[4px] border border-border/80 bg-card py-0 shadow-none">
        <CardHeader className="border-b border-border/80 py-6">
          <CardTitle className="flex items-center gap-2 text-2xl">
            <AlertCircle
              aria-hidden="true"
              className="size-5 text-destructive"
            />
            Couldn&apos;t load games
          </CardTitle>
          <CardDescription>
            {error ?? "The arena server did not return game accounts."}
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
          <CardTitle className="text-2xl">No games found</CardTitle>
          <CardDescription>
            The on-chain scan did not find any Trade Arena game accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-6">
          <Button onClick={retry} variant="secondary">
            <RefreshCcw aria-hidden="true" data-icon="inline-start" />
            Refresh
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="mx-auto grid w-full max-w-[1560px] gap-6">
      <GameSection
        emptyText="No current matches are joinable or active yet."
        games={currentGames}
        title="Current Matches"
        onNavigate={onNavigate}
      />
      <GameSection
        emptyText="No old matches have ended yet."
        games={oldGames}
        title="Old Matches"
        onNavigate={onNavigate}
      />

      {status === "error" ? (
        <div className="flex items-start justify-between gap-3 rounded-[4px] border border-border/70 bg-background/70 px-4 py-3 text-sm">
          <div className="flex items-start gap-3">
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 size-4 text-primary"
            />
            <p className="text-muted-foreground">
              {error ?? "Showing the last successful arena list."}
            </p>
          </div>
          <Button
            className="shrink-0"
            onClick={retry}
            size="sm"
            variant="secondary"
          >
            <RefreshCcw aria-hidden="true" data-icon="inline-start" />
            Retry
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function AppHeader({
  route,
  onNavigate,
}: {
  route: Route;
  onNavigate: (path: string) => void;
}) {
  return (
    <header className="grid gap-3 pb-1 lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        {route.name === "game" ? (
          <Button
            aria-label="Back to games"
            onClick={() => onNavigate("/")}
            size="icon-sm"
            variant="ghost"
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
        ) : null}
        <a
          className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-[#020403] shadow-[0_0_24px_rgb(230_234_219/0.08)] focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:outline-none"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("/");
          }}
        >
          <img
            src="/trade-arena-logo.svg"
            alt=""
            aria-hidden="true"
            className="size-full object-contain"
          />
        </a>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-base font-semibold leading-none sm:text-lg">
              Trade Arena
            </h1>
            <Badge variant="outline">
              {route.name === "game" ? "Game" : "Discovery"}
            </Badge>
          </div>
          {route.name === "game" ? (
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
              {shortPubkey(route.gamePubkey)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <Button className="h-8 border border-primary/35 bg-primary px-3 text-primary-foreground shadow-[0_0_24px_rgb(230_234_219/0.10)] hover:bg-primary/90">
          <Wallet data-icon="inline-start" aria-hidden="true" />
          Connect wallet
        </Button>
      </div>
    </header>
  );
}

export default function App() {
  const [route, navigate] = useRoute();

  return (
    <main className="arena-shell min-h-svh overflow-x-hidden bg-background text-foreground lg:h-screen lg:overflow-hidden">
      <div className="mx-auto flex min-h-svh w-full max-w-[1560px] flex-col gap-2.5 px-3 py-2.5 sm:px-5 lg:h-screen lg:min-h-0 lg:px-6">
        <AppHeader route={route} onNavigate={navigate} />

        {route.name === "game" ? (
          <MarketChart gamePubkey={route.gamePubkey} />
        ) : (
          <div className="min-h-0 overflow-auto pb-8 lg:flex-1">
            <GameDiscovery onNavigate={navigate} />
          </div>
        )}
      </div>
    </main>
  );
}
