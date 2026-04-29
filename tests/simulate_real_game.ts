// ═══════════════════════════════════════════════════════════════════════════
// Trade Arena — Real Multi-Trade Simulation
// ═══════════════════════════════════════════════════════════════════════════
//
// This harness runs a real devnet + MagicBlock ER game and replaces the
// previous hand-authored timeline with a live trading loop:
//   • same base-layer deposit / ER game / base-layer withdrawal flow
//   • same live Pyth Lazer BTC/USD oracle on the ER
//   • >10 completed trades per player
//   • per-trade ledger: side, size, entry, exit, hold time, pnl
//
// HOW TO RUN
// ──────────
//   1. anchor build -- --features testing
//   2. anchor deploy --provider.cluster devnet
//   3. ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//      ANCHOR_WALLET=~/.config/solana/id.json \
//      yarn ts-mocha -p ./tsconfig.json -t 1200000 tests/simulate_real_game.ts
//
// ═══════════════════════════════════════════════════════════════════════════

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import { TradeArena } from "../target/types/trade_arena";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  createTopUpEscrowInstruction,
  escrowPdaFromEscrowAuthority,
  GetCommitmentSignature,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { expect } from "chai";

const PYTH_LAZER_BTC_USD = new anchor.web3.PublicKey(
  "71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr"
);
const DELEGATION_PROGRAM_ID = new anchor.web3.PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);
const ER_ENDPOINT = "https://devnet.magicblock.app/";

const GAME_SEED = Buffer.from("game");
const PLAYER_SEED = Buffer.from("player");
const VAULT_SEED = Buffer.from("vault");

const DURATION = Number(process.env.SIM_DURATION_SECONDS ?? "900");
const ENTRY_FEE = 1_000_000;
const TARGET_TRADES_PER_PLAYER = Number(
  process.env.SIM_TARGET_TRADES_PER_PLAYER ?? "12"
);
const HOLD_MS = 6_000;
const PAUSE_BETWEEN_CYCLES_MS = 1_500;
const ENTRY_BUFFER_MS = 45_000;
const MIN_TRADE_NOTIONAL_USD = 150;
const MAX_TRADE_NOTIONAL_USD = 900;
const REPORT_PATH =
  process.env.SIM_REPORT_PATH ??
  path.join(
    process.cwd(),
    "artifacts",
    `simulation-instruction-log-${Date.now()}.md`
  );
const SIMULATION_SNAPSHOT_PATH =
  process.env.SIMULATION_SNAPSHOT_PATH ??
  path.join(process.cwd(), "artifacts", "simulation-arena-snapshot.json");

type SideArg = { long: {} } | { short: {} };
type ClusterKind = "devnet" | "magicblock-er";

type ParsedPlayerState = {
  virtualUsdc: bigint;
  positionSize: bigint;
  sideFlag: number;
  entryPrice: bigint;
  realizedPnl: bigint;
};

type TradeRecord = {
  player: string;
  cycle: number;
  side: "LONG" | "SHORT";
  sizeBtc: number;
  entryUsd: number;
  exitUsd?: number;
  collateralUsd: number;
  pnlUsd?: number;
  openedAtMs: number;
  closedAtMs?: number;
  openSig: string;
  closeSig?: string;
};

type StrategyDecision = {
  side: SideArg;
  notionalMicros: number;
  reason: string;
};

type TradingAgentConfig = {
  id: "alpha" | "beta" | "gamma";
  displayName: string;
  handle: string;
  thesis: string;
  color: string;
  decide: (
    priceHistory: number[],
    cycle: number,
    virtualUsdc: bigint
  ) => StrategyDecision;
};

type InstructionRecord = {
  atMs: number;
  step: string;
  cluster: ClusterKind;
  endpoint: string;
  sig: string;
  url: string;
  note?: string;
};

function u64Le(n: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
}

function findGamePDA(
  creator: anchor.web3.PublicKey,
  gameId: number,
  programId: anchor.web3.PublicKey
) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [GAME_SEED, creator.toBuffer(), u64Le(gameId)],
    programId
  );
}

function findPlayerStatePDA(
  game: anchor.web3.PublicKey,
  player: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey
) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [PLAYER_SEED, game.toBuffer(), player.toBuffer()],
    programId
  );
}

function findVaultPDA(
  game: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey
) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [VAULT_SEED, game.toBuffer()],
    programId
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseGameStartTime(data: Buffer): number {
  return Number(data.readBigInt64LE(96));
}

function findBufferPDA(account: anchor.web3.PublicKey): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), account.toBuffer()],
    DELEGATION_PROGRAM_ID
  )[0];
}

function elapsed(startMs: number): string {
  return `T+${Math.round((Date.now() - startMs) / 1000)}s`;
}

function fmtUsd(v: number): string {
  return v.toFixed(2);
}

function fmtBtc(v: number): string {
  return v.toFixed(4);
}

function txUrl(cluster: ClusterKind, sig: string): string {
  if (cluster === "devnet") {
    return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
  }

  return `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(
    ER_ENDPOINT
  )}`;
}

async function sendToER(
  erConn: anchor.web3.Connection,
  signer: anchor.web3.Keypair,
  tx: anchor.web3.Transaction
): Promise<string> {
  tx.feePayer = signer.publicKey;
  const { blockhash } = await erConn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(signer);
  return erConn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
}

