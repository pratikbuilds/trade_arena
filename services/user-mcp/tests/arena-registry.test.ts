import { expect } from "chai";
import { Connection, PublicKey, type AccountInfo } from "@solana/web3.js";
import { DELEGATION_PROGRAM_ID, findGamePDA } from "../src/pdas";

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
  creator?: PublicKey;
  gameId?: bigint;
  playerCount?: number;
  maxPlayers?: number;
  status?: number;
  winner?: PublicKey;
}): Buffer {
  const data = Buffer.alloc(196);
  GAME_DISCRIMINATOR.copy(data, 0);
  const creator =
    args?.creator ??
    new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");

  let offset = 8;
  offset = writePubkey(data, offset, creator);
  offset = writeU64(data, offset, args?.gameId ?? 7n);
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
  data.writeUInt32LE(args?.playerCount ?? 2, offset);
  offset += 4;
  data.writeUInt32LE(args?.maxPlayers ?? 8, offset);
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

function accountInfo(data: Buffer, owner: PublicKey): AccountInfo<Buffer> {
  return {
    data,
    owner,
    executable: false,
    lamports: 1,
    rentEpoch: 1,
  };
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

  it("does not treat full on-chain joinable games as MCP-joinable", async () => {
    const { decodeGameAccount, isArenaJoinable } = await import(
      "../src/arena-registry"
    );
    const game = decodeGameAccount(
      buildGameBuffer({ playerCount: 8, maxPlayers: 8 })
    );

    expect(game.status).to.equal("joinable");
    expect(game.player_count).to.equal(8);
    expect(game.max_players).to.equal(8);
    expect(isArenaJoinable(game)).to.equal(false);
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

describe("listArenas", () => {
  const originalGetProgramAccounts = Connection.prototype.getProgramAccounts;
  const programId = new PublicKey(
    "HxqxwrurkZDcyVQVTaiz7DSaKXdPgypMzGiRj7kPjBdB"
  );
  const creator = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");

  before(() => {
    process.env.TRADE_ARENA_BASE_RPC_URL = "https://api.devnet.solana.com";
    process.env.TRADE_ARENA_ER_RPC_URL = "https://devnet.magicblock.app";
    process.env.TRADE_ARENA_PROGRAM_ID = programId.toBase58();
  });

  afterEach(() => {
    Connection.prototype.getProgramAccounts = originalGetProgramAccounts;
  });

  it("excludes full games from joinable results", async () => {
    const openGameId = 8n;
    const fullGameId = 7n;
    const openPda = findGamePDA(creator, Number(openGameId), programId);
    const fullPda = findGamePDA(creator, Number(fullGameId), programId);
    Connection.prototype.getProgramAccounts = async function (owner) {
      if (owner.equals(DELEGATION_PROGRAM_ID)) return [];
      if (!owner.equals(programId)) return [];
      return [
        {
          pubkey: fullPda,
          account: accountInfo(
            buildGameBuffer({
              creator,
              gameId: fullGameId,
              playerCount: 8,
              maxPlayers: 8,
            }),
            programId
          ),
        },
        {
          pubkey: openPda,
          account: accountInfo(
            buildGameBuffer({
              creator,
              gameId: openGameId,
              playerCount: 7,
              maxPlayers: 8,
            }),
            programId
          ),
        },
      ];
    };

    const { listArenas } = await import("../src/arena-registry");
    const arenas = await listArenas("joinable");

    expect(arenas.map((arena) => arena.game_id)).to.deep.equal([
      Number(openGameId),
    ]);
  });
});
