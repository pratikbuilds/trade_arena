import { expect } from "chai";

describe("parseArenasJSON", () => {
  before(() => {
    process.env.TRADE_ARENA_BASE_RPC_URL = "https://api.devnet.solana.com";
    process.env.TRADE_ARENA_ER_RPC_URL = "https://devnet.magicblock.app";
    process.env.TRADE_ARENA_ARENAS_JSON = "[]";
  });

  it("validates arena JSON", async () => {
    const { parseArenasJSON } = await import("../src/arena-registry");
    const arenas = parseArenasJSON(
      JSON.stringify([
        {
          arena_id: "btc-1",
          name: "BTC Arena",
          creator: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
          game_id: 1,
          program_id: "FkGTyZiUCFqPi7hPjBxDBRJVREhV8SYbbBLBxMqZLnYM",
          status: "joinable",
          entry_fee_usdc: "1000000",
          max_players: 8,
          token_mint: "So11111111111111111111111111111111111111112",
        },
      ])
    );

    expect(arenas).to.have.lengthOf(1);
    expect(arenas[0]?.description).to.equal("");
  });

  it("rejects malformed arena JSON", async () => {
    const { parseArenasJSON } = await import("../src/arena-registry");
    expect(() => parseArenasJSON("{")).to.throw(
      "TRADE_ARENA_ARENAS_JSON is not valid JSON"
    );
  });

  it("rejects invalid arena status", async () => {
    const { parseArenasJSON } = await import("../src/arena-registry");
    expect(() =>
      parseArenasJSON(
        JSON.stringify([
          {
            arena_id: "btc-1",
            name: "BTC Arena",
            creator: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            game_id: 1,
            program_id: "FkGTyZiUCFqPi7hPjBxDBRJVREhV8SYbbBLBxMqZLnYM",
            status: "paused",
            entry_fee_usdc: "1000000",
            max_players: 8,
            token_mint: "So11111111111111111111111111111111111111112",
          },
        ])
      )
    ).to.throw("TRADE_ARENA_ARENAS_JSON validation failed");
  });
});
