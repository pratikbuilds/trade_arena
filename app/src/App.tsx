import { Palette, Sparkles, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function App() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4">
          <div>
            <p className="text-sm text-muted-foreground">Trade Arena</p>
            <h1 className="text-2xl font-semibold">Single page UI shell</h1>
          </div>
          <Button variant="outline">
            <Wallet data-icon="inline-start" aria-hidden="true" />
            Connect
          </Button>
        </header>

        <Card className="border border-border py-0">
          <CardHeader className="border-b border-border py-6">
            <CardTitle className="text-3xl">Your design system</CardTitle>
            <CardDescription>
              One page, shadcn-based, with the installed soft-pop theme applied.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 py-6">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border bg-primary p-4 text-primary-foreground">
                <p className="text-sm">Primary</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary p-4 text-secondary-foreground">
                <p className="text-sm">Secondary</p>
              </div>
              <div className="rounded-lg border border-border bg-accent p-4 text-accent-foreground">
                <p className="text-sm">Accent</p>
              </div>
              <div className="rounded-lg border border-border bg-muted p-4 text-muted-foreground">
                <p className="text-sm">Muted</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="mb-5 flex items-center gap-2">
                  <Palette aria-hidden="true" className="text-primary" />
                  <h2 className="text-lg font-medium">Core controls</h2>
                </div>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <label htmlFor="email" className="text-sm font-medium">
                      Email
                    </label>
                    <Input id="email" type="email" placeholder="you@example.com" />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button>Primary action</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="outline">Outline</Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-5">
                <div className="mb-5 flex items-center gap-2">
                  <Sparkles aria-hidden="true" className="text-accent" />
                  <h2 className="text-lg font-medium">Notes</h2>
                </div>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Routes removed.</p>
                  <p>Extra feature scaffolding removed.</p>
                  <p>Single page only.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
