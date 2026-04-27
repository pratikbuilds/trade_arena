import { LayoutDashboard, Swords, Wallet } from "lucide-react";
import { useState } from "react";

import { AdminDashboard } from "@/components/admin-dashboard";
import { MarketChart } from "@/components/market-chart";
import { Button } from "@/components/ui/button";

export default function App() {
  const [activeView, setActiveView] = useState<"arena" | "admin">("arena");

  return (
    <main
      className={`arena-shell min-h-svh overflow-x-hidden bg-background text-foreground ${
        activeView === "arena" ? "lg:h-screen lg:overflow-hidden" : ""
      }`}
    >
      <div
        className={`mx-auto flex min-h-svh w-full max-w-[1560px] flex-col gap-2.5 px-3 py-2.5 sm:px-5 lg:px-6 ${
          activeView === "arena" ? "lg:h-screen lg:min-h-0" : ""
        }`}
      >
        <header className="grid gap-3 pb-1 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex size-11 items-center justify-center overflow-hidden rounded-[6px] bg-[#020403] shadow-[0_0_24px_rgb(230_234_219/0.08)]">
              <img
                src="/trade-arena-logo.svg"
                alt=""
                aria-hidden="true"
                className="size-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-base font-semibold leading-none sm:text-lg">Trade Arena</h1>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="grid grid-cols-2 rounded-[4px] border border-border/70 bg-background/45 p-0.5">
              <Button
                aria-pressed={activeView === "arena"}
                className={`h-7 px-2 text-xs ${
                  activeView === "arena"
                    ? "bg-muted text-foreground hover:bg-muted"
                    : "bg-transparent text-muted-foreground hover:bg-muted/55"
                }`}
                onClick={() => setActiveView("arena")}
                type="button"
                variant="ghost"
              >
                <Swords data-icon="inline-start" aria-hidden="true" />
                Arena
              </Button>
              <Button
                aria-pressed={activeView === "admin"}
                className={`h-7 px-2 text-xs ${
                  activeView === "admin"
                    ? "bg-muted text-foreground hover:bg-muted"
                    : "bg-transparent text-muted-foreground hover:bg-muted/55"
                }`}
                onClick={() => setActiveView("admin")}
                type="button"
                variant="ghost"
              >
                <LayoutDashboard data-icon="inline-start" aria-hidden="true" />
                Admin
              </Button>
            </div>
            <Button className="h-8 border border-primary/35 bg-primary px-3 text-primary-foreground shadow-[0_0_24px_rgb(230_234_219/0.10)] hover:bg-primary/90">
              <Wallet data-icon="inline-start" aria-hidden="true" />
              Connect wallet
            </Button>
          </div>
        </header>

        {activeView === "arena" ? <MarketChart /> : <AdminDashboard />}
      </div>
    </main>
  );
}
