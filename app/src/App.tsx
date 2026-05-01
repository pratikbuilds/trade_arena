import { AppHeader } from "@/components/app-header";
import { MarketChart } from "@/components/market-chart";
import { GameDiscovery } from "@/routes/game-discovery";
import { Landing1 } from "@/routes/landing1";
import { Landing2 } from "@/routes/landing2";
import { useRoute } from "@/routes/router";

export default function App() {
  const [route, navigate] = useRoute();

  if (route.name === "landing1") return <Landing1 onNavigate={navigate} />;
  if (route.name === "landing2") return <Landing2 onNavigate={navigate} />;

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
