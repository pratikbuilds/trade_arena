import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import fs from "node:fs";
import path from "node:path";
import {
  createAssociatedTokenAccount,
  createMint,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { TradeArena } from "../target/types/trade_arena";

const MCP_URL = process.env.TRADE_ARENA_MCP_URL ?? "http://127.0.0.1:3000";
const UI_URL = process.env.TRADE_ARENA_UI_URL ?? "http://127.0.0.1:5173";
const ER_ENDPOINT =
  process.env.TRADE_ARENA_ER_RPC_URL ?? "https://devnet.magicblock.app";
const BASE_ENDPOINT =
  process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
const PRICE_FEED = new anchor.web3.PublicKey(
  process.env.TRADE_ARENA_PRICE_FEED ??
    "71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr"
);
const DELEGATION_PROGRAM_ID = new anchor.web3.PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);
const GAME_SEED = Buffer.from("game");
const PLAYER_SEED = Buffer.from("player");
const VAULT_SEED = Buffer.from("vault");
const ENTRY_FEE_MICROS = Number(process.env.MCP_AGENT_ENTRY_FEE ?? "1000000");
const DURATION_SECONDS = Number(process.env.MCP_AGENT_DURATION ?? "900");
const CYCLES = Number(process.env.MCP_AGENT_CYCLES ?? "2");
const HOLD_MS = Number(process.env.MCP_AGENT_HOLD_MS ?? "3500");
const SNAPSHOT_MAX_AGE_MS = Number(
  process.env.MCP_AGENT_SNAPSHOT_MAX_AGE_MS ?? "30000"
);
const ARTIFACT_DIR = process.env.MCP_AGENT_ARTIFACT_DIR ?? "artifacts";

type Side = "long" | "short";

type AgentConfig = {
  id: string;
  displayName: string;
  handle: string;
  thesis: string;
  color: string;
  decide: (prices: number[], cycle: number) => { side: Side; notional: number };
};

const AGENTS: AgentConfig[] = [
  {
    id: "alpha",
    displayName: "Alpha Trend",
    handle: "Trend follower",
    thesis: "Trades with short-term BTC momentum.",
    color: "#f43f5e",
    decide: (prices, cycle) => ({
      side: (prices.at(-1) ?? 0) >= (prices.at(-2) ?? 0) ? "long" : "short",
      notional: 250_000_000 + cycle * 25_000_000,
    }),
  },
  {
    id: "beta",
    displayName: "Beta Fade",
    handle: "Momentum fader",
    thesis: "Takes the other side of the latest BTC push.",
    color: "#22d3ee",
    decide: (prices, cycle) => ({
      side: (prices.at(-1) ?? 0) >= (prices.at(-2) ?? 0) ? "short" : "long",
      notional: 210_000_000 + cycle * 20_000_000,
    }),
  },
  {
    id: "gamma",
    displayName: "Gamma Flip",
    handle: "Alternating scalper",
    thesis: "Alternates direction each cycle with smaller sizing.",
    color: "#a3e635",
    decide: (_prices, cycle) => ({
      side: cycle % 2 === 0 ? "short" : "long",
      notional: 180_000_000 + cycle * 15_000_000,
    }),
  },
];

type AgentRuntime = AgentConfig & {
  player: anchor.web3.Keypair;
  session: anchor.web3.Keypair;
  playerState: anchor.web3.PublicKey;
};

type ArenaSnapshot = {
  updatedAt: number;
  game?: {
    gamePda?: string;
  };
  agents?: Array<{
    trades?: unknown[];
  }>;
};

type ArenaDiscoveryRow = {
  game_pubkey: string;
  game_pda: string;
  status: string;
};

