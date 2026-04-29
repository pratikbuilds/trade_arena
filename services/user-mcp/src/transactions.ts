import { BN, Program, type Idl, type Provider } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createTopUpEscrowInstruction,
  escrowPdaFromEscrowAuthority,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import tradeArenaIdl from "./idl/trade_arena.json";
import { config } from "./config";
import {
  findGamePDA,
  findPlayerStatePDA,
  findVaultPDA,
  findSessionTokenPDA,
  DELEGATION_PROGRAM_ID,
  SESSION_KEYS_PROGRAM_ID,
} from "./pdas";
import type { Arena } from "./arena-registry";

const SESSION_LAMPORTS = 5_000_000;
const ESCROW_TOPUP_LAMPORTS = 20_000_000;
const SESSION_VALIDITY_SECONDS = 15 * 60;

// session-keys does not ship a TS client here, so use Anchor with the minimal
// IDL for the one public instruction this service prepares.
const SESSION_KEYS_IDL = {
  address: SESSION_KEYS_PROGRAM_ID.toBase58(),
  metadata: {
    name: "gplSession",
    version: "3.0.11",
    spec: "0.1.0",
  },
  instructions: [
    {
      name: "create_session",
      discriminator: [242, 193, 143, 179, 150, 25, 122, 227],
      accounts: [
        { name: "session_token", writable: true },
        { name: "session_signer", writable: true, signer: true },
        { name: "authority", writable: true, signer: true },
        { name: "target_program" },
        {
          name: "system_program",
          address: SystemProgram.programId.toBase58(),
        },
      ],
      args: [
        { name: "top_up", type: { option: "bool" } },
        { name: "valid_until", type: { option: "i64" } },
        { name: "lamports", type: { option: "u64" } },
      ],
    },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAnchorIdl(value: unknown): value is Idl {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.address === "string" &&
    isRecord(value.metadata) &&
    typeof value.metadata.name === "string" &&
    typeof value.metadata.version === "string" &&
    Array.isArray(value.instructions)
  );
}

function createAnchorProgram(
  idlValue: unknown,
  programId: PublicKey,
  connection: Connection
): Program {
  if (!isRecord(idlValue)) {
    throw new Error("Anchor IDL must be an object");
  }

  const idlWithAddress: unknown = {
    ...idlValue,
    address: programId.toBase58(),
  };

  if (!isAnchorIdl(idlWithAddress)) {
    throw new Error("Invalid Anchor IDL");
  }

  const provider: Provider = { connection };
  return new Program(idlWithAddress, provider);
}

/** Fresh Connection to the base layer (Solana devnet/mainnet). */
export function baseConnection(): Connection {
  return new Connection(config.TRADE_ARENA_BASE_RPC_URL, "confirmed");
}

/** Fresh Connection to the MagicBlock Ephemeral Rollup. */
export function erConnection(): Connection {
  return new Connection(config.TRADE_ARENA_ER_RPC_URL, "confirmed");
}

export type JoinArenaResult = {
  transaction: Transaction;
  playerState: PublicKey;
  sessionToken: PublicKey;
};

export type TradeSide = "long" | "short";
export type TradeAction =
  | { kind: "increase"; side: TradeSide; notionalUsdc: BN }
  | { kind: "reduce"; notionalUsdc: BN }
  | { kind: "close_all" };

export type TradePositionResult = {
  transaction: Transaction;
  playerState: PublicKey;
  sessionToken: PublicKey | null;
};

/**
 * Build an unsigned base-layer transaction that:
 *   1. Creates the player's USDC ATA if absent (idempotent)
 *   2. Joins the game (pays entry fee, initialises PlayerState)
 *   3. Creates a session key for low-latency ER trades
 *   4. Tops up the MagicBlock escrow so the sequencer can commit ER state
 *   5. Delegates the PlayerState to the Ephemeral Rollup
 *
 * The caller must sign locally with both `player` and `sessionSigner` keys.
 */
export async function buildJoinArenaTransaction(args: {
  arena: Arena;
  player: PublicKey;
  sessionSigner: PublicKey;
}): Promise<JoinArenaResult> {
  const { arena, player, sessionSigner } = args;

  const programId = new PublicKey(arena.program_id);
  const creator = new PublicKey(arena.creator);
  const tokenMint = new PublicKey(arena.token_mint);

  // Derive all PDAs
  const gamePda = findGamePDA(creator, arena.game_id, programId);
  const playerStatePda = findPlayerStatePDA(gamePda, player, programId);
  const vaultPda = findVaultPDA(gamePda, programId);
  const sessionToken = findSessionTokenPDA(programId, sessionSigner, player);
  const {
    createAssociatedTokenAccountIdempotentInstruction,
    getAssociatedTokenAddressSync,
  } = await import("@solana/spl-token");
  const playerUsdcAta = getAssociatedTokenAddressSync(tokenMint, player);
  const escrow = escrowPdaFromEscrowAuthority(player);

  const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    player,
    playerUsdcAta,
    player,
    tokenMint
  );

  const conn = baseConnection();
  const tradeArenaProgram = createAnchorProgram(tradeArenaIdl, programId, conn);
  const sessionProgram = createAnchorProgram(
    SESSION_KEYS_IDL,
    SESSION_KEYS_PROGRAM_ID,
    conn
  );

  const joinGameIx = await tradeArenaProgram.methods
    .joinGame()
    .accountsPartial({
      player,
      game: gamePda,
      playerState: playerStatePda,
      playerUsdc: playerUsdcAta,
      vault: vaultPda,
    })
    .instruction();

  const validUntil = Math.floor(Date.now() / 1000) + SESSION_VALIDITY_SECONDS;
  const sessionIx = await sessionProgram.methods
    .createSession(true, new BN(validUntil), new BN(SESSION_LAMPORTS))
    .accountsPartial({
      sessionToken,
      sessionSigner,
      authority: player,
      targetProgram: programId,
    })
    .instruction();

  const escrowTopupIx = createTopUpEscrowInstruction(
    escrow,
    player,
    player,
    ESCROW_TOPUP_LAMPORTS
  );

  const delegatePlayerIx = await tradeArenaProgram.methods
    .delegatePlayer()
    .accountsPartial({
      player,
      game: gamePda,
      playerState: playerStatePda,
      delegationProgram: DELEGATION_PROGRAM_ID,
    })
    .instruction();

  const { blockhash } = await conn.getLatestBlockhash("confirmed");

  const tx = new Transaction();
  tx.feePayer = player;
  tx.recentBlockhash = blockhash;
  tx.add(createAtaIx, joinGameIx, sessionIx, escrowTopupIx, delegatePlayerIx);

  return { transaction: tx, playerState: playerStatePda, sessionToken };
}

