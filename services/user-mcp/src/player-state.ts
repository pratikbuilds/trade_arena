import { PublicKey, type AccountInfo, type Connection } from "@solana/web3.js";
import { findPlayerStatePDA } from "./pdas";

export const PLAYER_STATE_DISCRIMINATOR = Buffer.from([
  56, 3, 60, 86, 174, 16, 244, 195,
]);
export const PLAYER_STATE_ACCOUNT_LENGTH = 106;
const MICROS_PER_USD = 1_000_000;

export type PlayerStateSide = "long" | "short";
export type PlayerStateLayer = "er" | "base";

export type DecodedPlayerState = {
  player: PublicKey;
  game: PublicKey;
  virtualUsdc: bigint;
  positionSize: bigint;
  side: PlayerStateSide;
  entryPrice: bigint;
  realizedPnl: bigint;
};

export type PlayerStateResponse = {
  game_pubkey: string;
  player: string;
  player_state: string;
  found: boolean;
  layer: PlayerStateLayer | null;
  virtual_usdc: string | null;
  virtual_usdc_ui: number | null;
  open_position_size: string | null;
  open_position_size_ui: number | null;
  has_open_position: boolean;
  side: PlayerStateSide | null;
  entry_price: string | null;
  entry_price_ui: number | null;
  realized_pnl: string | null;
  realized_pnl_ui: number | null;
};

type ReadPlayerStateArgs = {
  gamePubkey: PublicKey;
  player: PublicKey;
  programId?: PublicKey;
  er?: Pick<Connection, "getAccountInfo">;
  base?: Pick<Connection, "getAccountInfo">;
};

function microsToUsd(value: bigint): number {
  return Number(value) / MICROS_PER_USD;
}

export function decodePlayerState(data: Buffer): DecodedPlayerState | null {
  if (
    data.length < PLAYER_STATE_ACCOUNT_LENGTH ||
    !data.subarray(0, 8).equals(PLAYER_STATE_DISCRIMINATOR)
  ) {
    return null;
  }

  let offset = 8;
  const player = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const game = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const virtualUsdc = data.readBigUInt64LE(offset);
  offset += 8;
  const positionSize = data.readBigUInt64LE(offset);
  offset += 8;
  const side = data[offset] === 1 ? "short" : "long";
  offset += 1;
  const entryPrice = data.readBigUInt64LE(offset);
  offset += 8;
  const realizedPnl = data.readBigInt64LE(offset);

  return {
    player,
    game,
    virtualUsdc,
    positionSize,
    side,
    entryPrice,
    realizedPnl,
  };
}

function emptyResponse(args: {
  gamePubkey: PublicKey;
  player: PublicKey;
  playerState: PublicKey;
}): PlayerStateResponse {
  return {
    game_pubkey: args.gamePubkey.toBase58(),
    player: args.player.toBase58(),
    player_state: args.playerState.toBase58(),
    found: false,
    layer: null,
    virtual_usdc: null,
    virtual_usdc_ui: null,
    open_position_size: null,
    open_position_size_ui: null,
    has_open_position: false,
    side: null,
    entry_price: null,
    entry_price_ui: null,
    realized_pnl: null,
    realized_pnl_ui: null,
  };
}

function responseFromDecoded(args: {
  gamePubkey: PublicKey;
  player: PublicKey;
  playerState: PublicKey;
  layer: PlayerStateLayer;
  parsed: DecodedPlayerState;
}): PlayerStateResponse {
  const hasOpenPosition = args.parsed.positionSize > 0n;
  return {
    game_pubkey: args.gamePubkey.toBase58(),
    player: args.player.toBase58(),
    player_state: args.playerState.toBase58(),
    found: true,
    layer: args.layer,
    virtual_usdc: args.parsed.virtualUsdc.toString(),
    virtual_usdc_ui: microsToUsd(args.parsed.virtualUsdc),
    open_position_size: args.parsed.positionSize.toString(),
    open_position_size_ui: microsToUsd(args.parsed.positionSize),
    has_open_position: hasOpenPosition,
    side: hasOpenPosition ? args.parsed.side : null,
    entry_price: args.parsed.entryPrice.toString(),
    entry_price_ui: microsToUsd(args.parsed.entryPrice),
    realized_pnl: args.parsed.realizedPnl.toString(),
    realized_pnl_ui: microsToUsd(args.parsed.realizedPnl),
  };
}

function decodeMatchingAccount(args: {
  account: AccountInfo<Buffer> | null;
  gamePubkey: PublicKey;
  player: PublicKey;
}): DecodedPlayerState | null {
  if (!args.account) return null;

  const parsed = decodePlayerState(Buffer.from(args.account.data));
  if (
    !parsed ||
    !parsed.game.equals(args.gamePubkey) ||
    !parsed.player.equals(args.player)
  ) {
    return null;
  }

  return parsed;
}

export async function getPlayerState(
  args: ReadPlayerStateArgs
): Promise<PlayerStateResponse> {
  const programId =
    args.programId ??
    new PublicKey((await import("./config.js")).config.TRADE_ARENA_PROGRAM_ID);
  const playerState = findPlayerStatePDA(
    args.gamePubkey,
    args.player,
    programId
  );
  const defaultConnections =
    !args.er || !args.base ? await import("./transactions.js") : null;
  const layers: Array<{
    layer: PlayerStateLayer;
    connection: Pick<Connection, "getAccountInfo">;
  }> = [
    {
      layer: "er",
      connection: args.er ?? defaultConnections!.erConnection(),
    },
    {
      layer: "base",
      connection: args.base ?? defaultConnections!.baseConnection(),
    },
  ];

  for (const { layer, connection } of layers) {
    const account = await connection.getAccountInfo(playerState, "confirmed");
    const parsed = decodeMatchingAccount({
      account,
      gamePubkey: args.gamePubkey,
      player: args.player,
    });
    if (!parsed) continue;

    return responseFromDecoded({
      gamePubkey: args.gamePubkey,
      player: args.player,
      playerState,
      layer,
      parsed,
    });
  }

  return emptyResponse({
    gamePubkey: args.gamePubkey,
    player: args.player,
    playerState,
  });
}