type RehearsalArtifact = {
  recorded_at: string;
  game_pda: string;
  game_id: number;
  mcp_url: string;
  ui_url: string;
  mcp_snapshot_url: string;
  ui_snapshot_url: string;
  output_path: string;
  create_game_sig: string;
  delegate_game_sig: string;
  start_game_sig: string;
  agents: Array<{
    id: string;
    player: string;
    session: string;
    player_state: string;
  }>;
  snapshot: {
    updated_at: number;
    age_ms: number;
    agent_count: number;
    trade_count: number;
  };
};

function u64Le(value: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function findGamePDA(
  creator: anchor.web3.PublicKey,
  gameId: number,
  programId: anchor.web3.PublicKey
): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [GAME_SEED, creator.toBuffer(), u64Le(gameId)],
    programId
  )[0];
}

function findPlayerStatePDA(
  game: anchor.web3.PublicKey,
  player: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey
): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [PLAYER_SEED, game.toBuffer(), player.toBuffer()],
    programId
  )[0];
}

function findVaultPDA(
  game: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey
): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [VAULT_SEED, game.toBuffer()],
    programId
  )[0];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function txUrl(cluster: "devnet" | "er", signature: string): string {
  if (cluster === "devnet") {
    return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  }

  return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(
    ER_ENDPOINT
  )}`;
}

async function mcpCall<T>(
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${MCP_URL}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP ${name} failed with HTTP ${response.status}`);
  }

  const body = await response.text();
  const line = body
    .split("\n")
    .find((candidate) => candidate.startsWith("data: "));
  const envelope = JSON.parse(line ? line.slice(6) : body);
  const text = envelope.result?.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error(`MCP ${name} returned no text content`);
  }

  const payload = JSON.parse(text);
  if (payload.error) {
    throw new Error(`MCP ${name}: ${payload.error}`);
  }

  return payload as T;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} failed with HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

async function sendPreparedTransaction(args: {
  base64: string;
  connection: anchor.web3.Connection;
  signers: anchor.web3.Keypair[];
  label: string;
}): Promise<string> {
  const tx = anchor.web3.Transaction.from(Buffer.from(args.base64, "base64"));
  tx.partialSign(...args.signers);
  const signature = await args.connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
  });
  await args.connection.confirmTransaction(signature, "confirmed");
  console.log(`  ✓ ${args.label}: ${signature}`);
  return signature;
}

async function sendToER(
  erConnection: anchor.web3.Connection,
  signer: anchor.web3.Keypair,
  tx: anchor.web3.Transaction,
  label: string
): Promise<string> {
  tx.feePayer = signer.publicKey;
  const { blockhash } = await erConnection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(signer);
  const signature = await erConnection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
  });
  await erConnection.confirmTransaction(signature, "confirmed");
  console.log(`  ✓ ${label}: ${signature}`);
  return signature;
}

function parsePlayerState(data: Buffer) {
  let offset = 8 + 32 + 32;
  const virtualUsdc = data.readBigUInt64LE(offset);
  offset += 8;
  const positionSize = data.readBigUInt64LE(offset);
  offset += 8;
  const sideFlag = data[offset];
  offset += 1;
  const entryPrice = data.readBigUInt64LE(offset);
  offset += 8;
  const realizedPnl = data.readBigInt64LE(offset);
  return { virtualUsdc, positionSize, sideFlag, entryPrice, realizedPnl };
}

async function fetchPlayerState(
  connection: anchor.web3.Connection,
  pubkey: anchor.web3.PublicKey
) {
  const info = await connection.getAccountInfo(pubkey, "confirmed");
  if (!info) return null;
  return parsePlayerState(Buffer.from(info.data));
}

async function waitForErAccount(
  connection: anchor.web3.Connection,
  pubkey: anchor.web3.PublicKey,
  label: string
): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const info = await connection.getAccountInfo(pubkey, "confirmed");
    if (info) return;
    await sleep(1_000);
  }

  throw new Error(`${label} did not appear on ER`);
}

