import { createHash, randomBytes } from "node:crypto";

// 256-bit, URL-safe. Only the hash is ever stored — a DB read alone can
// never yield a usable claim token.
export function generateClaimToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
