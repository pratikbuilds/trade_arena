import {
  CheckCircle2,
  Clipboard,
  Coins,
  Copy,
  FileCode2,
  Flag,
  Play,
  Plus,
  Radio,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AdminGameSetup = {
  id: string;
  arenaName: string;
  gameId: string;
  assetSymbol: string;
  assetFeed: string;
  tokenMint: string;
  entryFeeUsdc: number;
  durationSeconds: number;
  maxPlayers: number;
  adminWallet: string;
  playerInvites: string[];
  notes: string;
  createdAt: string;
};

const DEFAULT_SETUP: Omit<AdminGameSetup, "id" | "createdAt"> = {
  arenaName: "Main Arena",
  gameId: String(Date.now() % 1_000_000),
  assetSymbol: "BTC / USD",
  assetFeed: "Pyth Lazer price feed public key",
  tokenMint: "USDC mint public key",
  entryFeeUsdc: 10,
  durationSeconds: 900,
  maxPlayers: 8,
  adminWallet: "Creator wallet public key",
  playerInvites: ["Agent Alpha", "Agent Beta"],
  notes: "",
};

const FLOW_STEPS = [
  {
    icon: Settings2,
    label: "Configure",
    detail: "Set creator, asset feed, token mint, entry fee, duration, and player cap.",
    status: "Ready",
  },
  {
    icon: Coins,
    label: "Create game",
    detail: "Call create_game on the base layer and initialize the prize vault.",
    status: "Admin signs",
  },
  {
    icon: Users,
    label: "Join players",
    detail: "Players pay the entry fee, receive virtual cash, and create session keys.",
    status: "Players sign",
  },
  {
    icon: Radio,
    label: "Delegate",
    detail: "Delegate game and player state to the Ephemeral Rollup for trading.",
    status: "Operator",
  },
  {
    icon: Play,
    label: "Start",
    detail: "Call start_game after the minimum player count has joined.",
    status: "Admin signs",
  },
  {
    icon: Flag,
    label: "Settle",
    detail: "End the match, commit state, and make the prize claimable.",
    status: "Final",
  },
] as const;

function fieldId(name: keyof Omit<AdminGameSetup, "id" | "createdAt" | "playerInvites">) {
  return `admin-${name}`;
}

function formNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function setupToJson(setup: AdminGameSetup) {
  return JSON.stringify(
    {
      arena: {
        name: setup.arenaName,
        game_id: setup.gameId,
        creator: setup.adminWallet,
        asset_symbol: setup.assetSymbol,
        asset_feed: setup.assetFeed,
        token_mint: setup.tokenMint,
        entry_fee_usdc: setup.entryFeeUsdc,
        duration_seconds: setup.durationSeconds,
        max_players: setup.maxPlayers,
      },
      flow: [
        "create_game",
        "join_game",
        "create_session",
        "delegate_player",
        "delegate_game",
        "start_game",
        "end_game",
        "claim_prize",
      ],
      player_invites: setup.playerInvites,
      notes: setup.notes,
    },
    null,
    2
  );
}

function SetupField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function AdminDashboard() {
  const [draft, setDraft] = useState(DEFAULT_SETUP);
  const [setups, setSetups] = useState<AdminGameSetup[]>([]);
  const [copied, setCopied] = useState(false);

  const currentSetup = useMemo<AdminGameSetup>(
    () => ({
      ...draft,
      id: `setup-${draft.gameId || "draft"}`,
      createdAt: new Date().toISOString(),
    }),
    [draft]
  );
  const setupJson = useMemo(() => setupToJson(currentSetup), [currentSetup]);
  const prizePool = draft.entryFeeUsdc * Math.max(2, draft.maxPlayers);

  function updateDraft<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function createSetup() {
    const setup: AdminGameSetup = {
      ...currentSetup,
      id: `setup-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    setSetups((current) => [setup, ...current].slice(0, 5));
  }

  function copySetup() {
    setCopied(true);
    void navigator.clipboard?.writeText(setupJson).finally(() => {
      window.setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <section className="grid gap-3 pb-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
      <div className="grid gap-3">
        <Card className="bg-card/88">
          <CardHeader className="border-b border-border/65 pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
                  Admin dashboard
                </CardTitle>
                <CardDescription>
                  Build a reusable game setup for the arena admin flow.
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-border/70 bg-background/45 text-muted-foreground">
                Draft setup
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 pt-1">
            <div className="grid gap-3 md:grid-cols-2">
              <SetupField label="Arena name">
                <Input
                  id={fieldId("arenaName")}
                  value={draft.arenaName}
                  onChange={(event) => updateDraft("arenaName", event.target.value)}
                />
              </SetupField>
              <SetupField label="Game ID">
                <Input
                  id={fieldId("gameId")}
                  value={draft.gameId}
                  onChange={(event) => updateDraft("gameId", event.target.value)}
                />
              </SetupField>
              <SetupField label="Asset symbol">
                <Input
                  id={fieldId("assetSymbol")}
                  value={draft.assetSymbol}
                  onChange={(event) => updateDraft("assetSymbol", event.target.value)}
                />
              </SetupField>
              <SetupField label="Asset feed">
                <Input
                  id={fieldId("assetFeed")}
                  value={draft.assetFeed}
                  onChange={(event) => updateDraft("assetFeed", event.target.value)}
                />
              </SetupField>
              <SetupField label="Token mint">
                <Input
                  id={fieldId("tokenMint")}
                  value={draft.tokenMint}
                  onChange={(event) => updateDraft("tokenMint", event.target.value)}
                />
              </SetupField>
              <SetupField label="Creator wallet">
                <Input
                  id={fieldId("adminWallet")}
                  value={draft.adminWallet}
                  onChange={(event) => updateDraft("adminWallet", event.target.value)}
                />
              </SetupField>
              <SetupField label="Entry fee (USDC)">
                <Input
                  id={fieldId("entryFeeUsdc")}
                  min={0.01}
                  step={0.01}
                  type="number"
                  value={draft.entryFeeUsdc}
                  onChange={(event) =>
                    updateDraft("entryFeeUsdc", formNumber(event.target.value, 0))
                  }
                />
              </SetupField>
              <SetupField label="Duration">
                <select
                  id={fieldId("durationSeconds")}
                  className="h-8 w-full rounded-[4px] border border-input bg-input/30 px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={draft.durationSeconds}
                  onChange={(event) =>
                    updateDraft("durationSeconds", formNumber(event.target.value, 900))
                  }
                >
                  <option value={300}>5 minutes</option>
                  <option value={900}>15 minutes</option>
                </select>
              </SetupField>
              <SetupField label="Max players">
                <Input
                  id={fieldId("maxPlayers")}
                  min={2}
                  step={1}
                  type="number"
                  value={draft.maxPlayers}
                  onChange={(event) =>
                    updateDraft("maxPlayers", formNumber(event.target.value, 2))
                  }
                />
              </SetupField>
              <SetupField label="Player invites">
                <Input
                  value={draft.playerInvites.join(", ")}
                  onChange={(event) =>
                    updateDraft(
                      "playerInvites",
                      event.target.value
                        .split(",")
                        .map((invite) => invite.trim())
                        .filter(Boolean)
                    )
                  }
                />
              </SetupField>
            </div>

            <SetupField label="Notes">
              <textarea
                className="min-h-20 w-full resize-y rounded-[4px] border border-input bg-input/30 px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder="Operator notes, tournament label, or risk limits."
                value={draft.notes}
                onChange={(event) => updateDraft("notes", event.target.value)}
              />
            </SetupField>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-[4px] border border-border/70 bg-background/45 px-2.5 py-2">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Prize cap</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold">${prizePool.toFixed(2)}</p>
                </div>
                <div className="rounded-[4px] border border-border/70 bg-background/45 px-2.5 py-2">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Players</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold">{draft.playerInvites.length}/{draft.maxPlayers}</p>
                </div>
                <div className="rounded-[4px] border border-border/70 bg-background/45 px-2.5 py-2">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Duration</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold">{draft.durationSeconds / 60}m</p>
                </div>
              </div>
              <Button className="h-9 px-3" onClick={createSetup} type="button">
                <Plus data-icon="inline-start" aria-hidden="true" />
                Create setup
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/88">
          <CardHeader className="border-b border-border/65 pb-4">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />
              Admin flow
            </CardTitle>
            <CardDescription>
              The operational checklist follows the on-chain game lifecycle.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 pt-1 md:grid-cols-2">
            {FLOW_STEPS.map((step, index) => {
              const Icon = step.icon;

              return (
                <div
                  className="grid grid-cols-[auto_1fr_auto] gap-3 rounded-[4px] border border-border/65 bg-background/40 px-3 py-3"
                  key={step.label}
                >
                  <div className="flex size-8 items-center justify-center rounded-[4px] border border-border/65 bg-muted/35">
                    <Icon aria-hidden="true" className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{index + 1}. {step.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
                  </div>
                  <Badge variant="outline" className="border-border/70 bg-background/45 text-muted-foreground">
                    {step.status}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid content-start gap-3">
        <Card className="bg-card/88">
          <CardHeader className="border-b border-border/65 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileCode2 aria-hidden="true" className="size-4 text-primary" />
                  Setup payload
                </CardTitle>
                <CardDescription>
                  Use this payload to hand off the prepared game config.
                </CardDescription>
              </div>
              <Button className="h-8 px-2" onClick={copySetup} type="button" variant="outline">
                {copied ? (
                  <CheckCircle2 data-icon="inline-start" aria-hidden="true" />
                ) : (
                  <Copy data-icon="inline-start" aria-hidden="true" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            <pre className="max-h-[520px] overflow-auto rounded-[4px] border border-border/65 bg-background/62 p-3 font-mono text-[11px] leading-5 text-muted-foreground">
              {setupJson}
            </pre>
          </CardContent>
        </Card>

        <Card className="bg-card/88">
          <CardHeader className="border-b border-border/65 pb-4">
            <CardTitle className="flex items-center gap-2">
              <Clipboard aria-hidden="true" className="size-4 text-primary" />
              Created setups
            </CardTitle>
            <CardDescription>
              Recent local setup drafts from this session.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 pt-1">
            {setups.length === 0 ? (
              <div className="rounded-[4px] border border-dashed border-border/70 bg-background/35 px-3 py-6 text-center text-sm text-muted-foreground">
                No game setup has been created yet.
              </div>
            ) : (
              setups.map((setup) => (
                <button
                  className="selectable-row grid gap-1 rounded-[4px] border border-border/65 bg-background/40 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                  key={setup.id}
                  onClick={() =>
                    setDraft({
                      arenaName: setup.arenaName,
                      gameId: setup.gameId,
                      assetSymbol: setup.assetSymbol,
                      assetFeed: setup.assetFeed,
                      tokenMint: setup.tokenMint,
                      entryFeeUsdc: setup.entryFeeUsdc,
                      durationSeconds: setup.durationSeconds,
                      maxPlayers: setup.maxPlayers,
                      adminWallet: setup.adminWallet,
                      playerInvites: setup.playerInvites,
                      notes: setup.notes,
                    })
                  }
                  type="button"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold">{setup.arenaName}</span>
                    <span className="font-mono text-xs text-muted-foreground">#{setup.gameId}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {setup.assetSymbol} · {setup.durationSeconds / 60}m · {setup.maxPlayers} players
                  </span>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
