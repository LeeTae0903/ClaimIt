import { db } from "@/lib/db";
import { circleUserClient } from "@/lib/circle/user-wallets";
import {
  createDepositChallenge,
  findDepositTransaction,
  recordTransaction,
} from "@/server/services/transfer-service";
import { generateClaimToken, hashClaimToken } from "@/lib/claim-token";
import type { PendingLinkDraft } from "@/lib/payment-link-draft-cookie";

export const MIN_LINK_AMOUNT_MICROS = 100_000n; // $0.10 — keeps gas cost from dominating tiny links

export class NoWalletError extends Error {
  constructor() {
    super("Sender has no wallet yet — complete wallet setup first.");
    this.name = "NoWalletError";
  }
}

/**
 * Creates the Circle deposit challenge for a new payment link. Nothing is
 * written to PaymentLink/Transaction here — see the draft cookie module for
 * why (mirrors the ensure/confirm pattern from wallet creation: no DB state
 * until the client-side challenge actually succeeds).
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

  const draft: PendingLinkDraft = {
    tokenHash: hashClaimToken(rawToken),
    requestedAmountMicros: amountMicros.toString(),
    passwordHash,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    treasuryWalletId: treasury.id,
    treasuryAddress: treasury.address,
    senderWalletId: senderWallet.circleWalletId,
    senderWalletAddress: senderWallet.address,
    refId,
  };

  return { challengeId, userToken, encryptionKey, rawToken, draft };
}

/**
 * Called after the client-side challenge succeeds. Verifies the deposit
 * actually landed, then creates the PaymentLink using the real on-chain
 * amount as the source of truth (not whatever was requested at prepare
 * time) and records the deposit Transaction against it.
 */
export async function confirmLinkDeposit({
  senderId,
  userToken,
  draft,
}: {
  senderId: string;
  userToken: string;
  draft: PendingLinkDraft;
}) {
  const deposit = await findDepositTransaction({
    userToken,
    fromWalletId: draft.senderWalletId,
    refId: draft.refId,
  });

  const link = await db.paymentLink.create({
    data: {
      tokenHash: draft.tokenHash,
      senderId,
      treasuryWalletId: draft.treasuryWalletId,
      amountMicros: deposit.amountMicros,
      passwordHash: draft.passwordHash,
      expiresAt: draft.expiresAt ? new Date(draft.expiresAt) : null,
      depositTxId: deposit.circleTxId,
      status: "ACTIVE",
    },
  });

  await recordTransaction({
    paymentLinkId: link.id,
    type: "DEPOSIT",
    circleTxId: deposit.circleTxId,
    fromAddress: draft.senderWalletAddress,
    toAddress: draft.treasuryAddress,
    amountMicros: deposit.amountMicros,
    status: deposit.state,
  });

  return { linkId: link.id, amountMicros: deposit.amountMicros };
}
