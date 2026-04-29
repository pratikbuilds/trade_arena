import { expect } from "chai";
import { PublicKey, type AccountInfo, type Connection } from "@solana/web3.js";
import {
  decodePlayerState,
  getPlayerState,
  PLAYER_STATE_ACCOUNT_LENGTH,
} from "../src/player-state";
import { findPlayerStatePDA } from "../src/pdas";

const PLAYER_STATE_DISCRIMINATOR = Buffer.from([
  56, 3, 60, 86, 174, 16, 244, 195,
]);

const PROGRAM_ID = new PublicKey(
  "FkGTyZiUCFqPi7hPjBxDBRJVREhV8SYbbBLBxMqZLnYM"
);
const GAME = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
const PLAYER = new PublicKey("6sbzC1eH4FTujJXWj51eQe25cYvr4xfXbJ1Dqx1XQNB5");

function playerStateBuffer(args: {
  player?: PublicKey;
  game?: PublicKey;
  virtualUsdc?: bigint;
  positionSize?: bigint;
  sideFlag?: number;
  entryPrice?: bigint;
  realizedPnl?: bigint;
}): Buffer {
  const data = Buffer.alloc(PLAYER_STATE_ACCOUNT_LENGTH);
  PLAYER_STATE_DISCRIMINATOR.copy(data, 0);

  let offset = 8;
  (args.player ?? PLAYER).toBuffer().copy(data, offset);
  offset += 32;
  (args.game ?? GAME).toBuffer().copy(data, offset);
  offset += 32;
  data.writeBigUInt64LE(args.virtualUsdc ?? 9_500_000_000n, offset);
  offset += 8;
  data.writeBigUInt64LE(args.positionSize ?? 250_000_000n, offset);
  offset += 8;
  data[offset] = args.sideFlag ?? 1;
  offset += 1;
  data.writeBigUInt64LE(args.entryPrice ?? 70_125_000_000n, offset);
  offset += 8;
  data.writeBigInt64LE(args.realizedPnl ?? -125_000_000n, offset);

  return data;
}

function account(data: Buffer): AccountInfo<Buffer> {
  return {
    data,
    executable: false,
    lamports: 1,
    owner: PROGRAM_ID,
    rentEpoch: 0,
  };
}

function mockConnection(
  accountInfo: AccountInfo<Buffer> | null
): Pick<Connection, "getAccountInfo"> {
  return {
    getAccountInfo: async () => accountInfo,
  } as Pick<Connection, "getAccountInfo">;
}

describe("decodePlayerState", () => {
  it("decodes a PlayerState account buffer", () => {
    const parsed = decodePlayerState(playerStateBuffer({}));

    expect(parsed?.player.toBase58()).to.equal(PLAYER.toBase58());
    expect(parsed?.game.toBase58()).to.equal(GAME.toBase58());
    expect(parsed?.virtualUsdc).to.equal(9_500_000_000n);
    expect(parsed?.positionSize).to.equal(250_000_000n);
    expect(parsed?.side).to.equal("short");
    expect(parsed?.entryPrice).to.equal(70_125_000_000n);
    expect(parsed?.realizedPnl).to.equal(-125_000_000n);
  });

  it("rejects short or non-PlayerState account buffers", () => {
    expect(
      decodePlayerState(Buffer.alloc(PLAYER_STATE_ACCOUNT_LENGTH - 1))
    ).to.equal(null);
    expect(
      decodePlayerState(Buffer.alloc(PLAYER_STATE_ACCOUNT_LENGTH))
    ).to.equal(null);
  });
});

describe("getPlayerState", () => {
  it("returns the ER PlayerState before checking the base layer", async () => {
    const result = await getPlayerState({
      gamePubkey: GAME,
      player: PLAYER,
      programId: PROGRAM_ID,
      er: mockConnection(account(playerStateBuffer({}))),
      base: mockConnection(account(playerStateBuffer({ sideFlag: 0 }))),
    });

    expect(result.found).to.equal(true);
    expect(result.layer).to.equal("er");
    expect(result.player_state).to.equal(
      findPlayerStatePDA(GAME, PLAYER, PROGRAM_ID).toBase58()
    );
    expect(result.virtual_usdc).to.equal("9500000000");
    expect(result.virtual_usdc_ui).to.equal(9500);
    expect(result.open_position_size).to.equal("250000000");
    expect(result.open_position_size_ui).to.equal(250);
    expect(result.has_open_position).to.equal(true);
    expect(result.side).to.equal("short");
    expect(result.entry_price).to.equal("70125000000");
    expect(result.entry_price_ui).to.equal(70125);
    expect(result.realized_pnl).to.equal("-125000000");
    expect(result.realized_pnl_ui).to.equal(-125);
  });

  it("falls back to the base layer when ER has no PlayerState", async () => {
    const result = await getPlayerState({
      gamePubkey: GAME,
      player: PLAYER,
      programId: PROGRAM_ID,
      er: mockConnection(null),
      base: mockConnection(account(playerStateBuffer({ sideFlag: 0 }))),
    });

    expect(result.found).to.equal(true);
    expect(result.layer).to.equal("base");
    expect(result.side).to.equal("long");
  });

  it("returns found=false for a missing player", async () => {
    const result = await getPlayerState({
      gamePubkey: GAME,
      player: PLAYER,
      programId: PROGRAM_ID,
      er: mockConnection(null),
      base: mockConnection(null),
    });

    expect(result).to.include({
      game_pubkey: GAME.toBase58(),
      player: PLAYER.toBase58(),
      found: false,
      layer: null,
      virtual_usdc: null,
      open_position_size: null,
      has_open_position: false,
      side: null,
      entry_price: null,
      realized_pnl: null,
    });
    expect(result.player_state).to.equal(
      findPlayerStatePDA(GAME, PLAYER, PROGRAM_ID).toBase58()
    );
  });
});
