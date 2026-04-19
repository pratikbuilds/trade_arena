import { ArrowLeft, ExternalLink, Radar, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getGameById } from "@/features/games/api";
import {
  formatCompactNumber,
  formatShortDate,
  formatUsd,
  truncateAddress,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export function GameDetailRoute() {
  const { gameId } = useParams({ from: "/games/$gameId" });
  const gameQuery = useQuery({
    queryKey: ["games", gameId],
    queryFn: () => getGameById(gameId),
  });

  if (gameQuery.isLoading) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <Skeleton className="h-10 w-32 rounded-full" />
        <Skeleton className="h-64 w-full rounded-[2rem]" />
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-40 w-full rounded-[2rem]" />
          ))}
        </div>
      </div>
    );
  }

  if (gameQuery.isError) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <Link to="/games" className={cn(buttonVariants({ variant: "outline" }), "w-fit")}>
          <ArrowLeft data-icon="inline-start" aria-hidden="true" />
          Back to games
        </Link>
        <Card className="border border-destructive/60 py-0">
          <CardHeader className="gap-3 border-b border-destructive/30 py-6">
            <CardTitle className="text-2xl">This room could not be loaded.</CardTitle>
            <CardDescription>
              The detail route should recover gracefully from failed program reads. This mock state is standing in for that path now.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-6">
            <button
              type="button"
              className={cn(buttonVariants())}
              onClick={() => {
                void gameQuery.refetch();
              }}
            >
              Retry room query
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!gameQuery.data) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <Link to="/games" className={cn(buttonVariants({ variant: "outline" }), "w-fit")}>
          <ArrowLeft data-icon="inline-start" aria-hidden="true" />
          Back to games
        </Link>
        <Card className="border border-border py-0">
          <CardHeader className="gap-3 border-b border-border/70 py-6">
            <CardTitle className="text-2xl">That room does not exist.</CardTitle>
            <CardDescription>
              Use the games explorer to jump into one of the seeded rooms while the UI is in design mode.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const game = gameQuery.data;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link to="/games" className={cn(buttonVariants({ variant: "outline" }), "w-fit")}>
        <ArrowLeft data-icon="inline-start" aria-hidden="true" />
        Back to games
      </Link>

      <Card className="border border-border py-0 shadow-lg shadow-primary/5">
        <CardHeader className="gap-5 border-b border-border/70 py-6">
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
            <Badge variant="outline">{game.network}</Badge>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="space-y-3">
              <CardTitle className="text-4xl leading-none sm:text-5xl">{game.title}</CardTitle>
              <CardDescription className="max-w-3xl text-base text-muted-foreground">
                {game.summary}
              </CardDescription>
            </div>
            <div className="rounded-[1.4rem] border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
              Starts {formatShortDate(game.startsAt)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 py-6 lg:grid-cols-4">
          {[
            { label: "Prize pool", value: formatUsd(game.prizePoolUsd) },
            { label: "Entry", value: formatUsd(game.entryFeeUsd) },
            { label: "Players", value: formatCompactNumber(game.playerCount) },
            { label: "Volume", value: formatUsd(game.totalVolumeUsd) },
          ].map((item) => (
            <div key={item.label} className="rounded-[1.4rem] border border-border/80 bg-background p-4">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="mt-2 font-mono text-2xl tabular-nums">{item.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="border border-border py-0">
          <CardHeader className="gap-3 border-b border-border/70 py-6">
            <CardTitle className="text-2xl">Settlement trust surface</CardTitle>
            <CardDescription>
              The detail page needs to explain where numbers come from before wallet actions are introduced.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 py-6 text-sm">
            <div className="rounded-xl border border-border/80 bg-muted/45 p-4">
              <p className="text-muted-foreground">Oracle source</p>
              <p className="mt-1 font-medium">{game.oracle}</p>
            </div>
            <div className="rounded-xl border border-border/80 bg-muted/45 p-4">
              <p className="text-muted-foreground">Prize distribution</p>
              <p className="mt-1 font-medium">{game.prizeDistribution}</p>
            </div>
            <div className="rounded-xl border border-border/80 bg-muted/45 p-4">
              <p className="text-muted-foreground">Average exposure</p>
              <p className="mt-1 font-medium">{formatUsd(game.averageExposureUsd)}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://explorer.solana.com/?cluster=devnet"
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                <ExternalLink data-icon="inline-start" aria-hidden="true" />
                Explorer context
              </a>
              <button type="button" className={cn(buttonVariants({ variant: "secondary" }))}>
                <Radar data-icon="inline-start" aria-hidden="true" />
                Program reads next
              </button>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border py-0">
          <CardHeader className="gap-3 border-b border-border/70 py-6">
            <CardTitle className="text-2xl">Current standings</CardTitle>
            <CardDescription>
              Address formatting, ranking, and PnL hierarchy are all visible here before live chain data replaces the mock layer.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 py-6">
            {game.standings.map((standing, index) => (
              <div
                key={standing.address}
                className="grid gap-3 rounded-[1.4rem] border border-border/80 bg-background p-4 md:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                <div className="flex size-11 items-center justify-center rounded-full border border-border bg-card font-mono text-sm tabular-nums">
                  #{index + 1}
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-mono text-sm tabular-nums">
                    {truncateAddress(standing.address)}
                  </p>
                  <p className="text-sm font-medium">{standing.strategy}</p>
                  <p className="text-sm text-muted-foreground">{standing.conviction} positioning</p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-2 font-mono text-sm tabular-nums">
                  <Wallet aria-hidden="true" />
                  {formatUsd(standing.pnlUsd)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
