import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";

const GAME_DISCRIMINATOR = Buffer.from([27, 90, 166, 125, 74, 100, 121, 18]);

function writePubkey(data: Buffer, offset: number, value: PublicKey): number {
  value.toBuffer().copy(data, offset);
  return offset + 32;
}

function writeU64(data: Buffer, offset: number, value: bigint): number {
  data.writeBigUInt64LE(value, offset);
  return offset + 8;
}

function writeI64(data: Buffer, offset: number, value: bigint): number {
  data.writeBigInt64LE(value, offset);
  return offset + 8;
}

function buildGameBuffer(args?: {
  status?: number;
  winner?: PublicKey;
}): Buffer {
  const data = Buffer.alloc(196);
  GAME_DISCRIMINATOR.copy(data, 0);

  let offset = 8;
  offset = writePubkey(
    data,
    offset,
    new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")
  );
  offset = writeU64(data, offset, 7n);
  offset = writePubkey(
    data,
    offset,
    new PublicKey("71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr")
  );
  offset = writeU64(data, offset, 1_000_000n);
  offset = writeI64(data, offset, 300n);
  offset = writeI64(data, offset, 1_714_000_000n);
  data.writeUInt8(args?.status ?? 0, offset);
  offset += 1;
  data.writeUInt32LE(2, offset);
  offset += 4;
  data.writeUInt32LE(8, offset);
  offset += 4;
  offset = writeU64(data, offset, 2_000_000n);
  offset = writePubkey(
    data,
    offset,
    new PublicKey("So11111111111111111111111111111111111111112")
  );
  offset = writeU64(data, offset, 10_250_000_000n);

  if (args?.winner) {
    data.writeUInt8(1, offset);
    offset += 1;
    offset = writePubkey(data, offset, args.winner);
  } else {
    data.writeUInt8(0, offset);
    offset += 33;
  }

  data.writeUInt8(254, offset);
  offset += 1;
  data.writeUInt8(253, offset);
  return data;
}

describe("decodeGameAccount", () => {
  before(() => {
    process.env.TRADE_ARENA_BASE_RPC_URL = "https://api.devnet.solana.com";
    process.env.TRADE_ARENA_ER_RPC_URL = "https://devnet.magicblock.app";
  });

  it("decodes arena metadata from an on-chain Game account buffer", async () => {
    const { decodeGameAccount } = await import("../src/arena-registry");
    const game = decodeGameAccount(buildGameBuffer());

    expect(game.game_id).to.equal(7);
    expect(game.status).to.equal("joinable");
    expect(game.entry_fee_usdc).to.equal("1000000");
    expect(game.duration_seconds).to.equal(300);
    expect(game.player_count).to.equal(2);
    expect(game.max_players).to.equal(8);
    expect(game.prize_pool_usdc).to.equal("2000000");
    expect(game.winner).to.equal(null);
  });

  it("maps active and ended status variants", async () => {
    const { decodeGameAccount } = await import("../src/arena-registry");

    expect(decodeGameAccount(buildGameBuffer({ status: 1 })).status).to.equal(
      "active"
    );
    expect(decodeGameAccount(buildGameBuffer({ status: 2 })).status).to.equal(
      "ended"
    );
  });

  it("decodes an optional winner", async () => {
    const { decodeGameAccount } = await import("../src/arena-registry");
    const winner = new PublicKey(
      "6sbzC1eH4FTujJXWj51eQe25cYvr4xfXbJ1Dqx1XQNB5"
    );
    const game = decodeGameAccount(buildGameBuffer({ winner }));

    expect(game.winner).to.equal(winner.toBase58());
  });

  it("rejects buffers that are not Game accounts", async () => {
    const { decodeGameAccount } = await import("../src/arena-registry");
    const data = buildGameBuffer();
    data[0] = 0;

    expect(() => decodeGameAccount(data)).to.throw(
      "Account is not a Trade Arena Game account"
    );
  });
});
