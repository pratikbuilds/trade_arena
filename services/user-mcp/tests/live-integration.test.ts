import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { DELEGATION_PROGRAM_ID, findGamePDA } from "../src/pdas";

import { BN } from "@coral-xyz/anchor";
import { expect } from "chai";

const DEFAULT_BASE_RPC_URL = "https://api.devnet.solana.com";
const DEFAULT_ER_RPC_URL = "https://devnet.magicblock.app";
const DEFAULT_PROGRAM_ID = "HxqxwrurkZDcyVQVTaiz7DSaKXdPgypMzGiRj7kPjBdB";
const PLAYER_STATE_DISCRIMINATOR = Buffer.from([
  56, 3, 60, 86, 174, 16, 244, 195,
]);
const PLAYER_STATE_ACCOUNT_LENGTH = 106;

function configureLiveEnv(): {
  baseRpcUrl: string;
  erRpcUrl: string;
  programId: PublicKey;
} {
  process.env.TRADE_ARENA_BASE_RPC_URL ??= DEFAULT_BASE_RPC_URL;
  process.env.TRADE_ARENA_ER_RPC_URL ??= DEFAULT_ER_RPC_URL;
  process.env.TRADE_ARENA_PROGRAM_ID ??= DEFAULT_PROGRAM_ID;

  return {
    baseRpcUrl: process.env.TRADE_ARENA_BASE_RPC_URL,
    erRpcUrl: process.env.TRADE_ARENA_ER_RPC_URL,
    programId: new PublicKey(process.env.TRADE_ARENA_PROGRAM_ID),
  };
}

function decodePlayerStateIdentity(data: Buffer): {
  player: PublicKey;
  game: PublicKey;
} | null {
  if (
    data.length < PLAYER_STATE_ACCOUNT_LENGTH ||
    !data.subarray(0, 8).equals(PLAYER_STATE_DISCRIMINATOR)
  ) {
    return null;
  }

  return {
    player: new PublicKey(data.subarray(8, 40)),
    game: new PublicKey(data.subarray(40, 72)),
  };
}

