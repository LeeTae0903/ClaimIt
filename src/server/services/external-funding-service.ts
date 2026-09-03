import { db } from "@/lib/db";
import { verifyUsdcDeposit, DepositNotMinedError, DepositRejectedError } from "@/server/services/onchain-deposit";
import { generateClaimToken, hashClaimToken } from "@/lib/claim-token";
import { generateReadablePassword, hashPassword } from "@/lib/password";
import { MIN_LINK_AMOUNT_MICROS } from "@/server/services/payment-link-service";
import { MAX_BATCH_LINKS, splitMicros } from "@/server/services/batch-service";

export { DepositNotMinedError, DepositRejectedError };

/**
 * Funding a link or batch straight from the sender's own connected wallet,
 * verified on-chain — the counterpart to the Circle-escrow flow in
 * payment-link-service.ts / batch-service.ts. Kept in its own file rather
 * than merged into those: it never touches a Circle wallet or challenge, so
 * nothing here needs to share their internals, and the existing Circle path
 * stays byte-for-byte as shipped.
 */

export class DepositAlreadyUsedError extends Error {
  constructor() {
    super("That transaction has already been used to fund a link.");
    this.name = "DepositAlreadyUsedError";
  }
}

export class DepositNotFromSenderError extends Error {
  constructor() {
    super(
      "That transfer wasn't sent from a wallet you've signed in with. Sign in with the sending wallet first.",
    );
    this.name = "DepositNotFromSenderError";
  }
}

/**
 * The ownership guard: an on-chain deposit can only be credited to the
 * sender's own link/batch if it came from an address they've proven control
 * of by signing in with it (see WalletAddress / the siwe plugin). Without
 * this, anyone watching the public treasury address for incoming transfers
 * could race the real sender's confirm call and claim credit for a deposit
 * that wasn't theirs.
 */
async function assertDepositFromSender(senderId: string, fromAddress: string) {
  const proven = await db.walletAddress.findMany({
    where: { userId: senderId },
    select: { address: true },
  });
  const owns = proven.some(
    (w) => w.address.toLowerCase() === fromAddress.toLowerCase(),
  );
  if (!owns) throw new DepositNotFromSenderError();
}

async function pickTreasuryWallet() {
  const treasuries = await db.wallet.findMany({ where: { role: "TREASURY" } });
  if (treasuries.length === 0) throw new Error("No treasury wallets configured");
  return treasuries[Math.floor(Math.random() * treasuries.length)];
}

async function rejectIfAlreadyUsed(txHash: string) {
  const [tx, link, batch] = await Promise.all([
    db.transaction.findFirst({ where: { onchainTxHash: txHash } }),
    db.paymentLink.findFirst({ where: { externalTxHash: txHash } }),
    db.linkBatch.findFirst({ where: { externalTxHash: txHash } }),
  ]);
  if (tx || link || batch) throw new DepositAlreadyUsedError();
}

// ---------------------------------------------------------------------------
// Single link
// ---------------------------------------------------------------------------

/**
 * Creates the PENDING_DEPOSIT row and hands back the treasury address to
 * send USDC to, plus the claim link's one-time secrets — same ordering as
 * the Circle flow's prepareLinkDeposit, for the same reason: the row exists
 * before the sender broadcasts anything, so reconciliation has something to
 * find even if the confirm call never lands.
 */
export async function prepareExternalLink({
  senderId,
  amountMicros,
  expiresAt,
  withPassword,
}: {
  senderId: string;
  amountMicros: bigint;
  expiresAt: Date | null;
  withPassword: boolean;
}) {
  if (amountMicros < MIN_LINK_AMOUNT_MICROS) {
    throw new Error(
      `Minimum link amount is ${Number(MIN_LINK_AMOUNT_MICROS) / 1_000_000} USDC.`,
    );
  }

  const treasury = await pickTreasuryWallet();

  const rawToken = generateClaimToken();
  const password = withPassword ? generateReadablePassword() : null;

  const link = await db.paymentLink.create({
    data: {
      tokenHash: hashClaimToken(rawToken),
      senderId,
      treasuryWalletId: treasury.id,
      amountMicros,
      status: "PENDING_DEPOSIT",
      passwordHash: password ? await hashPassword(password) : null,
      expiresAt,
    },
  });

  return {
    linkId: link.id,
    treasuryAddress: treasury.address,
    amountMicros,
    rawToken,
    password,
  };
}

