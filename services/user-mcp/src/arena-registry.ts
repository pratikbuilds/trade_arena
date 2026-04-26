import { z } from "zod";
import { config } from "./config";

export const ArenaSchema = z.object({
  arena_id: z.string().min(1),
  name: z.string(),
  description: z.string().default(""),
  creator: z.string().min(32),
  game_id: z.number().int().nonnegative(),
  program_id: z.string().min(32),
  status: z.enum(["joinable", "active", "ended"]),
  entry_fee_usdc: z
    .string()
    .regex(/^\d+$/, "entry_fee_usdc must be a non-negative integer string"),
  max_players: z.number().int().positive(),
  token_mint: z.string().min(32),
});

export type Arena = z.infer<typeof ArenaSchema>;

export function parseArenasJSON(arenasJSON: string): Arena[] {
  let raw: unknown;
  try {
    raw = JSON.parse(arenasJSON);
  } catch (err) {
    throw new Error("TRADE_ARENA_ARENAS_JSON is not valid JSON", {
      cause: err,
    });
  }
  const result = z.array(ArenaSchema).safeParse(raw);
  if (!result.success) {
    throw new Error(
      `TRADE_ARENA_ARENAS_JSON validation failed: ${result.error.message}`
    );
  }
  return result.data;
}

export const arenas: Arena[] = parseArenasJSON(config.TRADE_ARENA_ARENAS_JSON);

export function listArenas(
  status?: "joinable" | "active" | "ended" | "all"
): Arena[] {
  if (!status || status === "all") return arenas;
  return arenas.filter((a) => a.status === status);
}

export function getArenaById(arenaId: string): Arena | undefined {
  return arenas.find((a) => a.arena_id === arenaId);
}
