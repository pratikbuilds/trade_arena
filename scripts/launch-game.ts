import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { createMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { TradeArena } from "../target/types/trade_arena";

const DEFAULT_BASE_RPC_URL = "https://api.devnet.solana.com";
const DEFAULT_WALLET = "~/.config/solana/id.json";
const GAME_SEED = Buffer.from("game");
const VAULT_SEED = Buffer.from("vault");
const DEFAULT_PRICE_FEED = "71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr";
const DELEGATION_PROGRAM_ID = new anchor.web3.PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);

type Command = "create" | "delegate-game" | "status";

type CreateConfig = {
  assetFeed: anchor.web3.PublicKey;
  durationSeconds: number;
  entryFeeMicros: number;
  gameId: number;
  maxPlayers: number;
  tokenMint: anchor.web3.PublicKey | null;
};

function printHelp(): void {
  console.log(`Trade Arena admin game script

Creates games as the admin and reads on-chain game state.

Commands:
  yarn launch:game create
  yarn launch:game delegate-game <GAME_PDA>
  yarn launch:game status <GAME_PDA>

Create environment:
  LAUNCH_GAME_ID                 Optional numeric game id. Defaults to Date.now() % 1_000_000.
  LAUNCH_ENTRY_FEE_MICRO_USDC    Entry fee in 6-decimal units. Defaults to 1000000.
  LAUNCH_DURATION_SECONDS        Game duration. Defaults to 900.
  LAUNCH_MAX_PLAYERS             Max players. Defaults to 3.
  LAUNCH_TOKEN_MINT              Existing token mint. If omitted, a devnet test mint is created.
  TRADE_ARENA_PRICE_FEED         Price feed. Defaults to BTC/USD Pyth Lazer devnet feed.

Provider environment:
  ANCHOR_PROVIDER_URL            Base-layer RPC URL. Defaults to devnet.
  ANCHOR_WALLET                  Admin wallet path. Defaults to ~/.config/solana/id.json.
`);
}

function expandTilde(filePath: string): string {
  if (filePath === "~") return process.env.HOME ?? filePath;
  if (filePath.startsWith("~/")) {
    return path.join(process.env.HOME ?? "~", filePath.slice(2));
  }
  return filePath;
}

