import { PublicKey, type AccountInfo } from "@solana/web3.js";
import { config } from "./config";
import { DELEGATION_PROGRAM_ID, findGamePDA } from "./pdas";
import { baseConnection } from "./transactions";

const GAME_ACCOUNT_DISCRIMINATOR = Buffer.from([
  27, 90, 166, 125, 74, 100, 121, 18,
]);
const GAME_ACCOUNT_MIN_LENGTH = 196;

export type ArenaStatus = "joinable" | "active" | "ended";

export type Arena = {
  game_pubkey: string;
  name: string;
  description: string;
  creator: string;
  game_id: number;
  game_pda: string;
  program_id: string;
  status: ArenaStatus;
  entry_fee_usdc: string;
  duration_seconds: number;
  start_time: number;
  player_count: number;
  max_players: number;
  prize_pool_usdc: string;
  asset_feed: string;
  token_mint: string;
  leader_value: string;
  winner: string | null;
  delegated: boolean;
};

type DecodedGame = Omit<
  Arena,
  | "game_pubkey"
  | "name"
  | "description"
  | "game_pda"
  | "program_id"
  | "delegated"
>;

function readU64(data: Buffer, offset: number): bigint {
  return data.readBigUInt64LE(offset);
}

function readI64(data: Buffer, offset: number): bigint {
  return data.readBigInt64LE(offset);
}

function readPubkey(data: Buffer, offset: number): PublicKey {
  return new PublicKey(data.subarray(offset, offset + 32));
}

function statusFromVariant(value: number): ArenaStatus {
  switch (value) {
    case 0:
      return "joinable";
    case 1:
      return "active";
    case 2:
      return "ended";
    default:
      throw new Error(`Unknown GameStatus variant ${value}`);
  }
}

export function decodeGameAccount(data: Buffer): DecodedGame {
  if (data.length < GAME_ACCOUNT_MIN_LENGTH) {
    throw new Error("Game account data is too short");
  }

  if (!data.subarray(0, 8).equals(GAME_ACCOUNT_DISCRIMINATOR)) {
    throw new Error("Account is not a Trade Arena Game account");
  }

  let offset = 8;
  const creator = readPubkey(data, offset);
  offset += 32;
  const gameId = readU64(data, offset);
  offset += 8;
  const assetFeed = readPubkey(data, offset);
  offset += 32;
  const entryFee = readU64(data, offset);
  offset += 8;
  const duration = readI64(data, offset);
  offset += 8;
  const startTime = readI64(data, offset);
  offset += 8;
  const status = statusFromVariant(data.readUInt8(offset));
  offset += 1;
  const playerCount = data.readUInt32LE(offset);
  offset += 4;
  const maxPlayers = data.readUInt32LE(offset);
  offset += 4;
  const prizePool = readU64(data, offset);
  offset += 8;
  const tokenMint = readPubkey(data, offset);
  offset += 32;
  const leaderValue = readU64(data, offset);
  offset += 8;
  const winnerTag = data.readUInt8(offset);
  offset += 1;
  const winner = winnerTag === 1 ? readPubkey(data, offset).toBase58() : null;

  return {
    creator: creator.toBase58(),
    game_id: Number(gameId),
    asset_feed: assetFeed.toBase58(),
    status,
    entry_fee_usdc: entryFee.toString(),
    duration_seconds: Number(duration),
    start_time: Number(startTime),
    player_count: playerCount,
    max_players: maxPlayers,
    prize_pool_usdc: prizePool.toString(),
    token_mint: tokenMint.toBase58(),
    leader_value: leaderValue.toString(),
    winner,
  };
}

function arenaFromGameAccount(args: {
  pubkey: PublicKey;
  info: AccountInfo<Buffer>;
  programId: PublicKey;
}): Arena {
  const game = decodeGameAccount(args.info.data);
  return {
    ...game,
    game_pubkey: args.pubkey.toBase58(),
    game_pda: args.pubkey.toBase58(),
    name: `Trade Arena #${game.game_id}`,
    description: "",
    program_id: args.programId.toBase58(),
    delegated: args.info.owner.equals(DELEGATION_PROGRAM_ID),
  };
}

function isGameAccount(info: AccountInfo<Buffer>): boolean {
  return (
    info.data.length >= GAME_ACCOUNT_MIN_LENGTH &&
    info.data.subarray(0, 8).equals(GAME_ACCOUNT_DISCRIMINATOR)
  );
}

function isExpectedGamePda(arena: Arena, programId: PublicKey): boolean {
  const expectedPda = findGamePDA(
    new PublicKey(arena.creator),
    arena.game_id,
    programId
  );
  return expectedPda.equals(new PublicKey(arena.game_pda));
}

export async function listArenas(
  status?: ArenaStatus | "all"
): Promise<Arena[]> {
  const programId = new PublicKey(config.TRADE_ARENA_PROGRAM_ID);
  const connection = baseConnection();
  const [programOwned, delegated] = await Promise.all([
    connection.getProgramAccounts(programId, {
      filters: [{ dataSize: GAME_ACCOUNT_MIN_LENGTH }],
    }),
    connection.getProgramAccounts(DELEGATION_PROGRAM_ID, {
      filters: [{ dataSize: GAME_ACCOUNT_MIN_LENGTH }],
    }),
  ]);

  const byPda = new Map<string, Arena>();
  for (const { pubkey, account } of [...programOwned, ...delegated]) {
    if (!isGameAccount(account)) continue;
    const arena = arenaFromGameAccount({ pubkey, info: account, programId });
    if (!isExpectedGamePda(arena, programId)) continue;
    byPda.set(arena.game_pda, arena);
  }

  const arenas = [...byPda.values()].sort((a, b) => b.game_id - a.game_id);
  if (!status || status === "all") return arenas;
  return arenas.filter((arena) => arena.status === status);
}

export async function getArenaByPubkey(
  gamePubkey: string
): Promise<Arena | null> {
  let gamePda: PublicKey;
  try {
    gamePda = new PublicKey(gamePubkey);
  } catch {
    return null;
  }

  const programId = new PublicKey(config.TRADE_ARENA_PROGRAM_ID);
  const info = await baseConnection().getAccountInfo(gamePda, "confirmed");
  if (
    !info ||
    (!info.owner.equals(programId) && !info.owner.equals(DELEGATION_PROGRAM_ID))
  ) {
    return null;
  }

  if (!isGameAccount(info)) return null;

  const arena = arenaFromGameAccount({ pubkey: gamePda, info, programId });
  if (!isExpectedGamePda(arena, programId)) {
    throw new Error(`Game account ${gamePubkey} does not match its PDA seeds`);
  }
  return arena;
}
