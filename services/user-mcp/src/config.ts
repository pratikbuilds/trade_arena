import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  TRADE_ARENA_BASE_RPC_URL: z.string().url(),
  TRADE_ARENA_ER_RPC_URL: z.string().url(),
  TRADE_ARENA_PROGRAM_ID: z
    .string()
    .min(32)
    .default("HxqxwrurkZDcyVQVTaiz7DSaKXdPgypMzGiRj7kPjBdB"),
});

export type Config = z.infer<typeof EnvSchema>;

export function createConfig(env: NodeJS.ProcessEnv): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration: ${result.error.message}`
    );
  }
  return result.data;
}

export const config = createConfig(process.env);
