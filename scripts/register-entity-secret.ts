/**
 * One-time setup for Circle Developer-Controlled Wallets (the treasury).
 *
 * Run this yourself, locally, with your own CIRCLE_API_KEY — do not have an
 * agent run this against a real account. Per Circle's own security rules:
 * never register an entity secret on someone else's behalf, and be careful
 * even on testnet about where the secret and recovery file end up.
 *
 * Usage:
 *   1. First run (no CIRCLE_ENTITY_SECRET set) generates a new secret and
 *      prints it. Copy it into your .env as CIRCLE_ENTITY_SECRET, then
 *      re-run this script to register it with Circle.
 *   2. Second run (CIRCLE_ENTITY_SECRET set, CIRCLE_API_KEY set) registers
 *      the ciphertext with Circle and writes a recovery file — store that
 *      file outside the repo and never commit it.
 *
 *   npx tsx scripts/register-entity-secret.ts
 */
import "dotenv/config";
import os from "node:os";
import path from "node:path";
import {
  generateEntitySecret,
  registerEntitySecretCiphertext,
} from "@circle-fin/developer-controlled-wallets";

async function main() {
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  const apiKey = process.env.CIRCLE_API_KEY;

  if (!entitySecret) {
    console.log("No CIRCLE_ENTITY_SECRET set. Generated a new one:\n");
    console.log(generateEntitySecret());
    console.log(
      "\nAdd this to your .env as CIRCLE_ENTITY_SECRET, then re-run this script to register it.",
    );
    return;
  }

  if (!apiKey) {
    throw new Error("CIRCLE_API_KEY is required to register the entity secret.");
  }

  const recoveryFileDownloadPath = path.join(
    os.homedir(),
    ".circle",
    "claimit-recovery-file.json",
  );

  const response = await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath,
  });

  console.log("Entity secret registered.");
  console.log("Recovery file written to:", recoveryFileDownloadPath);
  console.log(
    "Store that file somewhere secure outside this repo — it cannot be re-downloaded.",
  );
  console.log(response.data?.recoveryFile);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
