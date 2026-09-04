import { db } from "@/lib/db";
import { hashClaimToken } from "@/lib/claim-token";
import { verifyPassword } from "@/lib/password";
import { payoutFromTreasury } from "@/server/services/transfer-service";
import { circleDeveloperClient } from "@/lib/circle/developer-wallets";
import { NoWalletError } from "@/server/services/payment-link-service";

export { NoWalletError };

const PASSWORD_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_PASSWORD_ATTEMPTS = 5;

export type PublicLinkInfo =
  | { found: false }
  | {
      found: true;
      status: "claimable" | "claimed" | "expired" | "cancelled" | "pending";
      amountMicros: string;
      hasPassword: boolean;
    };

/**
 * Read-only, unauthenticated. Never reveals the sender's identity, and
 * never reveals anything for a token that doesn't hash-match a real link
 * (found: false looks identical whether the token is malformed, unknown,
 * or was never valid — no oracle for guessing).
 */
export async function getPublicLinkInfo(token: string): Promise<PublicLinkInfo> {
  const link = await db.paymentLink.findUnique({
    where: { tokenHash: hashClaimToken(token) },
  });
  if (!link) return { found: false };

  // A link still in PENDING_DEPOSIT hasn't failed or expired — the
  // sender's on-chain deposit just hasn't finished being confirmed yet
  // (that confirm call runs in the background *after* the claim link is
  // already shown to the sender, see CreateLinkForm/CreateGiveawayForm).
  // Reporting this as "expired" was actively wrong and alarming: anyone
  // who opened the link within that few-second window saw "Payment Link
  // Expired" for a link that becomes claimable moments later on its own,
  // with no code change on the sender's side at all.
  if (link.status === "PENDING_DEPOSIT") {
    return {
      found: true,
      status: "pending",
      amountMicros: link.amountMicros.toString(),
      hasPassword: !!link.passwordHash,
    };
  }

  const isLazilyExpired =
    link.status === "ACTIVE" && link.expiresAt !== null && link.expiresAt < new Date();

  const status = isLazilyExpired
    ? "expired"
    : link.status === "ACTIVE"
    ? "claimable"
    : link.status === "CLAIMED"
    ? "claimed"
    : link.status === "EXPIRED"
    ? "expired"
    : link.status === "CANCELLED"
    ? "cancelled"
    : "expired";

  return {
    found: true,
    status,
    amountMicros: link.amountMicros.toString(),
    hasPassword: !!link.passwordHash,
  };
}

export class LinkNotClaimableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "LinkNotClaimableError";
  }
}

export class IncorrectPasswordError extends Error {
  constructor() {
    super("Incorrect password.");
    this.name = "IncorrectPasswordError";
  }
}

export class TooManyAttemptsError extends Error {
  constructor() {
    super("Too many incorrect attempts. Try again later.");
    this.name = "TooManyAttemptsError";
  }
}

export class AlreadyClaimedError extends Error {
  constructor() {
    super("This link has already been claimed.");
    this.name = "AlreadyClaimedError";
  }
}