async function fetchLivePriceUsd(
  connection: anchor.web3.Connection
): Promise<number> {
  const account = await connection.getAccountInfo(PRICE_FEED, "confirmed");
  if (!account || account.data.length < 134) {
    throw new Error("Live Pyth Lazer price account is unavailable");
  }

  const data = Buffer.from(account.data);
  const rawPrice = Number(data.readBigInt64LE(73));
  const expoMagnitude = data.readInt32LE(89);
  return rawPrice / 10 ** expoMagnitude;
}

async function assertMcpDiscoversGame(gamePda: anchor.web3.PublicKey) {
  const arenas = await mcpCall<ArenaDiscoveryRow[]>("list_arenas", {
    status: "all",
  });
  const discovered = arenas.find(
    (arena) =>
      arena.game_pubkey === gamePda.toBase58() ||
      arena.game_pda === gamePda.toBase58()
  );

  if (!discovered) {
    throw new Error(`MCP list_arenas did not discover ${gamePda.toBase58()}`);
  }

  console.log(`  ✓ MCP discovered game (${discovered.status})`);
  return discovered;
}

function assertFreshSnapshot(args: {
  snapshot: ArenaSnapshot;
  gamePda: anchor.web3.PublicKey;
  source: string;
}): { ageMs: number; agentCount: number; tradeCount: number } {
  if (
    typeof args.snapshot.updatedAt !== "number" ||
    args.snapshot.game?.gamePda !== args.gamePda.toBase58() ||
    !Array.isArray(args.snapshot.agents)
  ) {
    throw new Error(`${args.source} returned an invalid snapshot`);
  }

  const ageMs = Date.now() - args.snapshot.updatedAt;
  if (ageMs > SNAPSHOT_MAX_AGE_MS) {
    throw new Error(
      `${args.source} snapshot is stale: ${ageMs}ms old, max ${SNAPSHOT_MAX_AGE_MS}ms`
    );
  }

  const tradeCount = args.snapshot.agents.reduce(
    (sum, agent) => sum + (agent.trades?.length ?? 0),
    0
  );
  return {
    ageMs,
    agentCount: args.snapshot.agents.length,
    tradeCount,
  };
}

function writeArtifact(artifact: RehearsalArtifact): void {
  fs.mkdirSync(path.dirname(artifact.output_path), { recursive: true });
  fs.writeFileSync(artifact.output_path, JSON.stringify(artifact, null, 2));
}