function positiveIntEnv(name: string, fallback: string): number {
  const value = process.env[name] ?? fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer. Received: ${value}`);
  }
  return parsed;
}

function optionalPubkeyEnv(name: string): anchor.web3.PublicKey | null {
  const value = process.env[name];
  if (!value) return null;
  return new anchor.web3.PublicKey(value);
}

function configureProvider(): anchor.AnchorProvider {
  const wallet = expandTilde(process.env.ANCHOR_WALLET ?? DEFAULT_WALLET);
  if (!fs.existsSync(wallet)) {
    throw new Error(`Anchor wallet does not exist: ${wallet}`);
  }

  process.env.ANCHOR_PROVIDER_URL =
    process.env.ANCHOR_PROVIDER_URL ??
    process.env.TRADE_ARENA_BASE_RPC_URL ??
    DEFAULT_BASE_RPC_URL;
  process.env.ANCHOR_WALLET = wallet;

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  return provider;
}

function parseCommand(): Command {
  const command = process.argv[2] ?? "create";
  if (command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }
  if (
    command !== "create" &&
    command !== "delegate-game" &&
    command !== "status"
  ) {
    throw new Error(`Unknown command '${command}'. Run with --help.`);
  }
  return command;
}

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

function findVaultPDA(
  game: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey
): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [VAULT_SEED, game.toBuffer()],
    programId
  )[0];
}

function statusName(status: unknown): string {
  if (!status || typeof status !== "object") return "unknown";
  return Object.keys(status as Record<string, unknown>)[0] ?? "unknown";
}

function statusFromVariant(value: number): string {
  switch (value) {
    case 0:
      return "waitingForPlayers";
    case 1:
      return "active";
    case 2:
      return "ended";
    default:
      return `unknown:${value}`;
  }
}

function readPubkey(data: Buffer, offset: number): anchor.web3.PublicKey {
  return new anchor.web3.PublicKey(data.subarray(offset, offset + 32));
}

function decodeGameData(data: Buffer) {
  let offset = 8;
  const creator = readPubkey(data, offset);
  offset += 32;
  const gameId = data.readBigUInt64LE(offset);
  offset += 8;
  const assetFeed = readPubkey(data, offset);
  offset += 32;
  const entryFee = data.readBigUInt64LE(offset);
  offset += 8;
  const duration = data.readBigInt64LE(offset);
  offset += 8;
  const startTime = data.readBigInt64LE(offset);
  offset += 8;
  const status = statusFromVariant(data.readUInt8(offset));
  offset += 1;
  const playerCount = data.readUInt32LE(offset);
  offset += 4;
  const maxPlayers = data.readUInt32LE(offset);
  offset += 4;
  const prizePool = data.readBigUInt64LE(offset);
  offset += 8;
  const tokenMint = readPubkey(data, offset);
  offset += 32;
  const leaderValue = data.readBigUInt64LE(offset);
  offset += 8;
  const winnerTag = data.readUInt8(offset);
  offset += 1;
  const winner = winnerTag === 1 ? readPubkey(data, offset).toBase58() : null;

  return {
    creator,
    gameId,
    assetFeed,
    entryFee,
    duration,
    startTime,
    status,
    playerCount,
    maxPlayers,
    prizePool,
    tokenMint,
    leaderValue,
    winner,
  };
}

function bnString(value: unknown): string {
  if (BN.isBN(value)) return value.toString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return String(value);
  return String(value ?? "");
}

function nullablePubkey(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof anchor.web3.PublicKey) return value.toBase58();
  return String(value);
}

function buildCreateConfig(): CreateConfig {
  return {
    assetFeed: new anchor.web3.PublicKey(
      process.env.TRADE_ARENA_PRICE_FEED ?? DEFAULT_PRICE_FEED
    ),
    durationSeconds: positiveIntEnv("LAUNCH_DURATION_SECONDS", "900"),
    entryFeeMicros: positiveIntEnv("LAUNCH_ENTRY_FEE_MICRO_USDC", "1000000"),
    gameId: positiveIntEnv("LAUNCH_GAME_ID", String(Date.now() % 1_000_000)),
    maxPlayers: positiveIntEnv("LAUNCH_MAX_PLAYERS", "3"),
    tokenMint: optionalPubkeyEnv("LAUNCH_TOKEN_MINT"),
  };
}

async function createGame(args: {
  program: Program<TradeArena>;
  provider: anchor.AnchorProvider;
}): Promise<void> {
  const { program, provider } = args;
  const config = buildCreateConfig();
  const admin = provider.wallet.publicKey;
  const payer = (
    provider.wallet as anchor.Wallet & { payer: anchor.web3.Keypair }
  ).payer;
  const tokenMint =
    config.tokenMint ??
    (await createMint(provider.connection, payer, admin, null, 6));
  const gamePda = findGamePDA(admin, config.gameId, program.programId);
  const vaultPda = findVaultPDA(gamePda, program.programId);

  const tx = await program.methods
    .createGame(
      new BN(config.gameId),
      new BN(config.entryFeeMicros),
      new BN(config.durationSeconds),
      config.maxPlayers
    )
    .accountsPartial({
      creator: admin,
      game: gamePda,
      usdcMint: tokenMint,
      vault: vaultPda,
      assetFeed: config.assetFeed,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  console.log(
    JSON.stringify(
      {
        action: "create_game",
        tx,
        admin: admin.toBase58(),
        game_id: config.gameId,
        game_pda: gamePda.toBase58(),
        vault_pda: vaultPda.toBase58(),
        token_mint: tokenMint.toBase58(),
        asset_feed: config.assetFeed.toBase58(),
        entry_fee_micro_usdc: config.entryFeeMicros,
        duration_seconds: config.durationSeconds,
        max_players: config.maxPlayers,
      },
      null,
      2
    )
  );
}

async function printStatus(program: Program<TradeArena>): Promise<void> {
  const gameArg = process.argv[3] ?? process.env.LAUNCH_GAME_PDA;
  if (!gameArg) {
    throw new Error(
      "Missing game PDA. Usage: yarn launch:game status <GAME_PDA>"
    );
  }

  const gamePda = new anchor.web3.PublicKey(gameArg);
  const accountInfo = await anchor
    .getProvider()
    .connection.getAccountInfo(gamePda, "confirmed");
  if (!accountInfo) {
    throw new Error(`Game account not found: ${gamePda.toBase58()}`);
  }

  const account = decodeGameData(Buffer.from(accountInfo.data));
  const vaultPda = findVaultPDA(gamePda, program.programId);
  const delegated = accountInfo.owner.equals(DELEGATION_PROGRAM_ID);

  console.log(
    JSON.stringify(
      {
        action: "game_status",
        game_pda: gamePda.toBase58(),
        vault_pda: vaultPda.toBase58(),
        owner: accountInfo.owner.toBase58(),
        delegated,
        creator: account.creator.toBase58(),
        game_id: account.gameId.toString(),
        asset_feed: account.assetFeed.toBase58(),
        entry_fee_micro_usdc: account.entryFee.toString(),
        duration_seconds: account.duration.toString(),
        start_time: account.startTime.toString(),
        status: account.status,
        player_count: account.playerCount,
        max_players: account.maxPlayers,
        prize_pool_micro_usdc: account.prizePool.toString(),
        token_mint: account.tokenMint.toBase58(),
        leader_value: account.leaderValue.toString(),
        winner: account.winner,
      },
      null,
      2
    )
  );
}

async function delegateGame(args: {
  program: Program<TradeArena>;
  provider: anchor.AnchorProvider;
}): Promise<void> {
  const gameArg = process.argv[3] ?? process.env.LAUNCH_GAME_PDA;
  if (!gameArg) {
    throw new Error(
      "Missing game PDA. Usage: yarn launch:game delegate-game <GAME_PDA>"
    );
  }

  const { program, provider } = args;
  const gamePda = new anchor.web3.PublicKey(gameArg);
  const accountInfo = await provider.connection.getAccountInfo(
    gamePda,
    "confirmed"
  );
  if (!accountInfo) {
    throw new Error(`Game account not found: ${gamePda.toBase58()}`);
  }
  if (accountInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
    throw new Error(`Game is already delegated: ${gamePda.toBase58()}`);
  }
  if (!accountInfo.owner.equals(program.programId)) {
    throw new Error(
      `Game owner is ${accountInfo.owner.toBase58()}, expected ${program.programId.toBase58()}`
    );
  }

  const account = decodeGameData(Buffer.from(accountInfo.data));
  if (!account.creator.equals(provider.wallet.publicKey)) {
    throw new Error(
      `Current admin ${provider.wallet.publicKey.toBase58()} is not game creator ${account.creator.toBase58()}`
    );
  }
  if (account.status !== "waitingForPlayers") {
    throw new Error(
      `Game status must be waitingForPlayers, got ${account.status}`
    );
  }

  const tx = await program.methods
    .delegateGame(new BN(account.gameId.toString()))
    .accountsPartial({
      creator: provider.wallet.publicKey,
      game: gamePda,
      ownerProgram: program.programId,
      delegationProgram: DELEGATION_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  const after = await provider.connection.getAccountInfo(gamePda, "confirmed");
  console.log(
    JSON.stringify(
      {
        action: "delegate_game",
        tx,
        game_pda: gamePda.toBase58(),
        game_id: account.gameId.toString(),
        owner: after?.owner.toBase58() ?? null,
        delegated: after?.owner.equals(DELEGATION_PROGRAM_ID) ?? false,
      },
      null,
      2
    )
  );
}

async function main(): Promise<void> {
  const command = parseCommand();
  const provider = configureProvider();
  const program = anchor.workspace.TradeArena as Program<TradeArena>;

  if (command === "create") {
    await createGame({ program, provider });
    return;
  }

  if (command === "delegate-game") {
    await delegateGame({ program, provider });
    return;
  }

  await printStatus(program);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
