import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

// No I/O/0/1: giveaway passwords get read off a screen, written on a card or
// typed from a photo, and those are the characters people get wrong.
const READABLE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GENERATED_LENGTH = 8;

/**
 * A password for a giveaway link, generated because the sender is creating
 * dozens at once and shouldn't have to invent one per link.
 *
 * randomInt rather than `randomBytes % n`, which is biased toward the start
 * of the alphabet whenever the range doesn't divide 256 evenly — it does not
 * here (32 divides 256, so bias would be nil in this specific case, but the
 * next person to change the alphabet shouldn't have to notice that).
 *
 * 32^8 ≈ 1.1e12 combinations, against a lockout of 5 attempts per 15 minutes
 * per link, so guessing is not a realistic path even across many links.
 */
export function generateReadablePassword(): string {
  let out = "";
  for (let i = 0; i < GENERATED_LENGTH; i++) {
    out += READABLE_ALPHABET[randomInt(READABLE_ALPHABET.length)];
  }
  return out;
}

// Node's built-in scrypt is memory-hard and sufficient for password hashing
// without pulling in a third-party dependency (bcrypt/argon2) for something
// node:crypto already does well.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;
  const keyBuffer = Buffer.from(key, "hex");
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  if (derivedKey.length !== keyBuffer.length) return false;
  return timingSafeEqual(derivedKey, keyBuffer);
}