async function auditLog(data: {
  actorType: string;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: object;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await db.auditLog.create({ data });
}

/**
 * The full claim flow: validates status/expiry/password (with a DB-backed
 * lockout — claim attempts are inherently low-frequency, so this doesn't
 * need Redis to be effective), reserves the claim via Claim.paymentLinkId's
 * unique constraint (the actual double-claim guard — a second concurrent
 * attempt simply fails to insert), then pays out. If the payout itself
 * fails after the claim was reserved, the reservation is released (Claim
 * row removed, audited first) so the link stays claimable — a transient
 * Circle-side failure shouldn't permanently brick a link.
 */
export async function claimPaymentLink({
  token,
  claimantId,
  password,
  ipAddress,
  userAgent,
}: {
  token: string;
  claimantId: string;
  password?: string;
  ipAddress: string;
  userAgent: string;
}) {
  const link = await db.paymentLink.findUnique({
    where: { tokenHash: hashClaimToken(token) },
  });
  if (!link) throw new LinkNotClaimableError("Link not found.");

  if (
    link.status === "ACTIVE" &&
    link.expiresAt !== null &&
    link.expiresAt < new Date()
  ) {
    await db.paymentLink.update({
      where: { id: link.id },
      data: { status: "EXPIRED" },
    });
    throw new LinkNotClaimableError("This link has expired.");
  }

  if (link.status === "PENDING_DEPOSIT") {
    throw new LinkNotClaimableError(
      "This link is still confirming the sender's deposit — try again in a few seconds.",
    );
  }

  if (link.status !== "ACTIVE") {
    throw new LinkNotClaimableError(`This link is not claimable (${link.status}).`);
  }

  if (link.passwordHash) {
    const recentFailures = await db.auditLog.count({
      where: {
        action: "CLAIM_PASSWORD_FAILED",
        targetType: "PaymentLink",
        targetId: link.id,
        createdAt: { gt: new Date(Date.now() - PASSWORD_ATTEMPT_WINDOW_MS) },
      },
    });
    if (recentFailures >= MAX_PASSWORD_ATTEMPTS) {
      throw new TooManyAttemptsError();
    }

    const ok = password ? await verifyPassword(password, link.passwordHash) : false;
    if (!ok) {
      await auditLog({
        actorType: "USER",
        actorId: claimantId,
        action: "CLAIM_PASSWORD_FAILED",
        targetType: "PaymentLink",
        targetId: link.id,
        ipAddress,
        userAgent,
      });
      throw new IncorrectPasswordError();
    }
  }

  const claimantWallet = await db.wallet.findFirst({
    where: { userId: claimantId, role: "PERSONAL" },
  });
  if (!claimantWallet) {
    throw new NoWalletError();
  }

  // The unique constraint on Claim.paymentLinkId is the actual double-claim
  // guard: if two requests race past the status check above, only one of
  // these inserts can succeed.
  let claim;
  try {
    claim = await db.claim.create({
      data: {
        paymentLinkId: link.id,
        claimantId,
        status: "PENDING",
        ipAddress,
        userAgent,
      },
    });
  } catch {
    throw new AlreadyClaimedError();
  }

  const treasuryWallet = await db.wallet.findUniqueOrThrow({
    where: { id: link.treasuryWalletId },
  });
  console.error("[claim] treasury wallet:", treasuryWallet.circleWalletId, treasuryWallet.address);

  try {
    const { circleTxId } = await payoutFromTreasury({
      paymentLinkId: link.id,
      treasuryCircleWalletId: treasuryWallet.circleWalletId,
      toAddress: claimantWallet.address,
      amountMicros: link.amountMicros,
    });

    // Wait for the transfer to actually reach COMPLETE before committing to
    // CLAIMED/SUCCEEDED — accepting the create call only means Circle
    // queued it, not that it will complete (compliance screening can still
    // DENY it, for instance). waitForState rejects on a terminal failure
    // state, and the timeout bounds a transaction that's genuinely stuck;
    // both fall through to the same catch below, which releases the
    // reservation. Arc's sub-second finality means this normally resolves
    // almost immediately in practice.
    const completed = await circleDeveloperClient.getTransaction({
      id: circleTxId,
      waitForState: "COMPLETE",
      signal: AbortSignal.timeout(15_000),
    });
    const tx = completed.data?.transaction;
    if (!tx || tx.state !== "COMPLETE") {
      throw new Error(`Payout did not complete (state: ${tx?.state ?? "unknown"})`);
    }

    await db.$transaction([
      db.paymentLink.update({
        where: { id: link.id },
        data: { status: "CLAIMED", claimedAt: new Date() },
      }),
      db.claim.update({
        where: { id: claim.id },
        data: { status: "SUCCEEDED", circleTxId },
      }),
    ]);

    await auditLog({
      actorType: "USER",
      actorId: claimantId,
      action: "LINK_CLAIMED",
      targetType: "PaymentLink",
      targetId: link.id,
      metadata: { circleTxId, amountMicros: link.amountMicros.toString() },
      ipAddress,
      userAgent,
    });

    return {
      amountMicros: link.amountMicros,
      circleTxId,
      txHash: tx.txHash ?? null,
      toAddress: claimantWallet.address,
    };
  } catch (err) {
    const failReason = err instanceof Error ? err.message : String(err);
    console.error("[claim] payout failed:", failReason, err);

    // Release the reservation — a transient or denied payout shouldn't
    // permanently lock out a legitimate retry. The failed attempt is
    // audited before the Claim row is removed. Note: in the narrow case
    // where the transaction was actually just slow rather than genuinely
    // stuck, a subsequent retry creates a new transfer attempt rather than
    // resuming this one — acceptable given Arc's demonstrated sub-second
    // finality makes that window practically theoretical on testnet, but
    // worth a proper reconciliation job (mirroring the deposit one) if this
    // ever shows up in practice.
    await auditLog({
      actorType: "SYSTEM",
      action: "CLAIM_PAYOUT_FAILED",
      targetType: "PaymentLink",
      targetId: link.id,
      metadata: { failReason },
      ipAddress,
      userAgent,
    });
    await db.claim.delete({ where: { id: claim.id } });

    throw new LinkNotClaimableError(
      "Couldn't complete the payout — please try again.",
    );
  }
}
