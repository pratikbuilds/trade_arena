import { ArrowRight, Blocks, CandlestickChart, Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listGames } from "@/features/games/api";
import { formatCompactNumber, formatShortDate, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

const valueCards = [
  {
    label: "Arena format",
    value: "Time-boxed rooms",
    body: "Each room can eventually surface oracle feeds, entries, positions, and payouts without crowding the first screen.",
    icon: Blocks,
  },
  {
    label: "Program intent",
    value: "Read-first UI",
    body: "This first shell favors exploration and trust over transaction flows so layout and clarity stabilize before wallet wiring.",
    icon: CandlestickChart,
  },
  {
    label: "Payout language",
    value: "Prize clarity",
    body: "Settled games should make ranking, prize distribution, and oracle source obvious at a glance.",
    icon: Trophy,
  },
];

export function DashboardRoute() {
  const gamesQuery = useQuery({
    queryKey: ["games"],
    queryFn: listGames,
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card className="border border-border bg-card/95 py-0 shadow-lg shadow-primary/5">
          <CardHeader className="gap-4 border-b border-border/70 py-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="rounded-full px-3 py-1">UI exploration phase</Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                shadcn token system
              </Badge>
            </div>
            <CardTitle className="max-w-3xl text-4xl leading-none sm:text-5xl">
              A product shell for reading the arena before users ever sign a trade.
            </CardTitle>
            <CardDescription className="max-w-2xl text-base text-muted-foreground">
              The first frontend pass centers on room discovery, game detail readability, and trust-building surfaces for later wallet and program integration.
            </CardDescription>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link to="/games" className={cn(buttonVariants({ size: "lg" }))}>
                Explore games
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Link>
              <Link
                to="/integrations"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                Review integration seams
              </Link>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 py-6 md:grid-cols-3">
            {valueCards.map(({ body, icon: Icon, label, value }) => (
              <div key={label} className="rounded-xl border border-border/80 bg-background/80 p-4">
                <div className="mb-4 flex size-11 items-center justify-center rounded-full border border-border bg-card text-primary">
                  <Icon aria-hidden="true" />
                </div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-medium">{value}</p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border border-border py-0">
          <CardHeader className="border-b border-border/70 py-6">
            <CardTitle className="text-2xl">What the UI needs to prove first</CardTitle>
            <CardDescription>
              Before wallet connection, the shell should already communicate room state, prize shape, and trust signals.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 py-6">
            {[
              "Users should understand the difference between registration, live, and settled rooms instantly.",
              "Game details need enough context to show how a room is resolved without overwhelming the first interaction.",
              "Integration screens should make the wallet and program plan legible before any write action exists.",
            ].map((item) => (
              <div
                key={item}
                className="rounded-xl border border-border/80 bg-muted/45 p-4 text-sm leading-6 text-muted-foreground"
              >
                {item}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {gamesQuery.isLoading
          ? Array.from({ length: 3 }).map((_, index) => (
              <Card key={index} className="border border-border py-0">
                <CardHeader className="gap-3 border-b border-border/70 py-5">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-9 w-full" />
                </CardHeader>
                <CardContent className="grid gap-3 py-5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))
          : gamesQuery.data?.map((game) => (
              <Card key={game.id} className="border border-border py-0">
                <CardHeader className="border-b border-border/70 py-5">
                  <CardAction>
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
                  </CardAction>
                  <CardTitle>{game.title}</CardTitle>
                  <CardDescription>{game.subtitle}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 py-5">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-border/80 bg-background p-3">
                      <p className="text-muted-foreground">Prize pool</p>
                      <p className="mt-1 font-mono text-lg tabular-nums">
                        {formatUsd(game.prizePoolUsd)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-background p-3">
                      <p className="text-muted-foreground">Players</p>
                      <p className="mt-1 font-mono text-lg tabular-nums">
                        {formatCompactNumber(game.playerCount)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{game.assetPair}</span>
                    <span>{formatShortDate(game.startsAt)}</span>
                  </div>
                  <Link
                    to="/games/$gameId"
                    params={{ gameId: game.id }}
                    className={cn(buttonVariants({ variant: "outline" }))}
                  >
                    Inspect room
                    <ArrowRight data-icon="inline-end" aria-hidden="true" />
                  </Link>
                </CardContent>
              </Card>
            ))}
      </section>
    </div>
  );
}
