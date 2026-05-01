import { PublicKey } from "@solana/web3.js";
import type { Idl } from "@coral-xyz/anchor";
import { tradeArenaIdl } from "./idl/trade_arena_idl";
import { getArenaByPubkey } from "./arena-registry";
import { findPlayerStatePDA } from "./pdas";
import { erConnection } from "./transactions";

const TRADE_POSITION_DISCRIMINATOR = Buffer.from(
  (tradeArenaIdl as Idl).instructions.find(
    (item) => item.name === "trade_position"
  )?.discriminator ?? []
);

export type DecodedTradeAction =
  | { kind: "increase"; side: "long" | "short"; notional_usdc: string }
  | { kind: "reduce"; notional_usdc: string }
  | { kind: "close_all" };

export type UserTrade = {
  signature: string;
  slot: number;
  block_time: number | null;
  game_pubkey: string;
  player: string;
  player_state: string;
  signer: string | null;
  price_feed: string | null;
  action: DecodedTradeAction;
  logs: string[];
  err: unknown;
};

function readU64(data: Uint8Array, offset: number): bigint {
  return Buffer.from(data.subarray(offset, offset + 8)).readBigUInt64LE();
}

export function decodeTradePositionAction(
  data: Uint8Array
): DecodedTradeAction | null {
  if (
    data.length < 9 ||
    !Buffer.from(data.subarray(0, 8)).equals(TRADE_POSITION_DISCRIMINATOR)
  ) {
    return null;
  }

  const variant = data[8];
  if (variant === 0) {
    if (data.length < 18) return null;
    const sideVariant = data[9];
    if (sideVariant !== 0 && sideVariant !== 1) return null;
    return {
      kind: "increase",
      side: sideVariant === 0 ? "long" : "short",
      notional_usdc: readU64(data, 10).toString(),
    };
  }

  if (variant === 1) {
    if (data.length < 17) return null;
    return {
      kind: "reduce",
      notional_usdc: readU64(data, 9).toString(),
    };
  }

  if (variant === 2) {
    return { kind: "close_all" };
  }

  return null;
}

function tradeLogs(logs: string[] | null | undefined): string[] {
  return (logs ?? []).filter((log) =>
    /\b(Opened|Increased|Reduced|Closed)\b/.test(log)
  );
}

export async function getUserTrades(args: {
  gamePubkey: string;
  player: PublicKey;
  limit?: number;
}): Promise<{ player_state: string; trades: UserTrade[] } | null> {
  const arena = await getArenaByPubkey(args.gamePubkey);
  if (!arena) return null;

  const programId = new PublicKey(arena.program_id);
  const game = new PublicKey(arena.game_pda);
  const playerState = findPlayerStatePDA(game, args.player, programId);
  const connection = erConnection();
  const signatures = await connection.getSignaturesForAddress(playerState, {
    limit: args.limit ?? 100,
  });

  const trades: UserTrade[] = [];
  for (const signatureInfo of signatures) {
    const tx = await connection.getTransaction(signatureInfo.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) continue;

    const message = tx.transaction.message;
    const accountKeys = message.getAccountKeys({
      accountKeysFromLookups: tx.meta?.loadedAddresses,
    });

    for (const instruction of message.compiledInstructions) {
      const program = accountKeys.get(instruction.programIdIndex);
      if (!program?.equals(programId)) continue;

      const action = decodeTradePositionAction(instruction.data);
      if (!action) continue;

      const accounts = instruction.accountKeyIndexes.map((index) =>
        accountKeys.get(index)
      );
      const ixGame = accounts[0];
      const ixPlayerState = accounts[1];
      if (!ixGame?.equals(game) || !ixPlayerState?.equals(playerState)) {
        continue;
      }

      trades.push({
        signature: signatureInfo.signature,
        slot: tx.slot,
        block_time: tx.blockTime ?? null,
        game_pubkey: arena.game_pubkey,
        player: args.player.toBase58(),
        player_state: playerState.toBase58(),
        signer: accounts[3]?.toBase58() ?? null,
        price_feed: accounts[4]?.toBase58() ?? null,
        action,
        logs: tradeLogs(tx.meta?.logMessages),
        err: tx.meta?.err ?? null,
      });
    }
  }

  return { player_state: playerState.toBase58(), trades };
}
