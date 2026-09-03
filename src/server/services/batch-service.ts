import { db } from "@/lib/db";
import { circleUserClient } from "@/lib/circle/user-wallets";
import {
  createDepositChallenge,
  findDepositTransaction,
  recordTransactionIdempotent,
  DepositNotIndexedYetError,
} from "@/server/services/transfer-service";
import { generateClaimToken, hashClaimToken } from "@/lib/claim-token";
import { generateReadablePassword, hashPassword } from "@/lib/password";
import {
  MIN_LINK_AMOUNT_MICROS,
  NoWalletError,
  LinkNotFoundError,
  LinkOwnershipError,
} from "@/server/services/payment-link-service";

/** Bounded so one request can't create thousands of rows and Circle calls. */
export const MAX_BATCH_LINKS = 100;

export class BatchUnderfundedError extends Error {
  constructor(depositedMicros: bigint, requiredMicros: bigint) {
    super(
      `Deposit of ${depositedMicros} micros doesn't cover the ${requiredMicros} micros this batch promises.`,
    );
    this.name = "BatchUnderfundedError";
  }
}

/**
 * Divides a total across N links without losing or inventing a micro.
 *
 * Integer division alone leaves a remainder — 10 USDC over 3 links is
 * 3.333333 each and 1 micro unaccounted for. The remainder is handed out one
 * micro at a time to the earliest links, so the parts always sum to exactly
 * the total. Anything else either short-changes the treasury or promises more
 * than was deposited.
 */
export function splitMicros(total: bigint, count: number): bigint[] {
  if (count <= 0) throw new Error("count must be positive");
  const n = BigInt(count);
  const base = total / n;
  const remainder = Number(total % n);
  return Array.from({ length: count }, (_, i) =>
    i < remainder ? base + 1n : base,
  );
}

/**
 * Creates a giveaway: one deposit challenge for the whole amount, and N
 * PENDING_DEPOSIT links persisted before the sender can authorise anything —
 * the same ordering the single-link flow uses, for the same reason. If the
 * confirm never lands, the rows already exist for reconciliation to find.
 *
 * The generated passwords are returned in plaintext here and nowhere else.
 * Only their hashes are stored, so this response is the sender's one chance
 * to keep them — same contract as the claim tokens themselves.
 */
export async function prepareBatchDeposit({
  senderId,
  totalMicros,
  linkCount,
  expiresAt,
  withPasswords,
}: {
  senderId: string;
  totalMicros: bigint;
  linkCount: number;
  expiresAt: Date | null;
  withPasswords: boolean;
}) {
  if (!Number.isInteger(linkCount) || linkCount < 1) {
    throw new Error("linkCount must be a positive integer");
  }
  if (linkCount > MAX_BATCH_LINKS) {
    throw new Error(`A batch can hold at most ${MAX_BATCH_LINKS} links`);
  }

  const amounts = splitMicros(totalMicros, linkCount);
  if (amounts[amounts.length - 1] < MIN_LINK_AMOUNT_MICROS) {
    throw new Error(
      `Each link would get less than the ${MIN_LINK_AMOUNT_MICROS} micro minimum — use fewer links or a larger total.`,
    );
  }

  const senderWallet = await db.wallet.findFirst({
    where: { userId: senderId, role: "PERSONAL" },
  });
  if (!senderWallet) throw new NoWalletError();

  const treasuries = await db.wallet.findMany({ where: { role: "TREASURY" } });
  if (treasuries.length === 0) throw new Error("No treasury wallets configured");
  const treasury = treasuries[Math.floor(Math.random() * treasuries.length)];

  const { userToken, encryptionKey } = await circleUserClient
    .createUserToken({ userId: senderId })
    .then((r) => r.data!);

  const { challengeId, refId } = await createDepositChallenge({
    userToken,
    fromWalletId: senderWallet.circleWalletId,
    treasuryAddress: treasury.address,
    amountMicros: totalMicros,
  });

  // Tokens and passwords are generated up front so the plaintext exists only
  // in this function's scope and the response it returns.
  const secrets = await Promise.all(
    amounts.map(async (amountMicros) => {
      const rawToken = generateClaimToken();
      const password = withPasswords ? generateReadablePassword() : null;
      return {
        amountMicros,
        rawToken,
        password,
        tokenHash: hashClaimToken(rawToken),
        passwordHash: password ? await hashPassword(password) : null,
      };
    }),
  );

  const batch = await db.linkBatch.create({
    data: {
      senderId,
      treasuryWalletId: treasury.id,
      totalMicros,
      linkCount,
      status: "PENDING_DEPOSIT",
      refId,
      links: {
        create: secrets.map((s) => ({
          tokenHash: s.tokenHash,
          senderId,
          treasuryWalletId: treasury.id,
          amountMicros: s.amountMicros,
          status: "PENDING_DEPOSIT",
          passwordHash: s.passwordHash,
          expiresAt,
        })),
      },
    },
    include: { links: { orderBy: { createdAt: "asc" } } },
  });

  // Pair each created row with its plaintext by amount-preserving order —
  // the rows were created from `secrets` in this same order.
  const links = batch.links.map((link, i) => ({
    linkId: link.id,
    amountMicros: link.amountMicros,
    rawToken: secrets[i].rawToken,
    password: secrets[i].password,
  }));

  return { batchId: batch.id, challengeId, userToken, encryptionKey, links };
}

