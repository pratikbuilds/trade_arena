import { randomUUID } from "crypto";

export type RequestAction = "join_arena" | "place_trade" | "close_position";
export type TargetRuntime = "base" | "er";

export type RequestMetadata = {
  request_id: string;
  action: RequestAction;
  target_runtime: TargetRuntime;
  message_hash: string;
  game_pubkey: string;
};

export type CreateRequestArgs = {
  action: RequestAction;
  targetRuntime: TargetRuntime;
  gamePubkey: string;
  messageHash: string;
};

const store = new Map<string, RequestMetadata>();

export function createRequest(args: CreateRequestArgs): RequestMetadata {
  const request_id = randomUUID();
  const meta: RequestMetadata = {
    request_id,
    action: args.action,
    target_runtime: args.targetRuntime,
    message_hash: args.messageHash,
    game_pubkey: args.gamePubkey,
  };
  store.set(request_id, meta);
  return meta;
}

export function getRequest(request_id: string): RequestMetadata | undefined {
  return store.get(request_id);
}
