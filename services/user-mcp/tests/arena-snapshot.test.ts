import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import { createRequire } from "node:module";
import type { DecodedPlayerState } from "../src/player-state";
import type { UserTrade } from "../src/trade-history";

const requireModule = createRequire(import.meta.url);

const GAME = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
const PLAYER = new PublicKey("6sbzC1eH4FTujJXWj51eQe25cYvr4xfXbJ1Dqx1XQNB5");
const PLAYER_STATE = new PublicKey(
  "3ZgmNR3pb8JCGbwJNhMzMd5xXiNVxLaGN47yh1WQNL3h"
);

const playerState: DecodedPlayerState = {
  player: PLAYER,
  game: GAME,
  virtualUsdc: 10_000_000_000n,
  positionSize: 0n,
  side: "long",
  entryPrice: 100_000_000n,
  realizedPnl: 0n,
};

function trade(args: {
  signature: string;
  blockTime: number;
  action: UserTrade["action"];
  logs: string[];
}): UserTrade {
  return {
    signature: args.signature,
    slot: args.blockTime,
    block_time: args.blockTime,
    game_pubkey: GAME.toBase58(),
    player: PLAYER.toBase58(),
    player_state: PLAYER_STATE.toBase58(),
    signer: PLAYER.toBase58(),
    price_feed: null,
    action: args.action,
    logs: args.logs,
    err: null,
  };
}

describe("buildTrades", () => {
  before(() => {
    process.env.TRADE_ARENA_BASE_RPC_URL = "https://api.devnet.solana.com";
    process.env.TRADE_ARENA_ER_RPC_URL = "https://devnet.magicblock.app";
  });

  it("keeps scale-ins in one open cycle and records partial reduces", async () => {
    const { buildTrades } = requireModule("../src/arena-snapshot");
    const rows = buildTrades(
      "agent",
      [
        trade({
          signature: "close",
          blockTime: 130,
          action: { kind: "close_all" },
          logs: ["Program log: Closed Long quantity=200000 pnl=2000000"],
        }),
        trade({
          signature: "reduce",
          blockTime: 120,
          action: { kind: "reduce", notional_usdc: "100000000" },
          logs: [
            "Program log: Reduced Long notional=100000000 quantity=100000 remaining=200000 pnl=1000000",
          ],
        }),
        trade({
          signature: "scale",
          blockTime: 110,
          action: {
            kind: "increase",
            side: "long",
            notional_usdc: "200000000",
          },
          logs: [
            "Program log: Increased Long notional=200000000 quantity=200000 new_size=300000 avg_entry=110000000 cost=200000000",
          ],
        }),
        trade({
          signature: "open",
          blockTime: 100,
          action: {
            kind: "increase",
            side: "long",
            notional_usdc: "100000000",
          },
          logs: [
            "Program log: Opened Long notional=100000000 quantity=100000 entry=100000000 cost=100000000",
          ],
        }),
      ],
      playerState,
      200_000,
      111
    );

    expect(rows).to.have.length(2);
    expect(rows[0]).to.include({
      id: "agent-1",
      status: "closed",
      sizeBtc: 0.2,
      entryPrice: 110,
      closeTx: "close",
      pnlUsd: 2,
    });
    expect(rows[1]).to.include({
      id: "agent-1-reduce-1",
      status: "closed",
      sizeBtc: 0.1,
      notionalUsd: 100,
      closeTx: "reduce",
      pnlUsd: 1,
    });
  });

  it("treats a reduce to zero as the cycle close", async () => {
    const { buildTrades } = requireModule("../src/arena-snapshot");
    const rows = buildTrades(
      "agent",
      [
        trade({
          signature: "reduce-all",
          blockTime: 120,
          action: { kind: "reduce", notional_usdc: "100000000" },
          logs: [
            "Program log: Reduced Long notional=100000000 quantity=100000 remaining=0 pnl=-500000",
          ],
        }),
        trade({
          signature: "open",
          blockTime: 100,
          action: {
            kind: "increase",
            side: "long",
            notional_usdc: "100000000",
          },
          logs: [
            "Program log: Opened Long notional=100000000 quantity=100000 entry=100000000 cost=100000000",
          ],
        }),
      ],
      playerState,
      200_000,
      null
    );

    expect(rows).to.have.length(1);
    expect(rows[0]).to.include({
      id: "agent-1",
      status: "closed",
      closeTx: "reduce-all",
      pnlUsd: -0.5,
    });
  });
});
