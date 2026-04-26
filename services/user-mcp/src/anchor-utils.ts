import { createHash } from "crypto";

/** First 8 bytes of SHA-256("global:<name>") - standard Anchor discriminator. */
export function anchorDiscriminator(name: string): Buffer {
  return Buffer.from(
    createHash("sha256").update(`global:${name}`).digest().subarray(0, 8)
  );
}

export function messageHash(message: Uint8Array): string {
  return createHash("sha256").update(message).digest("hex");
}