/**
 * Confirms a link funded from the sender's own wallet. The amount is taken
 * from the chain, not the client — if more arrived than was asked for, the
 * link is credited for the full amount actually deposited (same behaviour as
 * the Circle-funded single-link flow).
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
  if (!link) throw new Error("Link not found.");
  if (link.senderId !== senderId) throw new Error("You don't own this link.");

  if (link.status === "ACTIVE") {
    return { linkId: link.id, amountMicros: link.amountMicros };
  }
  if (link.status !== "PENDING_DEPOSIT") {
    throw new Error(`Link is not awaiting a deposit (status: ${link.status})`);
  }

  const treasury = await db.wallet.findUniqueOrThrow({
    where: { id: link.treasuryWalletId },
  });

  await rejectIfAlreadyUsed(txHash);

  const deposit = await verifyUsdcDeposit({
    txHash,
    treasuryAddress: treasury.address,
    minAmountMicros: link.amountMicros,
  });

  await assertDepositFromSender(senderId, deposit.fromAddress);

  try {
    await db.$transaction([
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
          status: "CONFIRMED",
        },
      }),
    ]);
  } catch (err) {
    // A unique-constraint collision here means someone else's confirm call
    // won the race for this same hash between the check above and this
    // write — treat it the same as catching it up front.
    if ((err as { code?: string })?.code === "P2002") {
      throw new DepositAlreadyUsedError();
    }
    throw err;
  }

  return { linkId: link.id, amountMicros: deposit.amountMicros };
}

// ---------------------------------------------------------------------------
// Giveaway / batch
// ---------------------------------------------------------------------------

export async function prepareExternalBatch({
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

  const treasury = await pickTreasuryWallet();

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

  const links = batch.links.map((link, i) => ({
    linkId: link.id,
    amountMicros: link.amountMicros,
    rawToken: secrets[i].rawToken,
    password: secrets[i].password,
  }));

  return { batchId: batch.id, treasuryAddress: treasury.address, totalMicros, links };
}

/**
 * Confirms a giveaway funded from the sender's own wallet. Unlike the
 * single-link flow, a short deposit can't be redistributed across
 * already-generated links — same rule as the Circle-funded batch path, just
 * without a Circle challenge to check against.
 */
export async function confirmExternalBatch({
  senderId,
  batchId,
  txHash,
}: {
  senderId: string;
  batchId: string;
  txHash: string;
}) {
  const batch = await db.linkBatch.findUnique({
    where: { id: batchId },
    include: { links: true },
  });
  if (!batch) throw new Error("Batch not found.");
  if (batch.senderId !== senderId) throw new Error("You don't own this batch.");

  if (batch.status === "ACTIVE") {
    return { batchId: batch.id, linkCount: batch.linkCount };
  }
  if (batch.status !== "PENDING_DEPOSIT") {
    throw new Error(`Batch is not awaiting a deposit (status: ${batch.status})`);
  }

  const treasury = await db.wallet.findUniqueOrThrow({
    where: { id: batch.treasuryWalletId },
  });

  const promised = batch.links.reduce((sum, l) => sum + l.amountMicros, 0n);

  await rejectIfAlreadyUsed(txHash);

  const deposit = await verifyUsdcDeposit({
    txHash,
    treasuryAddress: treasury.address,
    minAmountMicros: promised,
  });

  await assertDepositFromSender(senderId, deposit.fromAddress);

  try {
    await db.$transaction([
      db.linkBatch.update({
        where: { id: batch.id },
        data: {
          status: "ACTIVE",
          externalTxHash: txHash,
          depositedMicros: deposit.amountMicros,
        },
      }),
      db.paymentLink.updateMany({
        where: { batchId: batch.id, status: "PENDING_DEPOSIT" },
        data: { status: "ACTIVE" },
      }),
      db.transaction.create({
        data: {
          batchId: batch.id,
          type: "DEPOSIT",
          onchainTxHash: txHash,
          fromAddress: deposit.fromAddress,
          toAddress: treasury.address,
          amountMicros: deposit.amountMicros,
          status: "CONFIRMED",
        },
      }),
    ]);
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") {
      throw new DepositAlreadyUsedError();
    }
    throw err;
  }

  return { batchId: batch.id, linkCount: batch.linkCount };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/** Rows on the external-wallet path with no deposit after this long are abandoned. */
export const ABANDON_PENDING_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * A row on the external-wallet path (no refId — that field belongs to the
 * Circle flow) that's sat unfunded for a full day is very unlikely to still
 * be funded. This is deliberately separate from reconcilePendingDeposits /
 * reconcilePendingBatches — those poll Circle for a matching transfer, which
 * doesn't apply here, so this only ever cancels, never promotes.
 */
export async function reconcileAbandonedExternalDeposits() {
  const cutoff = new Date(Date.now() - ABANDON_PENDING_AFTER_MS);

  const [links, batches] = await Promise.all([
    db.paymentLink.updateMany({
      where: {
        status: "PENDING_DEPOSIT",
        refId: null,
        batchId: null,
        externalTxHash: null,
        createdAt: { lt: cutoff },
      },
      data: { status: "CANCELLED" },
    }),
    db.linkBatch.updateMany({
      where: {
        status: "PENDING_DEPOSIT",
        refId: null,
        externalTxHash: null,
        createdAt: { lt: cutoff },
      },
      data: { status: "FAILED" },
    }),
  ]);

  return { cancelledLinks: links.count, failedBatches: batches.count };
}