async function confirmER(
  erConn: anchor.web3.Connection,
  sig: string
): Promise<void> {
  await erConn.confirmTransaction(sig, "confirmed");

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const statuses = await erConn.getSignatureStatuses([sig]);
    const status = statuses.value[0];
    if (status?.confirmationStatus) {
      if (status.err) {
        throw new Error(
          `ER transaction ${sig.slice(0, 12)} failed: ${JSON.stringify(
            status.err
          )}`
        );
      }
      return;
    }
    await sleep(500);
  }

  throw new Error(`ER confirm timeout for ${sig.slice(0, 12)}`);
}

async function waitForBaseAccount(
  baseConnection: anchor.web3.Connection,
  account: anchor.web3.PublicKey,
  label: string,
  timeoutMs = 60_000
): Promise<anchor.web3.AccountInfo<Buffer>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = await baseConnection.getAccountInfo(account, "confirmed");
    if (info) return info;
    await sleep(1_000);
  }

  throw new Error(`${label} did not appear on base layer in time`);
}

async function waitForOwner(
  connection: anchor.web3.Connection,
  account: anchor.web3.PublicKey,
  owner: anchor.web3.PublicKey,
  timeoutMs = 60_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = await connection.getAccountInfo(account, "confirmed");
    if (info?.owner.equals(owner)) return;
    await sleep(1_000);
  }

  throw new Error(
    `${account.toBase58()} did not return to owner ${owner.toBase58()}`
  );
}

async function ownerMatches(
  connection: anchor.web3.Connection,
  account: anchor.web3.PublicKey,
  owner: anchor.web3.PublicKey,
  timeoutMs = 60_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = await connection.getAccountInfo(account, "confirmed");
    if (info?.owner.equals(owner)) return true;
    await sleep(1_000);
  }

  return false;
}

async function finalizeUndelegationOnBase(args: {
  program: Program<TradeArena>;
  baseConnection: anchor.web3.Connection;
  erConnection: anchor.web3.Connection;
  payer: anchor.web3.PublicKey;
  programId: anchor.web3.PublicKey;
  baseAccount: anchor.web3.PublicKey;
  accountSeeds: Buffer[];
  erScheduleSig: string;
}): Promise<{ baseCommitSig: string | null; finalizeSig: string | null }> {
  const {
    program,
    baseConnection,
    erConnection,
    payer,
    programId,
    baseAccount,
    accountSeeds,
    erScheduleSig,
  } = args;
  const buffer = findBufferPDA(baseAccount);
  let baseCommitSig: string | null = null;
  try {
    baseCommitSig = await GetCommitmentSignature(erScheduleSig, erConnection);
    await baseConnection.confirmTransaction(baseCommitSig, "confirmed");
  } catch {}

  if (await ownerMatches(baseConnection, baseAccount, programId, 30_000)) {
    return { baseCommitSig, finalizeSig: null };
  }

  await waitForBaseAccount(
    baseConnection,
    buffer,
    "undelegation buffer",
    180_000
  );

  const finalizeSig = await program.methods
    .processUndelegation(accountSeeds)
    .accounts({
      baseAccount,
      buffer,
      payer,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  await waitForOwner(baseConnection, baseAccount, programId);
  return { baseCommitSig, finalizeSig };
}

function parsePlayerStateBuffer(data: Buffer): ParsedPlayerState | null {
  if (data.length < 106) return null;
  let off = 8 + 32 + 32;
  const virtualUsdc = data.readBigUInt64LE(off);
  off += 8;
  const positionSize = data.readBigUInt64LE(off);
  off += 8;
  const sideFlag = data[off];
  off += 1;
  const entryPrice = data.readBigUInt64LE(off);
  off += 8;
  const realizedPnl = data.readBigInt64LE(off);

  if (virtualUsdc === 0n) return null;

  return { virtualUsdc, positionSize, sideFlag, entryPrice, realizedPnl };
}

async function fetchPlayerState(
  ps: anchor.web3.PublicKey,
  erConnection: anchor.web3.Connection,
  baseConnection: anchor.web3.Connection
): Promise<ParsedPlayerState | null> {
  for (const conn of [erConnection, baseConnection]) {
    const acct = await conn.getAccountInfo(ps);
    if (!acct) continue;
    const parsed = parsePlayerStateBuffer(Buffer.from(acct.data));
    if (parsed) return parsed;
  }
  return null;
}

async function fetchLivePriceUsd(
  conn: anchor.web3.Connection,
  priceFeed: anchor.web3.PublicKey
): Promise<number> {
  const acct = await conn.getAccountInfo(priceFeed, "confirmed");
  if (!acct || acct.data.length < 134) {
    throw new Error("invalid live price feed account");
  }

  const data = Buffer.from(acct.data);
  const rawPrice = Number(data.readBigInt64LE(73));
  const expoMagnitude = data.readInt32LE(89);
  const price = rawPrice / 10 ** expoMagnitude;

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`invalid decoded price: ${price}`);
  }

  return price;
}

function sideToString(side: SideArg): "LONG" | "SHORT" {
  return "long" in side ? "LONG" : "SHORT";
}

function computeTradeNotionalMicros(
  virtualUsdc: bigint,
  cycle: number,
  riskPct: number
): number {
  const virtualUsd = Number(virtualUsdc) / 1e6;
  const notionalUsd = Math.max(
    MIN_TRADE_NOTIONAL_USD,
    Math.min(
      MAX_TRADE_NOTIONAL_USD,
      virtualUsd * (riskPct + (cycle % 3) * 0.01)
    )
  );
  return Math.max(Math.floor(notionalUsd * 1e6), 10_000_000);
}

