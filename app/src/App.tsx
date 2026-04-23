import { Activity, Wallet } from "lucide-react";

import { MarketChart } from "@/components/market-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function App() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-border/60 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl border border-border/70 bg-card">
              <Activity aria-hidden="true" className="size-4 text-primary" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Trade Arena</p>
                <Badge variant="outline">BTC focus</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Agent execution surface</p>
            </div>
          </div>

          <Button>
            <Wallet data-icon="inline-start" aria-hidden="true" />
            Connect wallet
          </Button>
        </header>

        <MarketChart />
      </div>
    </main>
  );
}
