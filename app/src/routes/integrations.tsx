import { Code2, DatabaseZap, ShieldCheck, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const integrationCards = [
  {
    title: "Wallet session boundary",
    body: "Keep connection state, wallet copy, and future transaction prompts in a dedicated surface so read-only exploration stays clean.",
    icon: Wallet,
  },
  {
    title: "Program read client",
    body: "Replace the mock query layer with an adapter that fetches room state, standings, and settlement metadata from the program stack.",
    icon: DatabaseZap,
  },
  {
    title: "Trust and failure handling",
    body: "Decode simulation failures, surface oracle sources, and keep retry states visible instead of hiding them behind opaque toasts.",
    icon: ShieldCheck,
  },
  {
    title: "View-model composition",
    body: "Keep raw program data out of route components. Shape it once so UI copy and layout can evolve independently from on-chain models.",
    icon: Code2,
  },
];

export function IntegrationsRoute() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Card className="border border-border py-0">
        <CardHeader className="gap-4 border-b border-border/70 py-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="rounded-full px-3 py-1">
              integration roadmap
            </Badge>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              read layer first
            </Badge>
          </div>
          <CardTitle className="text-3xl sm:text-4xl">Where the UI meets the program next.</CardTitle>
          <CardDescription className="max-w-3xl text-base">
            The shell is deliberately split so mock data can be replaced with program reads and wallet state without reworking the route composition or visual language.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 py-6 lg:grid-cols-2">
          {integrationCards.map(({ body, icon: Icon, title }) => (
            <div key={title} className="rounded-[1.4rem] border border-border/80 bg-background p-5">
              <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-border bg-card text-primary">
                <Icon aria-hidden="true" />
              </div>
              <p className="text-lg font-medium">{title}</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