function toAnchorTradeAction(action: TradeAction) {
  switch (action.kind) {
    case "increase":
      return {
        increase: {
          side: action.side === "long" ? { long: {} } : { short: {} },
          notionalUsdc: action.notionalUsdc,
        },
      };
    case "reduce":
      return { reduce: { notionalUsdc: action.notionalUsdc } };
    case "close_all":
      return { closeAll: {} };
  }
}

/**
 * Build an unsigned ER transaction for the existing `trade_position`
 * instruction. The caller signs with either the player key directly or a
 * session signer that has a matching session token.
 */
export async function buildTradePositionTransaction(args: {
  arena: Arena;
  player: PublicKey;
  signer: PublicKey;
  action: TradeAction;
  priceFeed?: PublicKey;
}): Promise<TradePositionResult> {
  const { arena, player, signer, action } = args;

  const programId = new PublicKey(arena.program_id);
  const creator = new PublicKey(arena.creator);
  const gamePda = findGamePDA(creator, arena.game_id, programId);
  const playerStatePda = findPlayerStatePDA(gamePda, player, programId);
  const sessionToken = signer.equals(player)
    ? null
    : findSessionTokenPDA(programId, signer, player);
  const priceFeed = args.priceFeed ?? new PublicKey(arena.asset_feed);

  const conn = erConnection();
  const tradeArenaProgram = createAnchorProgram(tradeArenaIdl, programId, conn);

  const tradeIx = await tradeArenaProgram.methods
    .tradePosition(toAnchorTradeAction(action))
    .accountsPartial({
      game: gamePda,
      playerState: playerStatePda,
      sessionToken,
      signer,
      priceFeed,
    } as unknown as Parameters<ReturnType<typeof tradeArenaProgram.methods.tradePosition>["accountsPartial"]>[0])
    .instruction();

  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.feePayer = signer;
  tx.recentBlockhash = blockhash;
  tx.add(tradeIx);

  return { transaction: tx, playerState: playerStatePda, sessionToken };
}