function latestPrices(priceHistory: number[]) {
  const p2 = priceHistory.at(-1) ?? 0;
  const p1 = priceHistory.at(-2) ?? p2;
  const p0 = priceHistory.at(-3) ?? p1;
  const recent = priceHistory.slice(-6);
  const mean =
    recent.length > 0
      ? recent.reduce((sum, price) => sum + price, 0) / recent.length
      : p2;

  return {
    p0,
    p1,
    p2,
    mean,
    momentum: p2 - p1,
    acceleration: p2 - p1 - (p1 - p0),
    spreadFromMean: p2 - mean,
  };
}

const AGENT_CONFIGS: Record<TradingAgentConfig["id"], TradingAgentConfig> = {
  alpha: {
    id: "alpha",
    displayName: "Agent Alpha",
    handle: "Trend follower",
    thesis:
      "Trades with short-term BTC momentum and scales up when the tape keeps confirming.",
    color: "#f43f5e",
    decide: (priceHistory, cycle, virtualUsdc) => {
      const { momentum } = latestPrices(priceHistory);
      const side = momentum >= 0 ? { long: {} } : { short: {} };
      return {
        side,
        notionalMicros: computeTradeNotionalMicros(virtualUsdc, cycle, 0.075),
        reason: `momentum=${momentum.toFixed(2)}`,
      };
    },
  },
  beta: {
    id: "beta",
    displayName: "Agent Beta",
    handle: "Momentum fader",
    thesis:
      "Takes the other side of the latest BTC push and uses steadier medium risk.",
    color: "#22d3ee",
    decide: (priceHistory, cycle, virtualUsdc) => {
      const { momentum } = latestPrices(priceHistory);
      const side = momentum >= 0 ? { short: {} } : { long: {} };
      return {
        side,
        notionalMicros: computeTradeNotionalMicros(virtualUsdc, cycle, 0.055),
        reason: `fading-momentum=${momentum.toFixed(2)}`,
      };
    },
  },
  gamma: {
    id: "gamma",
    displayName: "Agent Gamma",
    handle: "Breakout scalper",
    thesis:
      "Runs a smaller independent scalp book that alternates direction every cycle.",
    color: "#a3e635",
    decide: (priceHistory, cycle, virtualUsdc) => {
      const { acceleration } = latestPrices(priceHistory);
      const side = cycle % 2 === 0 ? { short: {} } : { long: {} };
      return {
        side,
        notionalMicros: computeTradeNotionalMicros(virtualUsdc, cycle, 0.03),
        reason: `alternating-scalp cycle=${cycle} accel=${acceleration.toFixed(
          2
        )}`,
      };
    },
  },
};

