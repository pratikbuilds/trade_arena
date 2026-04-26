import { PublicKey } from "@solana/web3.js";

// MagicBlock infrastructure program IDs
export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);
export const SESSION_KEYS_PROGRAM_ID = new PublicKey(
  "KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5"
);

// Seeds — must match Rust constants exactly
const GAME_SEED = Buffer.from("game");
const PLAYER_SEED = Buffer.from("player");
const VAULT_SEED = Buffer.from("vault");
const SESSION_TOKEN_SEED = Buffer.from("session_token");

/** Encode a u64 as little-endian 8 bytes — matches Rust u64::to_le_bytes() */
export function u64Le(n: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
}

export function findGamePDA(
  creator: PublicKey,
  gameId: number,
  programId: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [GAME_SEED, creator.toBuffer(), u64Le(gameId)],
    programId
  )[0];
}

export function findPlayerStatePDA(
  game: PublicKey,
  player: PublicKey,
  programId: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [PLAYER_SEED, game.toBuffer(), player.toBuffer()],
    programId
  )[0];
}

export function findVaultPDA(game: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, game.toBuffer()],
    programId
  )[0];
}

export function findSessionTokenPDA(
  targetProgram: PublicKey,
  sessionSigner: PublicKey,
  authority: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      SESSION_TOKEN_SEED,
      targetProgram.toBuffer(),
      sessionSigner.toBuffer(),
      authority.toBuffer(),
    ],
    SESSION_KEYS_PROGRAM_ID
  )[0];
}

// MagicBlock delegation PDAs — all derived from DELEGATION_PROGRAM_ID

export function findBufferPDA(account: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), account.toBuffer()],
    DELEGATION_PROGRAM_ID
  )[0];
}

export function findDelegationRecordPDA(account: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-record"), account.toBuffer()],
    DELEGATION_PROGRAM_ID
  )[0];
}

export function findDelegationMetadataPDA(account: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-metadata"), account.toBuffer()],
    DELEGATION_PROGRAM_ID
  )[0];
}
