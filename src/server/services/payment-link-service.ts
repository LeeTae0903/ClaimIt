import { db } from "@/lib/db";
import { circleUserClient } from "@/lib/circle/user-wallets";
import {
  createDepositChallenge,
  findDepositTransaction,
  recordTransactionIdempotent,
  DepositNotIndexedYetError,
} from "@/server/services/transfer-service";
import { generateClaimToken, hashClaimToken } from "@/lib/claim-token";

export const MIN_LINK_AMOUNT_MICROS = 100_000n; // $0.10 — keeps gas cost from dominating tiny links

export class NoWalletError extends Error {
  constructor() {
    super("Sender has no wallet yet — complete wallet setup first.");
    this.name = "NoWalletError";
  }
}

export class LinkNotFoundError extends Error {
  constructor() {
    super("Payment link not found.");
    this.name = "LinkNotFoundError";
  }
}

export class LinkOwnershipError extends Error {
  constructor() {
    super("This payment link doesn't belong to the current session.");
    this.name = "LinkOwnershipError";
  }
}

/**
 * Creates the Circle deposit challenge for a new payment link, then
 * *immediately* persists the PaymentLink as PENDING_DEPOSIT — before the
 * response even reaches the client, i.e. before the user can possibly
 * authorize the on-chain transfer. This is the safety net: if the
 * synchronous confirm step never completes (crash, closed tab, exhausted
 * retries), the row still exists with everything needed (refId,
 * passwordHash, expiresAt, treasuryWalletId) for the reconciliation job to
 * pick up later. Nothing here depends on a cookie surviving.
 */
export async function prepareLinkDeposit({
  senderId,
  amountMicros,
  passwordHash,
  expiresAt,
}: {
  senderId: string;
  amountMicros: bigint;
  passwordHash: string | null;
  expiresAt: Date | null;
}) {
  if (amountMicros < MIN_LINK_AMOUNT_MICROS) {
    throw new Error(`Amount must be at least ${MIN_LINK_AMOUNT_MICROS} micros`);
  }

  const senderWallet = await db.wallet.findFirst({
    where: { userId: senderId, role: "PERSONAL" },
  });
  if (!senderWallet) throw new NoWalletError();

  const treasuries = await db.wallet.findMany({ where: { role: "TREASURY" } });
  if (treasuries.length === 0) {
    throw new Error("No treasury wallets configured");
  }
  // Simple random spread across the pool — at this scale there's no need
  // for balance-aware routing, and it avoids an extra balance-check call
  // per link creation.
  const treasury = treasuries[Math.floor(Math.random() * treasuries.length)];

  const { userToken, encryptionKey } = await circleUserClient
    .createUserToken({ userId: senderId })
    .then((r) => r.data!);

  const { challengeId, refId } = await createDepositChallenge({
    userToken,
    fromWalletId: senderWallet.circleWalletId,
    treasuryAddress: treasury.address,
    amountMicros,
  });

  const rawToken = generateClaimToken();

  const link = await db.paymentLink.create({
    data: {
      tokenHash: hashClaimToken(rawToken),
      senderId,
      treasuryWalletId: treasury.id,
      amountMicros, // requested amount; confirm/reconcile overwrite with the real on-chain amount
      status: "PENDING_DEPOSIT",
      passwordHash,
      expiresAt,
      refId,
    },
  });

  return {
    linkId: link.id,
    challengeId,
    userToken,
    encryptionKey,
    rawToken,
  };
}

/**
 * Called after the client-side challenge succeeds. Promotes the existing
 * PENDING_DEPOSIT row (created by prepareLinkDeposit) to ACTIVE once the
 * deposit is confirmed on-chain, using the real on-chain amount as the
 * source of truth rather than whatever was requested at prepare time.
 *
 * Idempotent: if the reconciliation job already promoted this link (or a
 * duplicate client call arrives), returns the already-ACTIVE result rather
 * than erroring or double-recording the transaction.
 */
