import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { RootRouteShell } from "@/routes/__root";
import { GameDetailRoute } from "@/routes/games.$gameId";
import { GamesRoute } from "@/routes/games";
import { DashboardRoute } from "@/routes/index";
import { IntegrationsRoute } from "@/routes/integrations";

const rootRoute = createRootRoute({
  component: RootRouteShell,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardRoute,
});

const gamesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/games",
  component: GamesRoute,
});

const gameDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/games/$gameId",
  component: GameDetailRoute,
});

const integrationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/integrations",
  component: IntegrationsRoute,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  gamesRoute,
  gameDetailRoute,
  integrationsRoute,
]);

export const router = createRouter({
  routeTree,
  scrollRestoration: true,
  defaultPreload: "intent",
  defaultNotFoundComponent: () => (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-20 text-center sm:px-6 lg:px-8">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Route not found
      </p>
      <h1 className="text-3xl font-medium">This arena page does not exist yet.</h1>
      <p className="text-base text-muted-foreground">
        The UI shell is in exploration mode. Use the main navigation to inspect the routes that are already wired.
      </p>
    </div>
  ),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
