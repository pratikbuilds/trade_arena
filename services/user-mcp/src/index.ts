import http from "http";
import type { IncomingMessage, ServerResponse } from "http";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { config } from "./config";
import { logger } from "./logger";
import { listArenas, getArenaByPubkey, isArenaFull } from "./arena-registry";
import { getGameStatusByPubkey } from "./game-status";
import { getUserTrades } from "./trade-history";
import {
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
      const result = await listArenas(status);
      return textContent(JSON.stringify(result));
    }
  );

  server.tool(
    "get_arena_details",
    "Get metadata and rules for a specific game account.",
    { game_pubkey: z.string().min(32) },
    async ({ game_pubkey }) => {
      const arena = await getArenaByPubkey(game_pubkey);
      if (!arena) {
        return errorContent(
          JSON.stringify({ error: `Game '${game_pubkey}' not found` })
        );
      }
      return textContent(JSON.stringify(arena));
    }
  );

  server.tool(
    "get_game_status",
    "Fetch on-chain status for a specific game account pubkey.",
    { game_pubkey: z.string().min(32) },
    async ({ game_pubkey }) => {
      const result = await getGameStatusByPubkey(game_pubkey);
      if (!result) {
        return errorContent(
          JSON.stringify({ error: `Game '${game_pubkey}' not found` })
        );
      }
      return textContent(JSON.stringify(result));
    }
  );

  server.tool(
    "get_user_trades",
    "List trade_position transactions made by a user in a game.",
    {
      game_pubkey: z.string().min(32),
      player: z.string().min(32),
      limit: z.number().int().positive().max(100).optional(),
    },
    async ({ game_pubkey, player: playerStr, limit }) => {
      let player: PublicKey;
      try {
        player = new PublicKey(playerStr);
      } catch {
        return errorContent(JSON.stringify({ error: "Invalid player pubkey" }));
      }

      const result = await getUserTrades({
        gamePubkey: game_pubkey,
        player,
        limit,
      });
      if (!result) {
        return errorContent(
          JSON.stringify({ error: `Game '${game_pubkey}' not found` })
        );
      }

      return textContent(JSON.stringify(result));
    }
  );

  server.tool(
    "prepare_join_arena",
    "Build an unsigned join transaction. Sign locally with both `player` and `session_signer` keys.",
    {
      game_pubkey: z.string().min(32),
      player: z.string().min(32),
      session_signer: z.string().min(32),
    },
    async ({
      game_pubkey,
      player: playerStr,
      session_signer: sessionSignerStr,
    }) => {
      const arena = await getArenaByPubkey(game_pubkey);
      if (!arena) {
        return errorContent(
          JSON.stringify({ error: `Game '${game_pubkey}' not found` })
        );
      }

      if (arena.status !== "joinable") {
        return errorContent(
          JSON.stringify({
            error: `Game '${game_pubkey}' is not joinable (status: ${arena.status})`,
          })
        );
      }

      if (isArenaFull(arena)) {
        return errorContent(
          JSON.stringify({
            error: `Game '${game_pubkey}' is full (${arena.player_count}/${arena.max_players} players)`,
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
        gamePubkey: game_pubkey,
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
      game_pubkey: z.string().min(32),
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
      game_pubkey,
      player: playerStr,
      signer: signerStr,
      action,
      side,
      notional_usdc,
      price_feed: priceFeedStr,
    }) => {
      const arena = await getArenaByPubkey(game_pubkey);
      if (!arena) {
        return errorContent(
          JSON.stringify({ error: `Game '${game_pubkey}' not found` })
        );
      }

      if (arena.status !== "active") {
        return errorContent(
          JSON.stringify({
            error: `Game '${game_pubkey}' is not active (status: ${arena.status})`,
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
        gamePubkey: game_pubkey,
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
