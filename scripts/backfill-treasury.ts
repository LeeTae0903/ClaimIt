/**
 * Registers an *existing* Circle treasury wallet set into this database.
 *
 * Why this exists separately from setup-treasury.ts: that script CREATES a
 * new wallet set and new wallets. Running it against a fresh database to
 * "restore" the treasury would mint a second set and strand whatever USDC
 * the original wallets already hold. When the database is new but the
 * treasury is not — a migrated/rebuilt environment — the on-chain state is
 * the source of truth and only the rows are missing.
 *
 * Reads the wallet set named by CIRCLE_TREASURY_WALLET_SET_ID, pulls its
 * wallets from Circle, and inserts any that this database doesn't have yet.
 * Idempotent: re-running it adds nothing and changes nothing.
 *
 * Usage:
 *   npx tsx scripts/backfill-treasury.ts
 */
import "dotenv/config";
import { db } from "../src/lib/db";

type CircleWallet = {
  id: string;
  address: string;
  blockchain: string;
  accountType?: string;
  state?: string;
};

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY;
  const walletSetId = process.env.CIRCLE_TREASURY_WALLET_SET_ID;
  if (!apiKey || !walletSetId) {
    throw new Error(
      "CIRCLE_API_KEY and CIRCLE_TREASURY_WALLET_SET_ID must both be set.",
    );
  }

  const res = await fetch(
    `https://api.circle.com/v1/w3s/wallets?walletSetId=${walletSetId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!res.ok) {
    throw new Error(`Circle returned ${res.status} listing the wallet set.`);
  }

  const body = await res.json();
  const wallets: CircleWallet[] = body?.data?.wallets ?? [];
  if (wallets.length === 0) {
    throw new Error(
      `Wallet set ${walletSetId} has no wallets — check the id in .env.`,
    );
  }

  console.log(`Wallet set ${walletSetId} has ${wallets.length} wallet(s).`);

  let added = 0;
  for (const wallet of wallets) {
    const existing = await db.wallet.findUnique({
      where: { circleWalletId: wallet.id },
    });
    if (existing) {
      console.log(`  ${wallet.address} — already registered (${existing.role})`);
      continue;
    }

    await db.wallet.create({
      data: {
        custodyType: "DEVELOPER_CONTROLLED",
        role: "TREASURY",
        circleWalletId: wallet.id,
        address: wallet.address,
        blockchain: wallet.blockchain,
        accountType: wallet.accountType ?? "EOA",
        walletSetId,
      },
    });
    added += 1;
    console.log(`  ${wallet.address} — registered`);
  }

  const total = await db.wallet.count({ where: { role: "TREASURY" } });
  console.log(`\nAdded ${added}. This database now has ${total} treasury wallet(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
