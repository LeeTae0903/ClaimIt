import { db } from "@/lib/db";
import { circleUserClient } from "@/lib/circle/user-wallets";
import {
  createDepositChallenge,
  findDepositTransaction,
  recordTransactionIdempotent,
  DepositNotIndexedYetError,
} from "@/server/services/transfer-service";
import { generateClaimToken, hashClaimToken } from "@/lib/claim-token";
import { getAddress } from "viem";
import { Prisma } from "@/generated/prisma/client";
import { verifyUsdcDeposit } from "@/server/services/onchain-deposit";

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
  if (link.status !== "PENDING_DEPOSIT" || !link.refId) {
    throw new Error(`Link is not awaiting a deposit (status: ${link.status})`);
  }

  const [senderWallet, treasuryWallet] = await Promise.all([
    db.wallet.findFirstOrThrow({ where: { userId: senderId, role: "PERSONAL" } }),
    db.wallet.findUniqueOrThrow({ where: { id: link.treasuryWalletId } }),
  ]);

  const deposit = await findDepositTransaction({
    userToken,
    fromWalletId: senderWallet.circleWalletId,
    refId: link.refId,
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

export class DepositAlreadyUsedError extends Error {
  constructor() {
    super("That transaction has already been used to fund a link.");
    this.name = "DepositAlreadyUsedError";
  }
}

export class DepositNotFromSenderError extends Error {
  constructor() {
    super(
      "That deposit came from a wallet this account hasn't proven it owns. Sign in with the wallet you're funding from.",
    );
    this.name = "DepositNotFromSenderError";
  }
}

/**
 * Ties an on-chain deposit to the person claiming credit for it.
 *
 * Without this, a transaction hash is a bearer token for anyone watching the
 * chain: the treasury addresses are public, so an attacker could create a link
 * for the same amount, wait for someone else's transfer into escrow, and
 * submit that hash as their own funding. Uniqueness alone doesn't help — it
 * only decides who gets there first, and the thief can be faster than the
 * person who actually paid.
 *
 * A SIWE signature is the only thing that proves the sender controls the
 * paying wallet, so that proof is what's required. Funding from a wallet the
 * account hasn't signed in with means signing in with it.
 */
export async function assertDepositFromSender({
  senderId,
  fromAddress,
}: {
  senderId: string;
  fromAddress: string;
}) {
  const proven = await db.walletAddress.findMany({
    where: { userId: senderId },
    select: { address: true },
  });

  const from = getAddress(fromAddress);
  if (!proven.some((w) => getAddress(w.address) === from)) {
    throw new DepositNotFromSenderError();
  }
}

/**
 * Creates a link the sender will fund from their own wallet.
 *
 * No Circle challenge and no sender wallet needed — the row exists first (the
 * same PENDING_DEPOSIT ordering as every other path), and the caller is told
 * which treasury address to pay. Nothing is claimable until a real transfer
 * to that address is verified.
 */
export async function prepareExternalLink({
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

  const treasuries = await db.wallet.findMany({ where: { role: "TREASURY" } });
  if (treasuries.length === 0) throw new Error("No treasury wallets configured");
  const treasury = treasuries[Math.floor(Math.random() * treasuries.length)];

  const rawToken = generateClaimToken();
  const link = await db.paymentLink.create({
    data: {
      tokenHash: hashClaimToken(rawToken),
      senderId,
      treasuryWalletId: treasury.id,
      amountMicros,
      status: "PENDING_DEPOSIT",
      passwordHash,
      expiresAt,
    },
  });

  return {
    linkId: link.id,
    rawToken,
    treasuryAddress: treasury.address,
    amountMicros,
  };
}

/**
 * Activates an externally funded link against a verified on-chain transfer.
 *
 * The activation and the transaction record go in one database transaction so
 * both unique constraints on the hash apply together: a hash already spent on
 * another link — or on a batch — can't slip through between the two writes.
 * That constraint, not a lookup-then-write check, is the replay guard, for
 * the same reason the double-claim guard is a constraint.
 */
export async function confirmExternalLink({
  senderId,
  linkId,
  txHash,
}: {
  senderId: string;
  linkId: string;
  txHash: string;
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

  const treasury = await db.wallet.findUniqueOrThrow({
    where: { id: link.treasuryWalletId },
  });

  const deposit = await verifyUsdcDeposit({
    txHash,
    treasuryAddress: treasury.address,
    minAmountMicros: link.amountMicros,
  });
  await assertDepositFromSender({ senderId, fromAddress: deposit.fromAddress });

  try {
    const [updated] = await db.$transaction([
      db.paymentLink.update({
        where: { id: link.id },
        data: {
          status: "ACTIVE",
          amountMicros: deposit.amountMicros,
          externalTxHash: txHash,
        },
      }),
      db.transaction.create({
        data: {
          paymentLinkId: link.id,
          type: "DEPOSIT",
          onchainTxHash: txHash,
          fromAddress: deposit.fromAddress,
          toAddress: treasury.address,
          amountMicros: deposit.amountMicros,
          status: "COMPLETE",
        },
      }),
    ]);
    return { linkId: updated.id, amountMicros: updated.amountMicros };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new DepositAlreadyUsedError();
    }
    throw err;
  }
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
/**
 * How long an unfunded attempt is kept alive. Past this, the sender plainly
 * never authorised the transfer — the Circle challenge has long expired — and
 * retrying it daily forever is just noise. Cancelled rather than deleted so
 * the record of the attempt survives.
 */
export const ABANDON_PENDING_AFTER_MS = 24 * 60 * 60 * 1000;

export async function reconcilePendingDeposits({
  olderThanMs = 30_000,
}: { olderThanMs?: number } = {}) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const pending = await db.paymentLink.findMany({
    where: {
      status: "PENDING_DEPOSIT",
      createdAt: { lt: cutoff },
      // Links belonging to a giveaway are the batch's business: their deposit
      // is the batch's single transfer, and they carry no refId of their own.
      // Sweeping them here only ever produced "missing refId".
      batchId: null,
    },
  });

  const results: {
    linkId: string;
    promoted: boolean;
    abandoned?: boolean;
    error?: string;
  }[] = [];

  const abandonBefore = new Date(Date.now() - ABANDON_PENDING_AFTER_MS);

  for (const link of pending) {
    try {
      if (!link.refId) {
        // No refId and no batch means the sender chose the external-wallet
        // path and never sent the transfer; there is nothing to look up.
        if (link.createdAt < abandonBefore) {
          await db.paymentLink.update({
            where: { id: link.id },
            data: { status: "CANCELLED" },
          });
          results.push({ linkId: link.id, promoted: false, abandoned: true });
          continue;
        }
        results.push({ linkId: link.id, promoted: false, error: "missing refId" });
        continue;
      }

      const senderWallet = await db.wallet.findFirst({
        where: { userId: link.senderId, role: "PERSONAL" },
      });
      if (!senderWallet) {
        results.push({ linkId: link.id, promoted: false, error: "sender has no wallet" });
        continue;
      }

      const { userToken } = await circleUserClient
        .createUserToken({ userId: link.senderId })
        .then((r) => r.data!);

      const deposit = await findDepositTransaction({
        userToken,
        fromWalletId: senderWallet.circleWalletId,
        refId: link.refId,
        maxAttempts: 1, // the job's own recurring schedule is the retry loop
      });

      const treasuryWallet = await db.wallet.findUniqueOrThrow({
        where: { id: link.treasuryWalletId },
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
        // Still nothing on-chain after a full day: the transfer was never
        // authorised, so stop asking.
        if (link.createdAt < abandonBefore) {
          await db.paymentLink.update({
            where: { id: link.id },
            data: { status: "CANCELLED" },
          });
          results.push({ linkId: link.id, promoted: false, abandoned: true });
          continue;
        }
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
