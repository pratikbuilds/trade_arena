import { expect } from "chai";
import tradeArenaIdl from "../src/idl/trade_arena.json";

function tradeInstructionData(actionData: number[]): Buffer {
  const instruction = tradeArenaIdl.instructions.find(
    (item) => item.name === "trade_position"
  );
  if (!instruction) throw new Error("missing trade_position IDL instruction");
  return Buffer.concat([
    Buffer.from(instruction.discriminator),
    Buffer.from(actionData),
  ]);
}

function u64Le(value: bigint): Buffer {
  const data = Buffer.alloc(8);
  data.writeBigUInt64LE(value);
  return data;
}

describe("decodeTradePositionAction", () => {
  before(() => {
    process.env.TRADE_ARENA_BASE_RPC_URL = "https://api.devnet.solana.com";
    process.env.TRADE_ARENA_ER_RPC_URL = "https://devnet.magicblock.app";
  });

  it("decodes increase actions", async () => {
    const { decodeTradePositionAction } = await import("../src/trade-history");
    const decoded = decodeTradePositionAction(
      tradeInstructionData([0, 1, ...u64Le(1_000_000n)])
    );

    expect(decoded).to.deep.equal({
      kind: "increase",
      side: "short",
      notional_usdc: "1000000",
    });
  });

  it("decodes reduce actions", async () => {
    const { decodeTradePositionAction } = await import("../src/trade-history");
    const decoded = decodeTradePositionAction(
      tradeInstructionData([1, ...u64Le(500_000n)])
    );

    expect(decoded).to.deep.equal({
      kind: "reduce",
      notional_usdc: "500000",
    });
  });

  it("decodes close_all actions", async () => {
    const { decodeTradePositionAction } = await import("../src/trade-history");
    const decoded = decodeTradePositionAction(tradeInstructionData([2]));

    expect(decoded).to.deep.equal({ kind: "close_all" });
  });

  it("ignores non-trade-position instruction data", async () => {
    const { decodeTradePositionAction } = await import("../src/trade-history");
    expect(decodeTradePositionAction(Buffer.alloc(8))).to.equal(null);
  });
});