describe("MCP live integration", function () {
  this.timeout(120_000);

  before(function () {
    if (process.env.TRADE_ARENA_RUN_LIVE_TESTS !== "1") {
      this.skip();
    }
    configureLiveEnv();
  });

  it("discovers real on-chain Game accounts and prepares real RPC-backed transactions", async () => {
    const { baseRpcUrl, erRpcUrl, programId } = configureLiveEnv();
    const [baseConnection, erConnection] = [
      new Connection(baseRpcUrl, "confirmed"),
      new Connection(erRpcUrl, "confirmed"),
    ];

    const [baseProgram, erProgram] = await Promise.all([
      baseConnection.getAccountInfo(programId, "confirmed"),
      erConnection.getAccountInfo(programId, "confirmed"),
    ]);

    expect(baseProgram, "base-layer program account").to.not.equal(null);
    expect(erProgram, "ER program account").to.not.equal(null);
    expect(baseProgram?.executable, "base-layer program executable").to.equal(
      true
    );
    expect(erProgram?.executable, "ER program executable").to.equal(true);

    const { getArenaByPubkey, listArenas, decodeGameAccount } = await import(
      "../src/arena-registry"
    );
    const { buildJoinArenaTransaction, buildTradePositionTransaction } =
      await import("../src/transactions");

    const arenas = await listArenas("all");
    expect(arenas.length, "discovered arenas").to.be.greaterThan(0);

    const sampledArenas = arenas.slice(0, 5);
    for (const arena of sampledArenas) {
      expect(arena.game_pubkey).to.equal(arena.game_pda);
      expect(Object.keys(arena)).to.not.include("arena" + "_id");

      const gamePda = new PublicKey(arena.game_pda);
      const expectedPda = findGamePDA(
        new PublicKey(arena.creator),
        arena.game_id,
        programId
      );
      expect(gamePda.toBase58(), `PDA for game ${arena.game_id}`).to.equal(
        expectedPda.toBase58()
      );
      expect(arena.program_id).to.equal(programId.toBase58());
      expect(["joinable", "active", "ended"]).to.include(arena.status);

      const info = await baseConnection.getAccountInfo(gamePda, "confirmed");
      expect(info, `account ${arena.game_pda}`).to.not.equal(null);
      expect(
        [programId.toBase58(), DELEGATION_PROGRAM_ID.toBase58()],
        `base owner for ${arena.game_pda}`
      ).to.include(info?.owner.toBase58());
      expect(arena.delegated).to.equal(
        info?.owner.equals(DELEGATION_PROGRAM_ID)
      );

      const decoded = decodeGameAccount(info!.data);
      expect(decoded.game_id).to.equal(arena.game_id);
      expect(decoded.creator).to.equal(arena.creator);
      expect(decoded.status).to.equal(arena.status);

      const fetched = await getArenaByPubkey(arena.game_pubkey);
      console.log("fetched", fetched);
      expect(fetched?.game_pda).to.equal(arena.game_pda);
      expect(fetched?.game_id).to.equal(arena.game_id);
    }

    const player = Keypair.generate().publicKey;
    const sessionSigner = Keypair.generate().publicKey;
    const joinableArena = arenas.find((arena) => arena.status === "joinable");
    if (joinableArena) {
      const join = await buildJoinArenaTransaction({
        arena: joinableArena,
        player,
        sessionSigner,
      });
      // console.log("join",join);
      expect(join.transaction.instructions.length).to.equal(5);
      expect(join.transaction.recentBlockhash).to.be.a("string");
      expect(join.transaction.feePayer?.toBase58()).to.equal(player.toBase58());
      expect(join.playerState.toBase58()).to.have.length.greaterThan(30);
      expect(join.sessionToken.toBase58()).to.have.length.greaterThan(30);
    }

    const activeArena = arenas.find((arena) => arena.status === "active");
    if (activeArena) {
      const trade = await buildTradePositionTransaction({
        arena: activeArena,
        player,
        signer: player,
        action: {
          kind: "increase",
          side: "long",
          notionalUsdc: new BN(1_000_000),
        },
        priceFeed: new PublicKey(activeArena.asset_feed),
      });
      // console.log("trade",trade);
      expect(trade.transaction.instructions.length).to.equal(1);
      expect(trade.transaction.recentBlockhash).to.be.a("string");
      expect(trade.transaction.feePayer?.toBase58()).to.equal(
        player.toBase58()
      );
      expect(trade.sessionToken).to.equal(null);
    }

    expect(
      Boolean(joinableArena || activeArena),
      "at least one live arena can exercise a transaction builder"
    ).to.equal(true);
  });

  it("fetches get_game_status by game_pubkey from the base-layer game account", async () => {
    configureLiveEnv();
    const { listArenas } = await import("../src/arena-registry");
    const { getGameStatusByPubkey } = await import("../src/game-status");

    const [arena] = await listArenas("all");
    expect(arena, "live game account").to.not.equal(undefined);

    const status = await getGameStatusByPubkey(arena!.game_pubkey);
    expect(status?.game_pubkey).to.equal(arena!.game_pubkey);
    expect(status?.game_pda).to.equal(arena!.game_pda);
    expect(status?.exists).to.equal(true);

    if (status?.exists) {
      expect(status.status).to.equal(arena!.status);
      expect(status.player_count).to.equal(arena!.player_count);
      expect(status.max_players).to.equal(arena!.max_players);
      expect(status.prize_pool_usdc).to.equal(arena!.prize_pool_usdc);
      expect(status.delegated).to.equal(arena!.delegated);
    }
  });

  it("fetches get_user_trades by game_pubkey and player from ER transaction history", async () => {
    const { baseRpcUrl, erRpcUrl, programId } = configureLiveEnv();
    const baseConnection = new Connection(baseRpcUrl, "confirmed");
    const erConnection = new Connection(erRpcUrl, "confirmed");
    const { getUserTrades } = await import("../src/trade-history");

    const [programOwned, delegated] = await Promise.all([
      baseConnection.getProgramAccounts(programId, {
        filters: [{ dataSize: PLAYER_STATE_ACCOUNT_LENGTH }],
      }),
      baseConnection.getProgramAccounts(DELEGATION_PROGRAM_ID, {
        filters: [{ dataSize: PLAYER_STATE_ACCOUNT_LENGTH }],
      }),
    ]);

    for (const { pubkey, account } of [...programOwned, ...delegated]) {
      const identity = decodePlayerStateIdentity(Buffer.from(account.data));
      if (!identity) continue;

      const signatures = await erConnection.getSignaturesForAddress(pubkey, {
        limit: 5,
      });
      if (signatures.length === 0) continue;

      const result = await getUserTrades({
        gamePubkey: identity.game.toBase58(),
        player: identity.player,
        limit: 5,
      });
      console.log("result", JSON.stringify(result));
      expect(result?.player_state).to.equal(pubkey.toBase58());
      expect(result?.trades.length, "decoded trades").to.be.greaterThan(0);
      const [trade] = result!.trades;
      expect(trade.game_pubkey).to.equal(identity.game.toBase58());
      expect(trade.player).to.equal(identity.player.toBase58());
      expect(trade.player_state).to.equal(pubkey.toBase58());
      expect(trade.signature).to.be.a("string");
      expect(["increase", "reduce", "close_all"]).to.include(trade.action.kind);
      return;
    }

    throw new Error("No live PlayerState with ER trade history found");
  });
});