async function main(): Promise<void> {
  process.env.ANCHOR_PROVIDER_URL = BASE_ENDPOINT;
  process.env.ANCHOR_WALLET =
    process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.TradeArena as Program<TradeArena>;
  const creator = (
    provider.wallet as anchor.Wallet & {
      payer: anchor.web3.Keypair;
    }
  ).payer;
  const baseConnection = provider.connection;
  const erConnection = new anchor.web3.Connection(ER_ENDPOINT, "confirmed");
  const gameId = Number(process.env.MCP_AGENT_GAME_ID ?? Date.now());
  const gamePda = findGamePDA(creator.publicKey, gameId, program.programId);
  const vaultPda = findVaultPDA(gamePda, program.programId);
  const agents: AgentRuntime[] = AGENTS.map((config) => {
    const player = anchor.web3.Keypair.generate();
    return {
      ...config,
      player,
      session: anchor.web3.Keypair.generate(),
      playerState: findPlayerStatePDA(
        gamePda,
        player.publicKey,
        program.programId
      ),
    };
  });

  console.log("MCP agent arena");
  console.log(`  MCP: ${MCP_URL}`);
  console.log(`  UI: ${UI_URL}`);
  console.log(`  base: ${BASE_ENDPOINT}`);
  console.log(`  er: ${ER_ENDPOINT}`);
  console.log(`  game: ${gamePda.toBase58()}`);

  const health = await fetch(`${MCP_URL}/health`);
  if (!health.ok) {
    throw new Error(`MCP server is not healthy at ${MCP_URL}`);
  }

  const fundTx = new anchor.web3.Transaction();
  for (const agent of agents) {
    fundTx.add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: agent.player.publicKey,
        lamports: 0.09 * anchor.web3.LAMPORTS_PER_SOL,
      }),
      anchor.web3.SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: agent.session.publicKey,
        lamports: 0.01 * anchor.web3.LAMPORTS_PER_SOL,
      })
    );
  }
  const fundSig = await provider.sendAndConfirm(fundTx);
  console.log(`  ✓ funded agent wallets: ${fundSig}`);

  const tokenMint = await createMint(
    baseConnection,
    creator,
    creator.publicKey,
    null,
    6
  );

  for (const agent of agents) {
    const ata = await createAssociatedTokenAccount(
      baseConnection,
      creator,
      tokenMint,
      agent.player.publicKey
    );
    await mintTo(baseConnection, creator, tokenMint, ata, creator, 100_000_000);
    console.log(
      `  ✓ ${
        agent.id
      } ${agent.player.publicKey.toBase58()} funded with test tokens`
    );
  }

  const createGameSig = await program.methods
    .createGame(
      new BN(gameId),
      new BN(ENTRY_FEE_MICROS),
      new BN(DURATION_SECONDS),
      agents.length
    )
    .accountsPartial({
      creator: creator.publicKey,
      game: gamePda,
      tokenMint,
      vault: vaultPda,
      assetFeed: PRICE_FEED,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  console.log(`  ✓ create game: ${createGameSig}`);
  await assertMcpDiscoversGame(gamePda);

  for (const [index, agent] of agents.entries()) {
    await mcpCall("record_agent_profile", {
      game_pubkey: gamePda.toBase58(),
      player: agent.player.publicKey.toBase58(),
      session: agent.session.publicKey.toBase58(),
      id: agent.id,
      name: agent.displayName,
      handle: agent.handle,
      thesis: agent.thesis,
      color: agent.color,
      order: index,
    });
  }
  console.log("  ✓ registered distinct MCP agent profiles");

  for (const agent of agents) {
    const prepared = await mcpCall<{
      transaction_base64: string;
      player_state: string;
      session_token: string;
    }>("prepare_join_arena", {
      game_pubkey: gamePda.toBase58(),
      player: agent.player.publicKey.toBase58(),
      session_signer: agent.session.publicKey.toBase58(),
    });
    await sendPreparedTransaction({
      base64: prepared.transaction_base64,
      connection: baseConnection,
      signers: [agent.player, agent.session],
      label: `MCP join ${agent.id}`,
    });
  }
  await assertMcpDiscoversGame(gamePda);

  const delegateGameSig = await program.methods
    .delegateGame(new BN(gameId))
    .accountsPartial({
      creator: creator.publicKey,
      game: gamePda,
      ownerProgram: program.programId,
      delegationProgram: DELEGATION_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();
  console.log(`  ✓ delegate game: ${delegateGameSig}`);

  await Promise.all(
    agents.map((agent) =>
      waitForErAccount(erConnection, agent.playerState, agent.id)
    )
  );
  await waitForErAccount(erConnection, gamePda, "game");

  const startTx = await program.methods
    .startGame()
    .accounts({ creator: creator.publicKey, game: gamePda })
    .transaction();
  const startSig = await sendToER(erConnection, creator, startTx, "start game");

  const prices: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    prices.push(await fetchLivePriceUsd(erConnection));
    await sleep(600);
  }

  for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    console.log(`  cycle ${cycle}`);
    for (const agent of agents) {
      const before = await fetchPlayerState(erConnection, agent.playerState);
      const decision = agent.decide(prices, cycle);
      const prepared = await mcpCall<{ transaction_base64: string }>(
        "prepare_trade_position",
        {
          game_pubkey: gamePda.toBase58(),
          player: agent.player.publicKey.toBase58(),
          signer: agent.player.publicKey.toBase58(),
          action: "increase",
          side: decision.side,
          notional_usdc: String(decision.notional),
        }
      );
      const sig = await sendPreparedTransaction({
        base64: prepared.transaction_base64,
        connection: erConnection,
        signers: [agent.player],
        label: `MCP ${agent.id} ${decision.side} ${decision.notional / 1e6}`,
      });
      const after = await fetchPlayerState(erConnection, agent.playerState);
      console.log(
        `    ${agent.handle}: ${decision.side} opened ${sig.slice(
          0,
          8
        )}, cash ${Number(before?.virtualUsdc ?? 0n) / 1e6} -> ${
          Number(after?.virtualUsdc ?? 0n) / 1e6
        }`
      );
    }

    await sleep(HOLD_MS);

    for (const agent of agents) {
      const before = await fetchPlayerState(erConnection, agent.playerState);
      const prepared = await mcpCall<{ transaction_base64: string }>(
        "prepare_trade_position",
        {
          game_pubkey: gamePda.toBase58(),
          player: agent.player.publicKey.toBase58(),
          signer: agent.player.publicKey.toBase58(),
          action: "close_all",
        }
      );
      const sig = await sendPreparedTransaction({
        base64: prepared.transaction_base64,
        connection: erConnection,
        signers: [agent.player],
        label: `MCP close ${agent.id}`,
      });
      const after = await fetchPlayerState(erConnection, agent.playerState);
      console.log(
        `    ${agent.id}: close ${sig.slice(0, 8)}, pnl ${
          Number(before?.realizedPnl ?? 0n) / 1e6
        } -> ${Number(after?.realizedPnl ?? 0n) / 1e6}`
      );
    }

    prices.push(await fetchLivePriceUsd(erConnection));
    await sleep(800);
  }

  const mcpSnapshotUrl = `${MCP_URL}/snapshot?game_pubkey=${gamePda}`;
  const uiSnapshotUrl = `${UI_URL}/api/arena/snapshot?game_pubkey=${gamePda}`;
  const mcpSnapshot = await fetchJson<ArenaSnapshot>(mcpSnapshotUrl);
  const mcpFreshness = assertFreshSnapshot({
    snapshot: mcpSnapshot,
    gamePda,
    source: "MCP",
  });
  const uiSnapshot = await fetchJson<ArenaSnapshot>(uiSnapshotUrl);
  assertFreshSnapshot({
    snapshot: uiSnapshot,
    gamePda,
    source: "UI proxy",
  });
  const outputPath = path.join(
    ARTIFACT_DIR,
    `mcp-agent-game-${gamePda.toBase58()}.json`
  );
  writeArtifact({
    recorded_at: new Date().toISOString(),
    game_pda: gamePda.toBase58(),
    game_id: gameId,
    mcp_url: MCP_URL,
    ui_url: UI_URL,
    mcp_snapshot_url: mcpSnapshotUrl,
    ui_snapshot_url: uiSnapshotUrl,
    output_path: outputPath,
    create_game_sig: createGameSig,
    delegate_game_sig: delegateGameSig,
    start_game_sig: startSig,
    agents: agents.map((agent) => ({
      id: agent.id,
      player: agent.player.publicKey.toBase58(),
      session: agent.session.publicKey.toBase58(),
      player_state: agent.playerState.toBase58(),
    })),
    snapshot: {
      updated_at: mcpSnapshot.updatedAt,
      age_ms: mcpFreshness.ageMs,
      agent_count: mcpFreshness.agentCount,
      trade_count: mcpFreshness.tradeCount,
    },
  });

  console.log("");
  console.log("Live MCP/UI success data");
  console.log(`  game: ${gamePda.toBase58()}`);
  console.log(`  start tx: ${txUrl("er", startSig)}`);
  console.log(`  agents in snapshot: ${mcpFreshness.agentCount}`);
  console.log(`  trades in snapshot: ${mcpFreshness.tradeCount}`);
  console.log(`  MCP snapshot URL: ${mcpSnapshotUrl}`);
  console.log(`  UI snapshot URL: ${uiSnapshotUrl}`);
  console.log(`  artifact: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
