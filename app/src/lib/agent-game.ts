export type AgentSide = "long" | "short";

export type AgentTrade = {
  id: string;
  cycle: number;
  side: AgentSide;
  notionalUsd: number;
  sizeBtc: number;
  entryPrice: number;
  exitPrice: number;
  pnlUsd: number;
  openTx: string;
  closeTx: string;
  openOffsetSeconds: number;
  closeOffsetSeconds: number;
};

export type ArenaAgent = {
  id: string;
  name: string;
  handle: string;
  thesis: string;
  color: string;
  player: string;
  session: string;
  virtualCashUsd: number;
  realizedPnlUsd: number;
  trades: AgentTrade[];
};

export const DEVNET_GAME = {
  id: "198873298",
  gamePda: "D5h2BRa3Lacaxe3Zh7bHcTmDkBUgUrt8aQtj3NJPwXAu",
  createGameTx:
    "W2CZX9hjgdaZ3UdKHjJL7bSufBpmCfRz8eX9z2YMP7bf7XsFsvfF7FnpGwtS7N51MTh5h1qRyjCNnVrbzVaRi8Q",
  startedAtLabel: "MCP devnet run",
};

export const AGENTS: ArenaAgent[] = [
  {
    id: "alpha",
    name: "Agent Alpha",
    handle: "Momentum buyer",
    thesis: "Opened long first, then flipped into a short scalp.",
    color: "#e11d48",
    player: "4obApEoiDuUgw7cVeQ76KmQV2QNtW69XfqJRc5Zc1qLX",
    session: "2zphhDy9nm4gDvuiK6pukgBCkASEUsCL9cFpCYoBhuLo",
    virtualCashUsd: 10_000.02,
    realizedPnlUsd: 0.017939,
    trades: [
      {
        id: "alpha-1",
        cycle: 1,
        side: "long",
        notionalUsd: 900,
        sizeBtc: 0.011532,
        entryPrice: 78_038.49,
        exitPrice: 78_039.99,
        pnlUsd: 0.017321,
        openOffsetSeconds: -1_080,
        closeOffsetSeconds: -900,
        openTx:
          "aPVBcTrwdeGZ7UxUnXbfmTJbhVzE8nBwuaL5guxjJYkja61iZW3Q3DBHPNgcUAvpSAsR5J77X6jhEvtqNR4nBvY",
        closeTx:
          "2siURWuNygah6iMMCbAvWzz3QDRYJE4vvuT9bMPq3dJLUpEVnCa5sggDKzgVeFoJ4fXyRCXQGqqAfFwzNsozKHtQ",
      },
      {
        id: "alpha-2",
        cycle: 2,
        side: "short",
        notionalUsd: 650,
        sizeBtc: 0.008329,
        entryPrice: 78_039.96,
        exitPrice: 78_039.88,
        pnlUsd: 0.000618,
        openOffsetSeconds: -480,
        closeOffsetSeconds: -300,
        openTx:
          "4kqyTL3XGuR7xMRugjtzqSVEQuWWegmLzsWWSnEN1CKCRxwKCcrQA8cYLYw5b9ETfJLcRBa91nNPEN1q1pfoy621",
        closeTx:
          "2EmRMxQ2vQBaXdATzRzun7h6NVx8U24KJKWUxVEtu1UL1EH7yPD9GbrsMyi34ksJzJ14n1rfEX2kXaWFrXVMk5Jj",
      },
    ],
  },
  {
    id: "beta",
    name: "Agent Beta",
    handle: "Contrarian seller",
    thesis: "Sold first, then faded into a long reversal.",
    color: "#0891b2",
    player: "6zeFcVzUo2gCEETj4SK3YDnAgY3e4N1SL1JwszQyhZeF",
    session: "2V2E1KeSmQXGkC8kUfuiMqKmnyZEVP4GzefYQoURiTst",
    virtualCashUsd: 9_999.98,
    realizedPnlUsd: -0.016857,
    trades: [
      {
        id: "beta-1",
        cycle: 1,
        side: "short",
        notionalUsd: 800,
        sizeBtc: 0.010251,
        entryPrice: 78_038.49,
        exitPrice: 78_039.98,
        pnlUsd: -0.015254,
        openOffsetSeconds: -1_140,
        closeOffsetSeconds: -960,
        openTx:
          "jgwJ13QNpHTV6AUSh4zmpHKoPXSJvcX5rHSMkmFPZZHhepEHpHtSqPy3JrNDNNYAiy1yjc9s7nZqJndCu7MK2er",
        closeTx:
          "HxwtBKuqMxfPBLPo9iuhCE85SdvqZrRrEmoSX3MgM7CKVvePKGDS5kFcT1sHuW51v3CDzqzGoWFoYxPBjTAQxLW",
      },
      {
        id: "beta-2",
        cycle: 2,
        side: "long",
        notionalUsd: 700,
        sizeBtc: 0.008969,
        entryPrice: 78_039.96,
        exitPrice: 78_039.78,
        pnlUsd: -0.001603,
        openOffsetSeconds: -600,
        closeOffsetSeconds: -420,
        openTx:
          "5PrwJNavNm6VeWsA36BLuQxwSV3H5GBH7rvUQcXTYHiyr9Qapn3vfM27hKcEV1X1cEnF6tCkxWe7LxPYMLQE1Mrk",
        closeTx:
          "3CZer5jK2ghCWhNsriaAQGoFfqcGa4tox3rF8eZZbHtkdAKZey9zG6fBrxJXBVBvNKoxEGfSVrjyrFruUitbb6UX",
      },
    ],
  },
  {
    id: "gamma",
    name: "Agent Gamma",
    handle: "Small scalper",
    thesis: "Lower notional, quick in-and-out execution.",
    color: "#16a34a",
    player: "DdPFAJDND3j5Z9HofyokCbBuwXqGT34zkmkJ5tuvBgVG",
    session: "5AFXKjzT1vhLrH4m1RUa5VXfxvj59bqNuN8cGPYcZhWk",
    virtualCashUsd: 10_000.01,
    realizedPnlUsd: 0.00669,
    trades: [
      {
        id: "gamma-1",
        cycle: 1,
        side: "long",
        notionalUsd: 350,
        sizeBtc: 0.004484,
        entryPrice: 78_038.64,
        exitPrice: 78_039.98,
        pnlUsd: 0.006003,
        openOffsetSeconds: -1_020,
        closeOffsetSeconds: -840,
        openTx:
          "2tigGVYDgsk4JjdpQxXFj58iWohX5g1rjGow3VfvU5RghaM9gNyL3yPgmX4ivzhiAGL6x5d5vQWjUL5dExp3SFsP",
        closeTx:
          "2FVmoD72UvFwdA9A5M1X3tx63iqeemGVG8CZLLGSxjQ9UT2zYb3Tjq3SfT3B8MMyLoiEQZCLk141NQsBsbReYTtj",
      },
      {
        id: "gamma-2",
        cycle: 2,
        side: "short",
        notionalUsd: 300,
        sizeBtc: 0.003844,
        entryPrice: 78_039.96,
        exitPrice: 78_039.78,
        pnlUsd: 0.000687,
        openOffsetSeconds: -660,
        closeOffsetSeconds: -360,
        openTx:
          "2tysbwLWpDqpPZdwxW4nHmnyxCRBb8SjgKHg5ycT4pYRofGZk6JLHmNNhKFy5naQrG9RLC2XoqfAfxL5rvsrmXbf",
        closeTx:
          "DsSJdaK3NAtCU3yg31ur61wE7X5dA1FSMBcJc7ZNcptwUhKhddaehtxo8doUZ2YfNFStnkAYrQoEvcrKLF8TEYo",
      },
    ],
  },
];

export function explorerTxUrl(tx: string) {
  return `https://explorer.solana.com/tx/${tx}?customUrl=${encodeURIComponent(
    "https://devnet.magicblock.app"
  )}`;
}

export function devnetTxUrl(tx: string) {
  return `https://explorer.solana.com/tx/${tx}?cluster=devnet`;
}
