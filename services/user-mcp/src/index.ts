import http from "http";
import type { IncomingMessage, ServerResponse } from "http";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { config } from "./config";
import { logger } from "./logger";
import { listArenas, getArenaById } from "./arena-registry";
import { findGamePDA } from "./pdas";
import {
  baseConnection,
  buildJoinArenaTransaction,
  buildTradePositionTransaction,
  type TradeAction,
} from "./transactions";
import { createRequest } from "./request-store";
import { messageHash } from "./anchor-utils";

const MCP_TEXT = "text" as const;

function textContent(text: string) {
  return { content: [{ type: MCP_TEXT, text }] };
}

function errorContent(text: string) {
  return { ...textContent(text), isError: true };
}

function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: "trade-arena-user-mcp",
    version: "0.1.0",
  });

  server.tool("ping", "Check that the MCP server is alive", {}, async () =>
    textContent("pong")
  );

  server.tool(
    "list_arenas",
    "List available Trade Arena games. Optionally filter by status.",
    { status: z.enum(["joinable", "active", "ended", "all"]).optional() },
    async ({ status }) => {
      const result = listArenas(status);
      return textContent(JSON.stringify(result));
    }
  );

  server.tool(
    "get_arena_details",
    "Get metadata and rules for a specific arena.",
    { arena_id: z.string().min(1) },
    async ({ arena_id }) => {
      const arena = getArenaById(arena_id);
      if (!arena) {
        return errorContent(
          JSON.stringify({ error: `Arena '${arena_id}' not found` })
        );
      }
      return textContent(JSON.stringify(arena));
    }
  );

  server.tool(
    "get_game_status",
    "Fetch on-chain status for a specific arena's game account.",
    { arena_id: z.string().min(1) },
    async ({ arena_id }) => {
      const arena = getArenaById(arena_id);
      if (!arena) {
        return errorContent(
          JSON.stringify({ error: `Arena '${arena_id}' not found` })
        );
      }

      let creator: PublicKey;
      let programId: PublicKey;
      try {
        creator = new PublicKey(arena.creator);
        programId = new PublicKey(arena.program_id);
      } catch (err) {
        throw new Error("Arena has invalid creator or program_id pubkey", {
          cause: err,
        });
      }

      const gamePda = findGamePDA(creator, arena.game_id, programId);
      const info = await baseConnection().getAccountInfo(gamePda);

      const result = info
        ? {
            arena_id,
            game_pda: gamePda.toBase58(),
            exists: true,
            lamports: info.lamports,
            data_len: info.data.length,
            owner: info.owner.toBase58(),
          }
        : { arena_id, game_pda: gamePda.toBase58(), exists: false };

      return textContent(JSON.stringify(result));
    }
  );

  server.tool(
    "prepare_join_arena",
    "Build an unsigned join transaction. Sign locally with both `player` and `session_signer` keys.",
    {
      arena_id: z.string().min(1),
      player: z.string().min(32),
      session_signer: z.string().min(32),
    },
    async ({
      arena_id,
      player: playerStr,
      session_signer: sessionSignerStr,
    }) => {
      const arena = getArenaById(arena_id);
      if (!arena) {
        return errorContent(
          JSON.stringify({ error: `Arena '${arena_id}' not found` })
        );
      }

      if (arena.status !== "joinable") {
        return errorContent(
          JSON.stringify({
            error: `Arena '${arena_id}' is not joinable (status: ${arena.status})`,
          })
        );
      }

      let player: PublicKey;
      let sessionSigner: PublicKey;
      try {
        player = new PublicKey(playerStr);
        sessionSigner = new PublicKey(sessionSignerStr);
      } catch (err) {
        return errorContent(
          JSON.stringify({
            error: "Invalid pubkey for player or session_signer",
          })
        );
      }

      const { transaction, playerState, sessionToken } =
        await buildJoinArenaTransaction({ arena, player, sessionSigner });

      const request = createRequest({
        action: "join_arena",
        targetRuntime: "base",
        arenaId: arena_id,
        messageHash: messageHash(transaction.serializeMessage()),
      });

      const transactionBase64 = transaction
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString("base64");

      return textContent(
        JSON.stringify({
          request_id: request.request_id,
          action: "join_arena",
          transaction_base64: transactionBase64,
          player_state: playerState.toBase58(),
          session_token: sessionToken.toBase58(),
        })
      );
    }
  );

  server.tool(
    "prepare_trade_position",
    "Build an unsigned ER trade transaction. Sign locally with `signer` (player or session signer).",
    {
      arena_id: z.string().min(1),
      player: z.string().min(32),
      signer: z.string().min(32),
      action: z.enum(["increase", "reduce", "close_all"]),
      side: z.enum(["long", "short"]).optional(),
      notional_usdc: z
        .string()
        .regex(/^[1-9]\d*$/, "notional_usdc must be a positive integer")
        .optional(),
      price_feed: z.string().min(32).optional(),
    },
    async ({
      arena_id,
      player: playerStr,
      signer: signerStr,
      action,
      side,
      notional_usdc,
      price_feed: priceFeedStr,
    }) => {
      const arena = getArenaById(arena_id);
      if (!arena) {
        return errorContent(
          JSON.stringify({ error: `Arena '${arena_id}' not found` })
        );
      }

      if (arena.status !== "active") {
        return errorContent(
          JSON.stringify({
            error: `Arena '${arena_id}' is not active (status: ${arena.status})`,
          })
        );
      }

      let player: PublicKey;
      let signer: PublicKey;
      let priceFeed: PublicKey | undefined;
      try {
        player = new PublicKey(playerStr);
        signer = new PublicKey(signerStr);
        priceFeed = priceFeedStr ? new PublicKey(priceFeedStr) : undefined;
      } catch (err) {
        return errorContent(
          JSON.stringify({
            error: "Invalid pubkey for player, signer, or price_feed",
          })
        );
      }

      let tradeAction: TradeAction;
      if (action === "increase") {
        if (!side || !notional_usdc) {
          return errorContent(
            JSON.stringify({
              error: "increase requires side and notional_usdc",
            })
          );
        }
        tradeAction = {
          kind: "increase",
          side,
          notionalUsdc: new BN(notional_usdc),
        };
      } else if (action === "reduce") {
        if (!notional_usdc) {
          return errorContent(
            JSON.stringify({ error: "reduce requires notional_usdc" })
          );
        }
        tradeAction = {
          kind: "reduce",
          notionalUsdc: new BN(notional_usdc),
        };
      } else {
        tradeAction = { kind: "close_all" };
      }

      const { transaction, playerState, sessionToken } =
        await buildTradePositionTransaction({
          arena,
          player,
          signer,
          action: tradeAction,
          priceFeed,
        });

      const request = createRequest({
        action: action === "close_all" ? "close_position" : "place_trade",
        targetRuntime: "er",
        arenaId: arena_id,
        messageHash: messageHash(transaction.serializeMessage()),
      });

      const transactionBase64 = transaction
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString("base64");

      return textContent(
        JSON.stringify({
          request_id: request.request_id,
          action: action === "close_all" ? "close_position" : "place_trade",
          target_runtime: "er",
          transaction_base64: transactionBase64,
          player_state: playerState.toBase58(),
          session_token: sessionToken?.toBase58() ?? null,
        })
      );
    }
  );

  return server;
}

const httpServer = http.createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;

      if (req.method === "GET" && path === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (req.method === "POST" && path === "/mcp") {
        const server = buildMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res);
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (err) {
      logger.error("Unhandled request error", { error: String(err) });
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  }
);

httpServer.listen(config.PORT, () => {
  logger.info("Trade Arena MCP server started", { port: config.PORT });
});
