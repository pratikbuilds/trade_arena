import { Activity, Wallet } from "lucide-react";

import { MarketChart } from "@/components/market-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function App() {
  return (
    <main className="arena-shell h-screen overflow-hidden bg-background text-foreground">
      <div className="mx-auto flex h-screen w-full max-w-[1560px] flex-col gap-2.5 px-3 py-2.5 sm:px-5 lg:px-6">
        <header className="grid gap-3 border-b border-border/70 pb-2.5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex size-10 items-center justify-center rounded-[4px] border border-border/75 bg-card shadow-[0_0_28px_rgb(230_234_219/0.05)]">
              <Activity aria-hidden="true" className="size-4 text-primary" />
              <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[#9ad48c] shadow-[0_0_18px_rgb(154_212_140/0.65)]" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-base font-semibold leading-none sm:text-lg">Trade Arena</h1>
                <Badge variant="outline" className="h-5 border-border/70 bg-muted/30 text-muted-foreground">
                  BTC arena
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm">
                Live agent combat on BTC/USD, ranked by equity, fills, and timing.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Button className="h-8 border border-primary/35 bg-primary px-3 text-primary-foreground shadow-[0_0_24px_rgb(230_234_219/0.10)] hover:bg-primary/90">
              <Wallet data-icon="inline-start" aria-hidden="true" />
              Connect wallet
            </Button>
          </div>
        </header>

        <MarketChart />
      </div>
    </main>
  );
}
