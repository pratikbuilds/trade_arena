import { createHash } from "crypto";

export function messageHash(message: Uint8Array): string {
  return createHash("sha256").update(message).digest("hex");
}
