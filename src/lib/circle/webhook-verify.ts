import { createVerify, createPublicKey, KeyObject } from "node:crypto";

// Public key per keyId is static — cache to avoid refetching on every webhook.
const publicKeyCache = new Map<string, KeyObject>();

async function getPublicKey(keyId: string): Promise<KeyObject> {
  const cached = publicKeyCache.get(keyId);
  if (cached) return cached;

  const response = await fetch(
    `https://api.circle.com/v2/notifications/publicKey/${keyId}`,
    { headers: { Authorization: `Bearer ${process.env.CIRCLE_API_KEY}` } },
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch webhook public key: ${response.status}`);
  }
  const { data } = await response.json();

  const publicKey = createPublicKey({
    key: Buffer.from(data.publicKey, "base64"),
    format: "der",
    type: "spki",
  });
  publicKeyCache.set(keyId, publicKey);
  return publicKey;
}

/**
 * Verifies a Circle v2 webhook (ECDSA_SHA_256 over the raw body). Must be
 * called with the raw request body string — parsing and re-serializing JSON
 * changes byte order and breaks the signature.
 */
export async function verifyCircleWebhook(
  rawBody: string,
  signature: string,
  keyId: string,
): Promise<boolean> {
  const publicKey = await getPublicKey(keyId);
  const verifier = createVerify("SHA256");
  verifier.update(rawBody);
  return verifier.verify(publicKey, signature, "base64");
}