export async function confirmLinkDeposit({
  senderId,
  linkId,
  userToken,
}: {
  senderId: string;
  linkId: string;
  userToken: string;
}) {
  const link = await db.paymentLink.findUnique({ where: { id: linkId } });
  if (!link) throw new LinkNotFoundError();
  if (link.senderId !== senderId) throw new LinkOwnershipError();

  if (link.status === "ACTIVE") {
    return { linkId: link.id, amountMicros: link.amountMicros };
  }
  if (link.status !== "PENDING_DEPOSIT") {
    throw new Error(`Link is not awaiting a deposit (status: ${link.status})`);
  }

  const [senderWallet, treasuryWallet] = await Promise.all([
    db.wallet.findFirstOrThrow({ where: { userId: senderId, role: "PERSONAL" } }),
    db.wallet.findUniqueOrThrow({ where: { id: link.treasuryWalletId } }),
  ]);

  const deposit = await findDepositTransaction({
    userToken,
    fromWalletId: senderWallet.circleWalletId,
    destinationAddress: treasuryWallet.address,
    amountMicros: link.amountMicros,
    notBefore: new Date(link.createdAt.getTime() - 5 * 60_000),
  });

  const updated = await db.paymentLink.update({
    where: { id: link.id },
    data: {
      status: "ACTIVE",
      amountMicros: deposit.amountMicros,
      depositTxId: deposit.circleTxId,
    },
  });

  await recordTransactionIdempotent({
    paymentLinkId: link.id,
    type: "DEPOSIT",
    circleTxId: deposit.circleTxId,
    fromAddress: senderWallet.address,
    toAddress: treasuryWallet.address,
    amountMicros: deposit.amountMicros,
    status: deposit.state,
  });

  return { linkId: updated.id, amountMicros: updated.amountMicros };
}

/**
 * The safety net itself. Scans PENDING_DEPOSIT links old enough that the
 * synchronous confirm should have already run (or failed), and promotes
 * any whose deposit actually landed on-chain — automatically recovering
 * from exactly the crash scenario that previously required manual DB
 * surgery. Links with no matching transaction yet are left as-is (either
 * still indexing, or the user simply never authorized the transfer — the
 * common case, and not something to "fix").
 */
export async function reconcilePendingDeposits({
  olderThanMs = 30_000,
}: { olderThanMs?: number } = {}) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const pending = await db.paymentLink.findMany({
    where: { status: "PENDING_DEPOSIT", createdAt: { lt: cutoff } },
  });

  const results: { linkId: string; promoted: boolean; error?: string }[] = [];

  for (const link of pending) {
    try {
      const senderWallet = await db.wallet.findFirst({
        where: { userId: link.senderId, role: "PERSONAL" },
      });
      if (!senderWallet) {
        results.push({ linkId: link.id, promoted: false, error: "sender has no wallet" });
        continue;
      }

      const treasuryWallet = await db.wallet.findUniqueOrThrow({
        where: { id: link.treasuryWalletId },
      });

      const { userToken } = await circleUserClient
        .createUserToken({ userId: link.senderId })
        .then((r) => r.data!);

      const deposit = await findDepositTransaction({
        userToken,
        fromWalletId: senderWallet.circleWalletId,
        destinationAddress: treasuryWallet.address,
        amountMicros: link.amountMicros,
        notBefore: new Date(link.createdAt.getTime() - 5 * 60_000),
        maxAttempts: 1, // the job's own recurring schedule is the retry loop
      });

      await db.paymentLink.update({
        where: { id: link.id },
        data: {
          status: "ACTIVE",
          amountMicros: deposit.amountMicros,
          depositTxId: deposit.circleTxId,
        },
      });

      await recordTransactionIdempotent({
        paymentLinkId: link.id,
        type: "DEPOSIT",
        circleTxId: deposit.circleTxId,
        fromAddress: senderWallet.address,
        toAddress: treasuryWallet.address,
        amountMicros: deposit.amountMicros,
        status: deposit.state,
      });

      results.push({ linkId: link.id, promoted: true });
    } catch (err) {
      if (err instanceof DepositNotIndexedYetError) {
        results.push({ linkId: link.id, promoted: false });
      } else {
        results.push({
          linkId: link.id,
          promoted: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return results;
}