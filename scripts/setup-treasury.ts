/**
 * One-time setup for the treasury: a Circle Wallet Set holding a small pool
 * of Developer-Controlled EOA wallets on Arc Testnet, which is what actually
 * escrows deposited USDC between a PaymentLink being created and claimed
 * (see the architecture notes on the pooled-treasury decision).
 *
 * Requires CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET to already be set (run
 * register-entity-secret.ts first). Run this yourself, not as part of app
 * runtime — it's an infrequent ops action, not a request-time operation.
 *
 * Usage:
 *   npx tsx scripts/setup-treasury.ts [wallet count, default 3]
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Blockchain } from "@circle-fin/developer-controlled-wallets";
import { circleDeveloperClient } from "../src/lib/circle/developer-wallets";
import { db } from "../src/lib/db";

async function main() {
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
    throw new Error(
      "CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set — run register-entity-secret.ts first.",
    );
  }

  const count = Number(process.argv[2] ?? 3);

  const walletSet = await circleDeveloperClient.createWalletSet({
    name: "claimIT Treasury",
    idempotencyKey: randomUUID(),
  });
  const walletSetId = walletSet.data!.walletSet.id;
  console.log("Created wallet set:", walletSetId);

  const wallets = await circleDeveloperClient.createWallets({
    accountType: "EOA",
    blockchains: [Blockchain.ArcTestnet],
    count,
    walletSetId,
    idempotencyKey: randomUUID(),
  });

  for (const wallet of wallets.data?.wallets ?? []) {
    await db.wallet.create({
      data: {
        custodyType: "DEVELOPER_CONTROLLED",
        role: "TREASURY",
        circleWalletId: wallet.id,
        address: wallet.address,
        blockchain: wallet.blockchain,
        accountType: "EOA",
        walletSetId,
      },
    });
    console.log(`  wallet ${wallet.id}: ${wallet.address}`);
  }

  console.log(
    `\nCreated ${count} treasury wallet(s). Fund them from https://faucet.circle.com before accepting deposits.`,
  );
  console.log(`Set CIRCLE_TREASURY_WALLET_SET_ID=${walletSetId} in your .env.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
