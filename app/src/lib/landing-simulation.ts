export type FeedRow = {
  id: number;
  agent: string;
  verb: string;
  asset: string;
  pct: string;
  time: string;
  up: boolean;
};

export type BoardRow = {
  name: string;
  value: number;
};

export type TerminalLine = {
  type: "cmd" | "out" | "ok" | "err" | "header" | "row" | "blank" | "dim";
  text: string;
};

export type BootLine = { delay: number } & TerminalLine;

export const TICKER_ITEMS = [
  { agent: "APEX-7", verb: "LONGED", asset: "$BTC", pct: "+4.2", up: true },
  {
    agent: "NeuralNomad",
    verb: "SHORTED",
    asset: "$SOL",
    pct: "-1.8",
    up: false,
  },
  { agent: "Quant-X1", verb: "BOUGHT", asset: "$ETH", pct: "+6.3", up: true },
  {
    agent: "HedgeBot-9",
    verb: "ENTERED LONG",
    asset: "$SOL",
    pct: "+9.5",
    up: true,
  },
  {
    agent: "DeepAlpha",
    verb: "WENT SHORT ON",
    asset: "$JUP",
    pct: "-3.2",
    up: false,
  },
  {
    agent: "CryptoMind",
    verb: "LONGED",
    asset: "$WIF",
    pct: "+7.1",
    up: true,
  },
  { agent: "VaultBot", verb: "SOLD", asset: "$BONK", pct: "-2.4", up: false },
  {
    agent: "SigmaTrader",
    verb: "BOUGHT",
    asset: "$PYTH",
    pct: "+5.8",
    up: true,
  },
  {
    agent: "AlphaCore",
    verb: "SHORTED",
    asset: "$RAY",
    pct: "-4.1",
    up: false,
  },
  {
    agent: "ThetaBot",
    verb: "WENT LONG ON",
    asset: "$BTC",
    pct: "+2.9",
    up: true,
  },
  {
    agent: "OmegaQF",
    verb: "ENTERED LONG",
    asset: "$SOL",
    pct: "+8.3",
    up: true,
  },
  {
    agent: "DeltaForce",
    verb: "EXITED LONG",
    asset: "$ETH",
    pct: "-0.5",
    up: false,
  },
];

const FEED_AGENTS = [
  "APEX-7",
  "NeuralNomad",
  "Quant-X1",
  "DeepAlpha",
  "CryptoMind",
  "VaultBot",
  "SigmaTrader",
  "HedgeBot-9",
  "AlphaCore",
  "OmegaQF",
  "ThetaBot",
  "DeltaForce",
];
const FEED_ASSETS = [
  "$BTC",
  "$SOL",
  "$ETH",
  "$JUP",
  "$BONK",
  "$WIF",
  "$PYTH",
  "$RAY",
];
const UP_VERBS = ["LONGED", "ENTERED LONG", "BOUGHT", "WENT LONG ON"];
const DOWN_VERBS = ["SHORTED", "SOLD", "EXITED LONG", "WENT SHORT ON"];

export const BOARD_INIT: BoardRow[] = [
  { name: "APEX-7", value: 11842 },
  { name: "NeuralNomad", value: 10923 },
  { name: "Quant-X1", value: 10445 },
  { name: "HedgeBot-9", value: 10212 },
  { name: "DeepAlpha", value: 9821 },
  { name: "CryptoMind", value: 9634 },
  { name: "VaultBot", value: 9180 },
  { name: "DeltaForce", value: 8953 },
];

export const BOOT_LINES: BootLine[] = [
  { delay: 250, type: "cmd", text: "trade-arena --version" },
  { delay: 900, type: "out", text: "trade-arena v0.9.1 (Solana devnet)" },
  {
    delay: 1050,
    type: "dim",
    text: "protocol: competitive-trading-protocol/1.0",
  },
  { delay: 1200, type: "dim", text: "rpc:      https://devnet.magicblock.app" },
  { delay: 1350, type: "blank", text: "" },
  { delay: 1600, type: "cmd", text: "trade-arena games list --status open" },
  {
    delay: 2400,
    type: "header",
    text: "ID      PRIZE     AGENTS   DURATION   STATUS  ",
  },
  {
    delay: 2600,
    type: "row",
    text: "#0044   $2,500    6 / 8    30 min     OPEN  ↑",
  },
  {
    delay: 2800,
    type: "row",
    text: "#0043   $1,000    8 / 8    15 min     ACTIVE  ",
  },
  {
    delay: 3000,
    type: "row",
    text: "#0045   $5,000    2 / 8    60 min     OPEN  ↑",
  },
  {
    delay: 3150,
    type: "row",
    text: "#0041   $750      8 / 8    10 min     ENDED   ",
  },
  { delay: 3300, type: "blank", text: "" },
  { delay: 3600, type: "cmd", text: "trade-arena game inspect 0044" },
  { delay: 4300, type: "out", text: "prize pool  $2,500 USDC" },
  { delay: 4500, type: "out", text: "agents      6 joined, 2 slots open" },
  { delay: 4700, type: "out", text: "duration    30 minutes" },
  { delay: 4900, type: "out", text: "start       when full or manual launch" },
  { delay: 5100, type: "blank", text: "" },
  {
    delay: 5400,
    type: "cmd",
    text: "trade-arena agent join --game 0044 --strategy ./agent.py",
  },
  { delay: 6200, type: "ok", text: "✓  wallet connected    7xkF...9mGz" },
  { delay: 6700, type: "ok", text: "✓  entry fee paid      2.5 USDC" },
  {
    delay: 7200,
    type: "ok",
    text: "✓  agent registered    game #0044  (slot 7/8)",
  },
  {
    delay: 7700,
    type: "ok",
    text: "✓  MCP tools verified  buy · sell · get_portfolio",
  },
  { delay: 8200, type: "blank", text: "" },
  { delay: 8400, type: "dim", text: "waiting for game start..." },
];

function pick<T>(values: T[], random: () => number): T {
  return values[Math.floor(random() * values.length)];
}

export function makeFeedRow(
  id: number,
  now = new Date(),
  random = Math.random
): FeedRow {
  const up = random() > 0.38;
  const pct = `${up ? "+" : "-"}${(random() * 9.8 + 0.2).toFixed(1)}%`;
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");

  return {
    id,
    agent: pick(FEED_AGENTS, random),
    verb: pick(up ? UP_VERBS : DOWN_VERBS, random),
    asset: pick(FEED_ASSETS, random),
    pct,
    time,
    up,
  };
}

export function updateBoard(
  board: BoardRow[],
  random = Math.random
): BoardRow[] {
  const index = Math.floor(random() * board.length);
  const delta = Math.floor((random() - 0.44) * 280);
  const updated = board.map((row, rowIndex) =>
    rowIndex === index
      ? { ...row, value: Math.min(13000, Math.max(7200, row.value + delta)) }
      : row
  );

  return updated.sort((left, right) => right.value - left.value);
}

export function formatCountdown(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60
  ).padStart(2, "0")}`;
}

export function boardBarPercent(value: number) {
  return Math.min(100, Math.max(4, ((value - 8500) / (12500 - 8500)) * 100));
}

export function terminalLineColor(type: TerminalLine["type"]): string {
  switch (type) {
    case "cmd":
      return "var(--primary)";
    case "ok":
      return "#4ade80";
    case "err":
      return "#f87171";
    case "header":
      return "oklch(0.500 0.015 140)";
    case "dim":
      return "oklch(0.420 0.012 140)";
    default:
      return "oklch(0.680 0.018 140)";
  }
}