/**
 * Promotes every link in a batch once the single deposit is confirmed.
 *
 * The guard that matters is the coverage check: a batch promises the sum of
 * its links, so activating it when less arrived would make more USDC
 * claimable than the treasury received. Unlike the single-link flow — which
 * rewrites the link's amount to whatever landed on-chain — a batch can't
 * meaningfully redistribute a different total across N already-generated
 * links, so a short deposit fails the batch instead of silently reshaping it.
 *
 * Idempotent: an already-ACTIVE batch returns its links rather than erroring.
 */
export async function confirmBatchDeposit({
  senderId,
  batchId,
  userToken,
}: {
  senderId: string;
  batchId: string;
  userToken: string;
}) {
  const batch = await db.linkBatch.findUnique({
    where: { id: batchId },
    include: { links: true },
  });
  if (!batch) throw new LinkNotFoundError();
  if (batch.senderId !== senderId) throw new LinkOwnershipError();

  if (batch.status === "ACTIVE") {
    return { batchId: batch.id, linkCount: batch.linkCount };
  }
  if (batch.status !== "PENDING_DEPOSIT" || !batch.refId) {
    throw new Error(`Batch is not awaiting a deposit (status: ${batch.status})`);
  }

  const [senderWallet, treasuryWallet] = await Promise.all([
    db.wallet.findFirstOrThrow({ where: { userId: senderId, role: "PERSONAL" } }),
    db.wallet.findUniqueOrThrow({ where: { id: batch.treasuryWalletId } }),
  ]);

  const promised = batch.links.reduce((sum, l) => sum + l.amountMicros, 0n);

  const deposit = await findDepositTransaction({
    userToken,
    fromWalletId: senderWallet.circleWalletId,
    destinationAddress: treasuryWallet.address,
    amountMicros: promised,
    notBefore: new Date(batch.createdAt.getTime() - 5 * 60_000),
  });

  if (deposit.amountMicros < promised) {
    await db.linkBatch.update({
      where: { id: batch.id },
      data: { status: "FAILED", depositedMicros: deposit.amountMicros },
    });
    throw new BatchUnderfundedError(deposit.amountMicros, promised);
  }

  await db.$transaction([
    db.linkBatch.update({
      where: { id: batch.id },
      data: {
        status: "ACTIVE",
        depositTxId: deposit.circleTxId,
        depositedMicros: deposit.amountMicros,
      },
    }),
    db.paymentLink.updateMany({
      where: { batchId: batch.id, status: "PENDING_DEPOSIT" },
      data: { status: "ACTIVE", depositTxId: deposit.circleTxId },
    }),
  ]);

  await recordTransactionIdempotent({
    batchId: batch.id,
    type: "DEPOSIT",
    circleTxId: deposit.circleTxId,
    fromAddress: senderWallet.address,
    toAddress: treasuryWallet.address,
    amountMicros: deposit.amountMicros,
    status: deposit.state,
  });

  return { batchId: batch.id, linkCount: batch.linkCount };
}

/** The batch equivalent of reconcilePendingDeposits, same rationale. */
export async function reconcilePendingBatches({
  olderThanMs = 30_000,
}: { olderThanMs?: number } = {}) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const pending = await db.linkBatch.findMany({
    where: { status: "PENDING_DEPOSIT", createdAt: { lt: cutoff } },
  });

  const results: { batchId: string; promoted: boolean; error?: string }[] = [];

  for (const batch of pending) {
    try {
      const { userToken } = await circleUserClient
        .createUserToken({ userId: batch.senderId })
        .then((r) => r.data!);

      await confirmBatchDeposit({
        senderId: batch.senderId,
        batchId: batch.id,
        userToken,
      });
      results.push({ batchId: batch.id, promoted: true });
    } catch (err) {
      if (err instanceof DepositNotIndexedYetError) {
        results.push({ batchId: batch.id, promoted: false });
      } else {
        results.push({
          batchId: batch.id,
          promoted: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return results;
}
