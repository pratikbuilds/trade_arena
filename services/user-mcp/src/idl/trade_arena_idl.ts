import type { Idl } from "@coral-xyz/anchor";
import { createRequire } from "node:module";

const requireJson = createRequire(__filename);

export const tradeArenaIdl = requireJson("./trade_arena.json") as Idl;
export type TradeArena = Idl;
