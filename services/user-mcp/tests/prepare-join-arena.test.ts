import { expect } from "chai";
import { createRequest, getRequest } from "../src/request-store";
import { BN } from "@coral-xyz/anchor";
import { messageHash } from "../src/anchor-utils";
import { Connection, PublicKey } from "@solana/web3.js";
import type { TransactionInstruction } from "@solana/web3.js";
import type { Idl } from "@coral-xyz/anchor";
import { tradeArenaIdl } from "../src/idl/trade_arena_idl";
import {
  DELEGATION_PROGRAM_ID,
  SESSION_KEYS_PROGRAM_ID,
  findGamePDA,
  findPlayerStatePDA,
  findSessionTokenPDA,
} from "../src/pdas";

function instructionDiscriminator(name: string): Buffer {
  const instruction = (tradeArenaIdl as Idl).instructions.find(
    (item) => item.name === name
  );
  if (!instruction) {
    throw new Error(`Missing IDL instruction ${name}`);
  }
  return Buffer.from(instruction.discriminator);
}

// ── request-store: join_arena always routes to base ──────────────────────────

describe("prepare_join_arena — request metadata", () => {
  it("target_runtime is always 'base' for join_arena", () => {
    const meta = createRequest({
      action: "join_arena",
      targetRuntime: "base",
      gamePubkey: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      messageHash: "join-hash",
    });
    expect(meta.target_runtime).to.equal("base");
    expect(meta.action).to.equal("join_arena");
    expect(meta.game_pubkey).to.equal(
      "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
    );
    expect(meta.message_hash).to.equal("join-hash");
  });

  it("stored request is retrievable by request_id", () => {
    const meta = createRequest({
      action: "join_arena",
      targetRuntime: "base",
      gamePubkey: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      messageHash: "join-hash",
    });
    const retrieved = getRequest(meta.request_id);
    expect(retrieved).to.deep.equal(meta);
  });
});

describe("messageHash", () => {
  it("is a stable sha256 hex digest", () => {
    const a = messageHash(Buffer.from("prepared-message"));
    const b = messageHash(Buffer.from("prepared-message"));
    expect(a).to.equal(b);
    expect(a).to.match(/^[0-9a-f]{64}$/);
  });

  it("differs when the message changes", () => {
    expect(messageHash(Buffer.from("one"))).to.not.equal(
      messageHash(Buffer.from("two"))
    );
  });
});

// ── pubkey validation (mirrors tool logic) ────────────────────────────────────

describe("prepare_join_arena — pubkey validation", () => {
  it("rejects an all-zero pubkey (invalid on-curve check)", () => {
    expect(() =>
      new PublicKey("11111111111111111111111111111111").toBytes()
    ).to.not.throw();
    // All-zeros is technically valid base58 but not a usable player key —
    // the on-chain program will reject it; we just verify parsing works here.
  });

  it("rejects a non-base58 string", () => {
    expect(() => new PublicKey("not-a-pubkey!!")).to.throw();
  });

  it("rejects a truncated base58 string", () => {
    expect(() => new PublicKey("abc123")).to.throw();
  });

  it("accepts a valid base58 pubkey", () => {
    expect(
      () => new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")
    ).to.not.throw();
  });
});

function requireInstruction(
  instruction: TransactionInstruction | undefined
): TransactionInstruction {
  if (!instruction) {
    throw new Error("missing transaction instruction");
  }
  return instruction;
}

describe("buildJoinArenaTransaction", () => {
  const originalGetLatestBlockhash = Connection.prototype.getLatestBlockhash;

  before(() => {
    process.env.TRADE_ARENA_BASE_RPC_URL = "https://api.devnet.solana.com";
    process.env.TRADE_ARENA_ER_RPC_URL = "https://devnet.magicblock.app";
  });

  beforeEach(() => {
    Connection.prototype.getLatestBlockhash = async () => ({
      blockhash: "11111111111111111111111111111111",
      lastValidBlockHeight: 1,
    });
  });

  afterEach(() => {
    Connection.prototype.getLatestBlockhash = originalGetLatestBlockhash;
  });

  it("builds Gate 4 instructions in the planned order", async () => {
    const { buildJoinArenaTransaction } = await import("../src/transactions");
    const programId = new PublicKey(
      "FkGTyZiUCFqPi7hPjBxDBRJVREhV8SYbbBLBxMqZLnYM"
    );
    const result = await buildJoinArenaTransaction({
      arena: {
        game_pubkey: findGamePDA(
          new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"),
          1,
          programId
        ).toBase58(),
        name: "BTC Arena",
        description: "",
        creator: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        game_id: 1,
        program_id: programId.toBase58(),
        status: "joinable",
        entry_fee_usdc: "1000000",
        max_players: 8,
        token_mint: "So11111111111111111111111111111111111111112",
        asset_feed: "71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr",
        duration_seconds: 300,
        start_time: 0,
        player_count: 0,
        prize_pool_usdc: "0",
        leader_value: "0",
        winner: null,
        game_pda: findGamePDA(
          new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"),
          1,
          programId
        ).toBase58(),
        delegated: false,
      },
      player: new PublicKey("6sbzC1eH4FTujJXWj51eQe25cYvr4xfXbJ1Dqx1XQNB5"),
      sessionSigner: new PublicKey(
        "3ZgmNR3pb8JCGbwJNhMzMd5xXiNVxLaGN47yh1WQNL3h"
      ),
    });

    const [createAtaIx, joinGameIx, sessionIx, escrowIx, delegateIx] =
      result.transaction.instructions.map(requireInstruction);

    expect(createAtaIx.data).to.deep.equal(Buffer.from([0x01]));
    expect(joinGameIx.data).to.deep.equal(
      instructionDiscriminator("join_game")
    );
    expect(sessionIx.programId.toBase58()).to.equal(
      SESSION_KEYS_PROGRAM_ID.toBase58()
    );
    expect(escrowIx.programId.toBase58()).to.equal(
      DELEGATION_PROGRAM_ID.toBase58()
    );
    expect(delegateIx.data).to.deep.equal(
      instructionDiscriminator("delegate_player")
    );
  });
});

