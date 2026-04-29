import { PublicKey } from "@solana/web3.js";
import { getArenaByPubkey } from "./arena-registry";
import { baseConnection } from "./transactions";

export type GameStatusResult =
  | {
      game_pubkey: string;
      game_pda: string;
      exists: true;
      lamports: number;
      data_len: number;
      owner: string;
      delegated: boolean;
      status: string;
      player_count: number;
      max_players: number;
      prize_pool_usdc: string;
      winner: string | null;
    }
  | {
      game_pubkey: string;
      game_pda: string;
      exists: false;
    };

export async function getGameStatusByPubkey(
  gamePubkey: string
): Promise<GameStatusResult | null> {
  const arena = await getArenaByPubkey(gamePubkey);
  if (!arena) return null;

  const gamePda = new PublicKey(arena.game_pda);
  const info = await baseConnection().getAccountInfo(gamePda);

  return info
    ? {
        game_pubkey: gamePubkey,
        game_pda: gamePda.toBase58(),
        exists: true,
        lamports: info.lamports,
        data_len: info.data.length,
        owner: info.owner.toBase58(),
        delegated: arena.delegated,
        status: arena.status,
        player_count: arena.player_count,
        max_players: arena.max_players,
        prize_pool_usdc: arena.prize_pool_usdc,
        winner: arena.winner,
      }
    : { game_pubkey: gamePubkey, game_pda: gamePda.toBase58(), exists: false };
}
