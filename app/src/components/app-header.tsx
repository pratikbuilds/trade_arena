import { ArrowLeft, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { shortPubkey } from "@/lib/arena";
import type { Route } from "@/routes/router";

export function AppHeader({
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
          className="relative flex size-[68px] shrink-0 items-center justify-center focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:outline-none"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("/");
          }}
        >
          <img
            src="/trade-arena-logo.png"
            alt=""
            aria-hidden="true"
            className="size-full object-contain"
          />
        </a>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="brand-wordmark truncate text-[1.15rem] sm:text-[1.28rem]">
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