describe("Trade Arena — Real Multi-Trade Simulation", function () {
  this.timeout(Math.max(1_200_000, (DURATION + 600) * 1000));

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.TradeArena as Program<TradeArena>;
  const erConnection = new anchor.web3.Connection(ER_ENDPOINT, "confirmed");

  const creatorWallet = provider.wallet;
  const creatorKeypair = (creatorWallet as any).payer as anchor.web3.Keypair;

  const alpha = anchor.web3.Keypair.generate();
  const beta = anchor.web3.Keypair.generate();
  const gamma = anchor.web3.Keypair.generate();
  const players = [alpha, beta, gamma] as const;

  const GAME_ID = Date.now() % 1_000_000;

  const playerNames: Record<string, string> = {};
  const completedTrades: Record<string, number> = {
    alpha: 0,
    beta: 0,
    gamma: 0,
  };
  const tradeLedger: TradeRecord[] = [];
  const instructionLog: InstructionRecord[] = [];
  const openTradeByPlayer = new Map<string, TradeRecord>();
  const joinedPlayers = new Set<string>();
  const priceHistory: number[] = [];

  let usdcMint: anchor.web3.PublicKey;
  let gamePDA: anchor.web3.PublicKey;
  let vaultPDA: anchor.web3.PublicKey;
  let psAlpha: anchor.web3.PublicKey;
  let psBeta: anchor.web3.PublicKey;
  let psGamma: anchor.web3.PublicKey;
  let alphaATA: anchor.web3.PublicKey;
  let betaATA: anchor.web3.PublicKey;
  let gammaATA: anchor.web3.PublicKey;
  let gameStartMs = Date.now();
  let gameStartUnixTs: number | null = null;
  let createGameTx = "";

  function writeLiveSnapshot(status: string): void {
    const nowMs = Date.now();
    const elapsedSeconds =
      status === "creating"
        ? 0
        : Math.max(0, Math.floor((nowMs - gameStartMs) / 1000));
    const playerByName: Record<string, anchor.web3.Keypair> = {
      alpha,
      beta,
      gamma,
    };
    const startedAtMs =
      status === "creating" || status === "joinable" ? null : gameStartMs;
    const endsAtMs = startedAtMs ? startedAtMs + DURATION * 1000 : null;

    const agents = ["alpha", "beta", "gamma"].map((name) => {
      const player = playerByName[name];
      const config = AGENT_CONFIGS[name as TradingAgentConfig["id"]];
      const playerTrades = tradeLedger.filter((trade) => trade.player === name);
      const realizedPnlUsd = playerTrades.reduce(
        (sum, trade) => sum + (trade.pnlUsd ?? 0),
        0
      );
      const playerAddress = player.publicKey.toBase58();
      const hasOpenPosition = openTradeByPlayer.has(playerAddress);
      const participationStatus = joinedPlayers.has(playerAddress)
        ? status === "ended"
          ? "settled"
          : hasOpenPosition
          ? "in_position"
          : "joined"
        : "not_joined";

      return {
        id: name,
        name: config.displayName,
        handle: config.handle,
        thesis: config.thesis,
        color: config.color,
        player: playerAddress,
        session: playerAddress,
        participationStatus,
        hasOpenPosition,
        virtualCashUsd: 10_000 + realizedPnlUsd,
        realizedPnlUsd,
        trades: playerTrades.map((trade) => {
          const closeSig = trade.closeSig;
          const isClosed = typeof closeSig === "string";
          const latestPrice =
            priceHistory.length > 0
              ? priceHistory[priceHistory.length - 1]
              : trade.entryUsd;

          return {
            id: `${name}-${trade.cycle}`,
            cycle: trade.cycle,
            side: trade.side === "LONG" ? "long" : "short",
            status: isClosed ? "closed" : "open",
            notionalUsd: trade.collateralUsd,
            sizeBtc: trade.sizeBtc,
            entryPrice: trade.entryUsd,
            openTx: trade.openSig,
            openOffsetSeconds:
              Math.floor(trade.openedAtMs / 1000) -
              Math.floor(nowMs / 1000) +
              90,
            ...(isClosed
              ? {
                  exitPrice: trade.exitUsd ?? trade.entryUsd,
                  pnlUsd: trade.pnlUsd ?? 0,
                  closeTx: closeSig,
                  closeOffsetSeconds:
                    Math.floor((trade.closedAtMs ?? trade.openedAtMs) / 1000) -
                    Math.floor(nowMs / 1000) +
                    90,
                }
              : {
                  markPrice: latestPrice,
                }),
          };
        }),
      };
    });

    const snapshot = {
      updatedAt: nowMs,
      game: {
        id: String(GAME_ID),
        gamePda: gamePDA?.toBase58?.() ?? "",
        createGameTx,
        startedAtLabel:
          status === "creating"
            ? "Creating live MCP arena"
            : `Live MCP run T+${elapsedSeconds}s / ${DURATION}s`,
        status,
        elapsedSeconds,
        durationSeconds: DURATION,
        startedAtMs,
        endsAtMs,
      },
      agents,
    };

    fs.mkdirSync(path.dirname(SIMULATION_SNAPSHOT_PATH), { recursive: true });
    const tempSnapshotPath = `${SIMULATION_SNAPSHOT_PATH}.tmp`;
    fs.writeFileSync(tempSnapshotPath, JSON.stringify(snapshot, null, 2));
    fs.renameSync(tempSnapshotPath, SIMULATION_SNAPSHOT_PATH);
  }

  function recordInstruction(
    step: string,
    cluster: ClusterKind,
    sig: string,
    note?: string
  ): void {
    instructionLog.push({
      atMs: Date.now(),
      step,
      cluster,
      endpoint:
        cluster === "devnet" ? "https://api.devnet.solana.com" : ER_ENDPOINT,
      sig,
      url: txUrl(cluster, sig),
      note,
    });
    writeLiveSnapshot(step === "create_game" ? "joinable" : "active");
  }

  after("write simulation instruction report", function () {
    const lines = [
      "# Simulation Instruction Log",
      "",
      `- Duration seconds: ${DURATION}`,
      `- Target trades per player: ${TARGET_TRADES_PER_PLAYER}`,
      `- Game ID: ${GAME_ID}`,
      `- Game PDA: ${gamePDA?.toBase58() ?? "n/a"}`,
      `- ER endpoint: ${ER_ENDPOINT}`,
      `- Devnet endpoint: https://api.devnet.solana.com`,
      `- alpha strategy: ${AGENT_CONFIGS.alpha.handle} — ${AGENT_CONFIGS.alpha.thesis}`,
      `- beta strategy: ${AGENT_CONFIGS.beta.handle} — ${AGENT_CONFIGS.beta.thesis}`,
      `- gamma strategy: ${AGENT_CONFIGS.gamma.handle} — ${AGENT_CONFIGS.gamma.thesis}`,
      "",
      "## Instructions",
      "",
      "| # | T+sec | Step | Cluster | Signature | Link | Note |",
      "| --- | ---: | --- | --- | --- | --- | --- |",
      ...instructionLog.map((item, index) => {
        const tSec =
          gameStartMs > 0
            ? Math.max(0, Math.round((item.atMs - gameStartMs) / 1000))
            : 0;
        return `| ${index + 1} | ${tSec} | ${item.step} | ${item.cluster} | \`${
          item.sig
        }\` | [open](${item.url}) | ${item.note ?? ""} |`;
      }),
      "",
      "## Trade Summary",
      "",
      `- alpha completed: ${completedTrades.alpha}`,
      `- beta completed: ${completedTrades.beta}`,
      `- gamma completed: ${completedTrades.gamma}`,
      `- total trade records: ${tradeLedger.length}`,
    ];

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
    writeLiveSnapshot("ended");
    console.log(`\n  instruction report: ${REPORT_PATH}`);
  });

  before("fund players and create USDC", async function () {
    writeLiveSnapshot("creating");
    playerNames[alpha.publicKey.toBase58()] = "alpha";
    playerNames[beta.publicKey.toBase58()] = "beta";
    playerNames[gamma.publicKey.toBase58()] = "gamma";

    console.log("\n  Players:");
    console.log("    alpha:", alpha.publicKey.toBase58());
    console.log("    beta: ", beta.publicKey.toBase58());
    console.log("    gamma:", gamma.publicKey.toBase58());

    const fundTx = new anchor.web3.Transaction();
    for (const p of players) {
      fundTx.add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: creatorWallet.publicKey,
          toPubkey: p.publicKey,
          lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
        })
      );
    }
    const fundSig = await provider.sendAndConfirm(fundTx);
    recordInstruction("fund_players", "devnet", fundSig, "0.1 SOL each");
    console.log("  ✓ funded players (0.1 SOL each)");

    usdcMint = await createMint(
      provider.connection,
      creatorKeypair,
      creatorKeypair.publicKey,
      null,
      6
    );
    console.log("  ✓ USDC mint:", usdcMint.toBase58());

    alphaATA = await createAssociatedTokenAccount(
      provider.connection,
      alpha,
      usdcMint,
      alpha.publicKey
    );
    betaATA = await createAssociatedTokenAccount(
      provider.connection,
      beta,
      usdcMint,
      beta.publicKey
    );
    gammaATA = await createAssociatedTokenAccount(
      provider.connection,
      gamma,
      usdcMint,
      gamma.publicKey
    );

    for (const [kp, ata] of [
      [alpha, alphaATA],
      [beta, betaATA],
      [gamma, gammaATA],
    ] as [anchor.web3.Keypair, anchor.web3.PublicKey][]) {
      const mintSig = await mintTo(
        provider.connection,
        creatorKeypair,
        usdcMint,
        ata,
        creatorKeypair,
        100_000_000
      );
      recordInstruction(
        `mint_test_usdc_${playerNames[kp.publicKey.toBase58()]}`,
        "devnet",
        mintSig,
        "100 USDC"
      );
    }
    console.log("  ✓ minted 100 USDC to each player");

    [gamePDA] = findGamePDA(
      creatorWallet.publicKey,
      GAME_ID,
      program.programId
    );
    [vaultPDA] = findVaultPDA(gamePDA, program.programId);
    [psAlpha] = findPlayerStatePDA(gamePDA, alpha.publicKey, program.programId);
    [psBeta] = findPlayerStatePDA(gamePDA, beta.publicKey, program.programId);
    [psGamma] = findPlayerStatePDA(gamePDA, gamma.publicKey, program.programId);
  });

  it("A. [Base] create game, join × 3, fund escrows, delegate all accounts", async function () {
    const t0 = Date.now();
    const log = (msg: string) => console.log(`  [${elapsed(t0)}] ${msg}`);

    const createGameSig = await program.methods
      .createGame(new BN(GAME_ID), new BN(ENTRY_FEE), new BN(DURATION), 3)
      .accounts({
        creator: creatorWallet.publicKey,
        game: gamePDA,
        usdcMint,
        vault: vaultPDA,
        assetFeed: PYTH_LAZER_BTC_USD,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    createGameTx = createGameSig;
    recordInstruction("create_game", "devnet", createGameSig);
    log("✓ game created");

    for (const [player, ata, ps] of [
      [alpha, alphaATA, psAlpha],
      [beta, betaATA, psBeta],
      [gamma, gammaATA, psGamma],
    ] as [
      anchor.web3.Keypair,
      anchor.web3.PublicKey,
      anchor.web3.PublicKey
    ][]) {
      const joinSig = await program.methods
        .joinGame()
        .accounts({
          player: player.publicKey,
          game: gamePDA,
          playerState: ps,
          playerUsdc: ata,
          vault: vaultPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([player])
        .rpc();
      joinedPlayers.add(player.publicKey.toBase58());
      recordInstruction(
        `join_game_${playerNames[player.publicKey.toBase58()]}`,
        "devnet",
        joinSig,
        `entry fee ${ENTRY_FEE / 1e6} USDC`
      );
    }
    const game = await program.account.game.fetch(gamePDA);
    log(`✓ all 3 joined — prize pool: ${game.prizePool.toNumber() / 1e6} USDC`);

    for (const authority of [
      creatorWallet.publicKey,
      ...players.map((p) => p.publicKey),
    ]) {
      const escrowTopup = authority.equals(creatorWallet.publicKey)
        ? 0.05 * anchor.web3.LAMPORTS_PER_SOL
        : 0.01 * anchor.web3.LAMPORTS_PER_SOL;
      const escrow = escrowPdaFromEscrowAuthority(authority);
      const ix = createTopUpEscrowInstruction(
        escrow,
        authority,
        creatorWallet.publicKey,
        escrowTopup
      );
      const topupSig = await provider.sendAndConfirm(
        new anchor.web3.Transaction().add(ix)
      );
      recordInstruction(
        `topup_escrow_${playerNames[authority.toBase58()] ?? "creator"}`,
        "devnet",
        topupSig
      );
    }
    log("✓ ER escrows funded");

    for (const [player, ps] of [
      [alpha, psAlpha],
      [beta, psBeta],
      [gamma, psGamma],
    ] as [anchor.web3.Keypair, anchor.web3.PublicKey][]) {
      const delegateSig = await program.methods
        .delegatePlayer()
        .accounts({
          player: player.publicKey,
          game: gamePDA,
          playerState: ps,
          ownerProgram: program.programId,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([player])
        .rpc();
      recordInstruction(
        `delegate_player_${playerNames[player.publicKey.toBase58()]}`,
        "devnet",
        delegateSig
      );
    }
    log("✓ all PlayerState accounts delegated to ER");

    const delegateGameSig = await program.methods
      .delegateGame(new BN(GAME_ID))
      .accounts({
        creator: creatorWallet.publicKey,
        game: gamePDA,
        ownerProgram: program.programId,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    recordInstruction("delegate_game", "devnet", delegateGameSig);
    log("✓ Game account delegated to ER");
  });

  it("B. [ER] start game and run 12 live round trips per player", async function () {
    const log = (msg: string) =>
      console.log(`  [${elapsed(gameStartMs)}] ${msg}`);

    async function openPos(
      player: anchor.web3.Keypair,
      ps: anchor.web3.PublicKey,
      cycle: number
    ): Promise<void> {
      const name = playerNames[player.publicKey.toBase58()];
      const before = await fetchPlayerState(
        ps,
        erConnection,
        provider.connection
      );
      expect(before, `missing state before opening for ${name}`).to.not.equal(
        null
      );
      expect(Number(before!.positionSize)).to.equal(0);

      const livePriceUsd = await fetchLivePriceUsd(
        erConnection,
        PYTH_LAZER_BTC_USD
      );
      priceHistory.push(livePriceUsd);
      const strategy = AGENT_CONFIGS[name as TradingAgentConfig["id"]];
      const decision = strategy.decide(
        priceHistory,
        cycle,
        before!.virtualUsdc
      );
      const side = decision.side;
      const notionalMicros = decision.notionalMicros;

      const tx = await program.methods
        .tradePosition({
          increase: { side, notionalUsdc: new BN(notionalMicros) },
        })
        .accounts({
          game: gamePDA,
          playerState: ps,
          sessionToken: null,
          signer: player.publicKey,
          priceFeed: PYTH_LAZER_BTC_USD,
        })
        .transaction();

      const sig = await sendToER(erConnection, player, tx);
      await confirmER(erConnection, sig);
      recordInstruction(
        `trade_increase_${name}`,
        "magicblock-er",
        sig,
        `${strategy.handle}: ${sideToString(side)} notional=$${fmtUsd(
          notionalMicros / 1e6
        )} ${decision.reason}`
      );
      await sleep(600);

      const after = await fetchPlayerState(
        ps,
        erConnection,
        provider.connection
      );
      expect(after, `missing state after opening for ${name}`).to.not.equal(
        null
      );
      expect(Number(after!.positionSize)).to.be.greaterThan(0);

      const entryUsd = Number(after!.entryPrice) / 1e6;
      const collateralUsd =
        (Number(before!.virtualUsdc) - Number(after!.virtualUsdc)) / 1e6;
      const record: TradeRecord = {
        player: name,
        cycle,
        side: sideToString(side),
        sizeBtc: Number(after!.positionSize) / 1e6,
        entryUsd,
        collateralUsd,
        openedAtMs: Date.now(),
        openSig: sig,
      };

      openTradeByPlayer.set(player.publicKey.toBase58(), record);
      tradeLedger.push(record);
      writeLiveSnapshot("active");

      log(
        `✓ ${name} opened ${record.side.padEnd(5)} ${fmtBtc(
          record.sizeBtc
        )} BTC @ $${fmtUsd(record.entryUsd)} collateral=$${fmtUsd(
          record.collateralUsd
        )} sig:${sig.slice(0, 8)}…`
      );
    }

    async function closePos(
      player: anchor.web3.Keypair,
      ps: anchor.web3.PublicKey
    ): Promise<void> {
      const name = playerNames[player.publicKey.toBase58()];
      const record = openTradeByPlayer.get(player.publicKey.toBase58());
      expect(record, `no open trade record for ${name}`).to.not.equal(
        undefined
      );

      const before = await fetchPlayerState(
        ps,
        erConnection,
        provider.connection
      );
      expect(before, `missing state before close for ${name}`).to.not.equal(
        null
      );

      const tx = await program.methods
        .tradePosition({ closeAll: {} })
        .accounts({
          game: gamePDA,
          playerState: ps,
          sessionToken: null,
          signer: player.publicKey,
          priceFeed: PYTH_LAZER_BTC_USD,
        })
        .transaction();

      const sig = await sendToER(erConnection, player, tx);
      await confirmER(erConnection, sig);
      recordInstruction(
        `trade_close_${name}`,
        "magicblock-er",
        sig,
        `${record!.side} close_all`
      );
      await sleep(600);

      const after = await fetchPlayerState(
        ps,
        erConnection,
        provider.connection
      );
      expect(after, `missing state after close for ${name}`).to.not.equal(null);
      expect(Number(after!.positionSize)).to.equal(0);

      record!.exitUsd = Number(
        await fetchLivePriceUsd(erConnection, PYTH_LAZER_BTC_USD)
      );
      record!.pnlUsd =
        (Number(after!.realizedPnl) - Number(before!.realizedPnl)) / 1e6;
      record!.closedAtMs = Date.now();
      record!.closeSig = sig;

      completedTrades[name] += 1;
      openTradeByPlayer.delete(player.publicKey.toBase58());
      writeLiveSnapshot("active");

      log(
        `✓ ${name} closed ${record!.side.padEnd(5)} exit≈$${fmtUsd(
          record!.exitUsd
        )} pnl=$${fmtUsd(record!.pnlUsd!)} hold=${(
          (record!.closedAtMs - record!.openedAtMs) /
          1000
        ).toFixed(1)}s sig:${sig.slice(0, 8)}…`
      );
    }

    const startTx = await program.methods
      .startGame()
      .accounts({
        creator: creatorWallet.publicKey,
        game: gamePDA,
      })
      .transaction();
    const startSig = await sendToER(erConnection, creatorKeypair, startTx);
    await confirmER(erConnection, startSig);
    gameStartMs = Date.now();
    recordInstruction("start_game", "magicblock-er", startSig);
    writeLiveSnapshot("active");
    const gameInfo = await erConnection.getAccountInfo(gamePDA, "confirmed");
    expect(gameInfo).to.not.equal(null);
    gameStartUnixTs = parseGameStartTime(Buffer.from(gameInfo!.data));

    console.log(`\n  [${elapsed(gameStartMs)}] ✓ game started on ER`);
    console.log(
      `  Strategy set: alpha=trend-following | beta=mean-reversion | gamma=breakout-scalping`
    );
    console.log(
      `  Target: ${TARGET_TRADES_PER_PLAYER} closed trades per player`
    );

    for (let i = 0; i < 3; i++) {
      priceHistory.push(
        await fetchLivePriceUsd(erConnection, PYTH_LAZER_BTC_USD)
      );
      await sleep(800);
    }

    let cycle = 0;
    while (
      Math.min(...Object.values(completedTrades)) < TARGET_TRADES_PER_PLAYER &&
      Date.now() < gameStartMs + DURATION * 1000 - ENTRY_BUFFER_MS
    ) {
      cycle += 1;
      log(
        `cycle ${cycle} — live BTC: $${fmtUsd(
          priceHistory[priceHistory.length - 1]
        )} | completed alpha=${completedTrades.alpha} beta=${
          completedTrades.beta
        } gamma=${completedTrades.gamma}`
      );

      await openPos(alpha, psAlpha, cycle);
      await openPos(beta, psBeta, cycle);
      await openPos(gamma, psGamma, cycle);

      log(`↻ holding positions for ${(HOLD_MS / 1000).toFixed(1)}s`);
      await sleep(HOLD_MS);

      await closePos(alpha, psAlpha);
      await closePos(beta, psBeta);
      await closePos(gamma, psGamma);

      priceHistory.push(
        await fetchLivePriceUsd(erConnection, PYTH_LAZER_BTC_USD)
      );
      await sleep(PAUSE_BETWEEN_CYCLES_MS);
    }

    expect(completedTrades.alpha).to.be.greaterThan(
      TARGET_TRADES_PER_PLAYER - 1
    );
    expect(completedTrades.beta).to.be.greaterThan(
      TARGET_TRADES_PER_PLAYER - 1
    );
    expect(completedTrades.gamma).to.be.greaterThan(
      TARGET_TRADES_PER_PLAYER - 1
    );
    expect(openTradeByPlayer.size).to.equal(0);

    const msUntilExpiry =
      ((gameStartUnixTs ?? Math.floor(Date.now() / 1000)) + DURATION) * 1000 -
      Date.now();
    if (msUntilExpiry > 0) {
      log(
        `↻ all targets hit — waiting ${(msUntilExpiry / 1000).toFixed(
          1
        )}s for expiry`
      );
      await sleep(msUntilExpiry + 2_000);
    }
    log("✓ game window expired");
  });

  it("C. [ER] end_game crowns winner, commit_game pushes result to base layer", async function () {
    const log = (msg: string) =>
      console.log(`  [${elapsed(gameStartMs)}] ${msg}`);

    log("sending end_game to ER…");
    const endTx = await program.methods
      .endGame()
      .accounts({ game: gamePDA, priceFeed: PYTH_LAZER_BTC_USD })
      .remainingAccounts([
        { pubkey: psAlpha, isWritable: true, isSigner: false },
        { pubkey: psBeta, isWritable: true, isSigner: false },
        { pubkey: psGamma, isWritable: true, isSigner: false },
      ])
      .transaction();
    const endSig = await sendToER(erConnection, creatorKeypair, endTx);
    await confirmER(erConnection, endSig);
    recordInstruction("end_game", "magicblock-er", endSig);
    writeLiveSnapshot("ending");
    log(`✓ end_game confirmed on ER sig:${endSig.slice(0, 8)}…`);

    log("sending direct game commit/undelegate to ER…");
    const commitTx = await program.methods
      .commitGame()
      .accounts({
        payer: creatorWallet.publicKey,
        game: gamePDA,
      })
      .remainingAccounts([
        { pubkey: psAlpha, isWritable: true, isSigner: false },
        { pubkey: psBeta, isWritable: true, isSigner: false },
        { pubkey: psGamma, isWritable: true, isSigner: false },
      ])
      .transaction();
    const commitSig = await sendToER(erConnection, creatorKeypair, commitTx);
    await confirmER(erConnection, commitSig);
    recordInstruction("commit_game", "magicblock-er", commitSig);
    log(
      `✓ game commit/undelegate confirmed on ER sig:${commitSig.slice(0, 8)}…`
    );

    log("⏳ waiting for base-layer commit and finalizing undelegation…");
    const { baseCommitSig, finalizeSig } = await finalizeUndelegationOnBase({
      program,
      baseConnection: provider.connection,
      erConnection,
      payer: creatorWallet.publicKey,
      programId: program.programId,
      baseAccount: gamePDA,
      accountSeeds: [
        GAME_SEED,
        creatorWallet.publicKey.toBuffer(),
        u64Le(GAME_ID),
      ],
      erScheduleSig: commitSig,
    });
    if (baseCommitSig) {
      recordInstruction(
        "base_commit_from_er",
        "devnet",
        baseCommitSig,
        "scheduled by ER commit_game"
      );
      log(`✓ base-layer commit observed sig:${baseCommitSig.slice(0, 8)}…`);
    } else {
      log("✓ base-layer commit propagated; finalized via undelegation buffer");
    }
    if (finalizeSig) {
      recordInstruction(
        "process_undelegation",
        "devnet",
        finalizeSig,
        "base-layer finalize fallback"
      );
    }

    for (const [player, playerState, label] of [
      [alpha, psAlpha, "alpha"],
      [beta, psBeta, "beta"],
      [gamma, psGamma, "gamma"],
    ] as [anchor.web3.Keypair, anchor.web3.PublicKey, string][]) {
      const playerFinalize = await finalizeUndelegationOnBase({
        program,
        baseConnection: provider.connection,
        erConnection,
        payer: creatorWallet.publicKey,
        programId: program.programId,
        baseAccount: playerState,
        accountSeeds: [
          PLAYER_SEED,
          gamePDA.toBuffer(),
          player.publicKey.toBuffer(),
        ],
        erScheduleSig: commitSig,
      });
      if (playerFinalize.finalizeSig) {
        recordInstruction(
          `process_undelegation_${label}`,
          "devnet",
          playerFinalize.finalizeSig,
          "base-layer finalize fallback"
        );
      }
    }
    log("✓ game account back on base layer with winner recorded");
  });

  it("D. [Base] display final leaderboard and full trade ledger", async function () {
    const log = (msg: string) =>
      console.log(`  [${elapsed(gameStartMs)}] ${msg}`);

    const game = await program.account.game.fetch(gamePDA);
    expect(game.status).to.deep.equal({ ended: {} });
    expect(game.winner).to.not.be.null;

    const winnerKey = (game.winner as anchor.web3.PublicKey).toBase58();
    const winnerName = playerNames[winnerKey] ?? `${winnerKey.slice(0, 8)}…`;

    log(
      "\n  ┌─────── Final Leaderboard ──────────────────────────────────────────────────┐"
    );
    for (const [player, ps, name] of [
      [alpha, psAlpha, "alpha"],
      [beta, psBeta, "beta"],
      [gamma, psGamma, "gamma"],
    ] as [anchor.web3.Keypair, anchor.web3.PublicKey, string][]) {
      const account = await provider.connection.getAccountInfo(ps, "confirmed");
      expect(account, `${name} state missing on base layer`).to.not.equal(null);
      expect(
        account!.owner.equals(program.programId),
        `${name} still delegated`
      ).to.equal(true);
      const state = parsePlayerStateBuffer(Buffer.from(account!.data));
      expect(state, `${name} state missing at final leaderboard`).to.not.equal(
        null
      );

      const playerTrades = tradeLedger.filter((t) => t.player === name);
      const totalPnl = playerTrades.reduce(
        (sum, t) => sum + (t.pnlUsd ?? 0),
        0
      );
      const wins = playerTrades.filter((t) => (t.pnlUsd ?? 0) > 0).length;
      const isWinner = player.publicKey.toBase58() === winnerKey;
      const nameLabel = (name + (isWinner ? " 🏆" : "")).padEnd(12);
      const posStr =
        Number(state!.positionSize) > 0
          ? `OPEN ${["Long", "Short"][state!.sideFlag] || "?"}`
          : "Flat";

      log(
        `  │  ${nameLabel} cash=$${fmtUsd(
          Number(state!.virtualUsdc) / 1e6
        )} trades=${playerTrades.length} wins=${wins} totalPnl=$${fmtUsd(
          totalPnl
        )} pos=[${posStr}]`
      );
    }
    log("  │");
    log(
      `  │  Winner: ${winnerName}  Score: ${(
        game.leaderValue.toNumber() / 1e6
      ).toFixed(4)} virtual USDC`
    );
    log(`  │  Prize pool: ${(ENTRY_FEE * 3) / 1e6} USDC`);
    log(
      "  └────────────────────────────────────────────────────────────────────────────┘"
    );

    log(
      "\n  ┌─────── Trade Ledger ────────────────────────────────────────────────────────┐"
    );
    for (const trade of tradeLedger) {
      log(
        `  │  ${trade.player.padEnd(5)} #${String(trade.cycle).padStart(
          2,
          "0"
        )} ${trade.side.padEnd(5)} size=${fmtBtc(
          trade.sizeBtc
        )} BTC entry=$${fmtUsd(trade.entryUsd)} exit=$${fmtUsd(
          trade.exitUsd ?? 0
        )} pnl=$${fmtUsd(trade.pnlUsd ?? 0)} hold=${(
          ((trade.closedAtMs ?? trade.openedAtMs) - trade.openedAtMs) /
          1000
        ).toFixed(1)}s`
      );
    }
    log(
      "  └────────────────────────────────────────────────────────────────────────────┘"
    );
  });

  it("E. [Base] winner claims real USDC from the prize vault", async function () {
    const log = (msg: string) =>
      console.log(`  [${elapsed(gameStartMs)}] ${msg}`);

    const game = await program.account.game.fetch(gamePDA);
    const winnerKey = game.winner as anchor.web3.PublicKey;
    const winnerName = playerNames[winnerKey.toBase58()] ?? "unknown";
    const winnerKP = [alpha, beta, gamma].find((p) =>
      p.publicKey.equals(winnerKey)
    )!;
    const winnerATA = [alphaATA, betaATA, gammaATA][
      [alpha, beta, gamma].indexOf(winnerKP)
    ];

    const beforeBal = (await getAccount(provider.connection, winnerATA)).amount;

    const claimSig = await program.methods
      .claimPrize()
      .accounts({
        winner: winnerKey,
        game: gamePDA,
        vault: vaultPDA,
        winnerUsdc: winnerATA,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([winnerKP])
      .rpc();
    recordInstruction("claim_prize", "devnet", claimSig);

    const afterBal = (await getAccount(provider.connection, winnerATA)).amount;
    const prize = Number(afterBal - beforeBal) / 1e6;
    expect(prize).to.equal((ENTRY_FEE * 3) / 1e6);

    const vaultBal = (await getAccount(provider.connection, vaultPDA)).amount;
    expect(Number(vaultBal)).to.equal(0);

    log(`\n  🏆 ${winnerName} wins ${prize} USDC — vault drained to 0`);
    writeLiveSnapshot("ended");
    log(
      `      Completed trades: alpha=${completedTrades.alpha} beta=${completedTrades.beta} gamma=${completedTrades.gamma}`
    );
    log(
      `      Total elapsed: ${Math.round((Date.now() - gameStartMs) / 1000)} s`
    );
  });
});