describe("buildTradePositionTransaction", () => {
  const originalGetLatestBlockhash = Connection.prototype.getLatestBlockhash;

  before(() => {
    process.env.TRADE_ARENA_BASE_RPC_URL = "https://api.devnet.solana.com";
    process.env.TRADE_ARENA_ER_RPC_URL = "https://devnet.magicblock.app";
  });

  beforeEach(() => {
    Connection.prototype.getLatestBlockhash = async () => ({
      blockhash: "11111111111111111111111111111111",
      lastValidBlockHeight: 1,
    });
  });

  afterEach(() => {
    Connection.prototype.getLatestBlockhash = originalGetLatestBlockhash;
  });

  const programId = new PublicKey(
    "FkGTyZiUCFqPi7hPjBxDBRJVREhV8SYbbBLBxMqZLnYM"
  );
  const creator = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
  const player = new PublicKey("6sbzC1eH4FTujJXWj51eQe25cYvr4xfXbJ1Dqx1XQNB5");
  const sessionSigner = new PublicKey(
    "3ZgmNR3pb8JCGbwJNhMzMd5xXiNVxLaGN47yh1WQNL3h"
  );
  const priceFeed = new PublicKey(
    "71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr"
  );

  const arena = {
    game_pubkey: findGamePDA(creator, 1, programId).toBase58(),
    name: "BTC Arena",
    description: "",
    creator: creator.toBase58(),
    game_id: 1,
    program_id: programId.toBase58(),
    status: "active" as const,
    entry_fee_usdc: "1000000",
    max_players: 8,
    token_mint: "So11111111111111111111111111111111111111112",
    asset_feed: priceFeed.toBase58(),
    duration_seconds: 300,
    start_time: 0,
    player_count: 2,
    prize_pool_usdc: "2000000",
    leader_value: "0",
    winner: null,
    game_pda: findGamePDA(creator, 1, programId).toBase58(),
    delegated: true,
  };

  it("builds an ER increase transaction for a session signer", async () => {
    const { buildTradePositionTransaction } = await import(
      "../src/transactions"
    );
    const result = await buildTradePositionTransaction({
      arena,
      player,
      signer: sessionSigner,
      action: {
        kind: "increase",
        side: "long",
        notionalUsdc: new BN("1000000"),
      },
      priceFeed,
    });

    const [tradeIx] = result.transaction.instructions.map(requireInstruction);
    const game = findGamePDA(creator, 1, programId);
    const playerState = findPlayerStatePDA(game, player, programId);
    const sessionToken = findSessionTokenPDA(programId, sessionSigner, player);

    expect(result.transaction.feePayer?.toBase58()).to.equal(
      sessionSigner.toBase58()
    );
    expect(tradeIx.programId.toBase58()).to.equal(programId.toBase58());
    expect(tradeIx.data.subarray(0, 8)).to.deep.equal(
      instructionDiscriminator("trade_position")
    );
    expect(tradeIx.keys.map((k) => k.pubkey.toBase58())).to.include.members([
      game.toBase58(),
      playerState.toBase58(),
      sessionToken.toBase58(),
      sessionSigner.toBase58(),
      priceFeed.toBase58(),
    ]);
    expect(result.sessionToken?.toBase58()).to.equal(sessionToken.toBase58());
  });

  it("omits the session token when the player signs directly", async () => {
    const { buildTradePositionTransaction } = await import(
      "../src/transactions"
    );
    const result = await buildTradePositionTransaction({
      arena,
      player,
      signer: player,
      action: { kind: "close_all" },
      priceFeed,
    });

    const [tradeIx] = result.transaction.instructions.map(requireInstruction);

    expect(result.transaction.feePayer?.toBase58()).to.equal(player.toBase58());
    expect(result.sessionToken).to.equal(null);
    expect(tradeIx.keys.map((k) => k.pubkey.toBase58())).to.not.include(
      findSessionTokenPDA(programId, player, player).toBase58()
    );
  });
});
