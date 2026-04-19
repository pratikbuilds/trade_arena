import { MoonStar, Radar, SunMedium, Wallet } from "lucide-react";
import { Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark";

const navItems: Array<{ label: string; to: "/" | "/games" | "/integrations" }> = [
  { label: "Overview", to: "/" },
  { label: "Games", to: "/games" },
  { label: "Integration", to: "/integrations" },
];

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem("trade-arena-theme");

  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function RootRouteShell() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("trade-arena-theme", theme);
  }, [theme]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,_color-mix(in_srgb,var(--accent)_18%,transparent),transparent_45%)]"
      />
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-sm">
              <Radar aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-medium">Trade Arena</p>
              <p className="truncate text-sm text-muted-foreground">
                Design shell for program-facing gameplay
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "rounded-full px-4 text-sm")}
                activeProps={{
                  className: cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "rounded-full bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
                  ),
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="hidden rounded-full px-3 py-1 md:inline-flex">
              devnet only
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              onClick={() => {
                setTheme((currentTheme) => (currentTheme === "light" ? "dark" : "light"));
              }}
            >
              {theme === "light" ? <MoonStar aria-hidden="true" /> : <SunMedium aria-hidden="true" />}
            </Button>
            <Button type="button" variant="secondary" size="sm">
              <Wallet data-icon="inline-start" aria-hidden="true" />
              Wallet soon
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <Outlet />
      </main>
    </div>
  );
}
