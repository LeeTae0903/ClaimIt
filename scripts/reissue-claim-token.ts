/**
 * Issues a fresh claim token for a link whose URL was lost.
 *
 * Only the hash of a claim token is stored, and the raw token is shown
 * exactly once — at link creation. If the client never got that far (a failed
 * confirm, a closed tab), the link stays funded and ACTIVE with escrowed USDC
 * that nobody can reach, because nobody knows the URL.
 *
 * Replacing the hash is safe precisely because the original token was never
 * displayed: no one holds a token this invalidates. It is NOT a way to
 * "reset" a link someone already has — refuses to touch a link that has been
 * claimed, and every reissue is written to the audit log.
 *
 * Usage:
 *   npx tsx scripts/reissue-claim-token.ts <linkId> [baseUrl]
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { generateClaimToken, hashClaimToken } from "../src/lib/claim-token";

async function main() {
  const linkId = process.argv[2];
  const baseUrl = process.argv[3] ?? "https://claim-it-eight.vercel.app";
  if (!linkId) throw new Error("Usage: reissue-claim-token.ts <linkId> [baseUrl]");

  const link = await db.paymentLink.findUnique({
    where: { id: linkId },
    include: { claim: true },
  });
  if (!link) throw new Error(`No link ${linkId}`);
  if (link.claim) {
    throw new Error(
      `Link ${linkId} was already claimed — reissuing would be pointless and misleading.`,
    );
  }
  if (link.status !== "ACTIVE") {
    throw new Error(
      `Link ${linkId} is ${link.status}, not ACTIVE — only a funded, unclaimed link has anything to reissue.`,
    );
  }

  const token = generateClaimToken();
  await db.paymentLink.update({
    where: { id: linkId },
    data: { tokenHash: hashClaimToken(token) },
  });

  await db.auditLog.create({
    data: {
      actorType: "SYSTEM",
      action: "CLAIM_TOKEN_REISSUED",
      targetType: "PaymentLink",
      targetId: linkId,
      metadata: { reason: "original token never reached the client" },
    },
  });

  console.log(`Reissued. Amount: ${Number(link.amountMicros) / 1e6} USDC`);
  console.log(`${baseUrl}/claim/${token}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
