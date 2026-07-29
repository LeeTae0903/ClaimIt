import { randomUUID } from "node:crypto";
import { Blockchain } from "@circle-fin/developer-controlled-wallets";
import { db } from "@/lib/db";
import { circleDeveloperClient } from "@/lib/circle/developer-wallets";
import { circleUserClient } from "@/lib/circle/user-wallets";

// Arc's USDC ERC-20 view (6 decimals) — always use this for amounts, never
// the 18-decimal native gas view. See architecture notes on the dual-view
// USDC model.
const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

// Flat deduction matching Arc's documented ~$0.01/tx stable-fee target
// (EIP-1559 + EWMA smoothing keeps this predictable). A dynamic estimate via
// estimateTransferFee would be more precise but makes the amount the
// recipient sees non-deterministic; this trades some precision for a simple,
// predictable "you receive amount minus a flat network fee" guarantee.
export const GAS_FEE_MICROS = 10_000n; // $0.01

function microsToDecimalString(micros: bigint): string {
  const whole = micros / 1_000_000n;
  const frac = (micros % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${frac}`;
}

/**
 * Backend-only transfer from a treasury wallet to a recipient address — no
 * client interaction required, since the treasury is developer-controlled.
 * This is what a claim payout actually calls. Deducts the flat gas fee from
 * the escrowed amount before sending.
 */
export async function payoutFromTreasury({
  paymentLinkId,
  treasuryCircleWalletId,
  toAddress,
  amountMicros,
}: {
  paymentLinkId: string;
  treasuryCircleWalletId: string;
  toAddress: string;
  amountMicros: bigint;
}) {
  if (amountMicros <= GAS_FEE_MICROS) {
    throw new Error(
      `Amount ${amountMicros} is too small to cover the ${GAS_FEE_MICROS} gas fee`,
    );
  }
  const netAmountMicros = amountMicros - GAS_FEE_MICROS;

  const treasuryWallet = await db.wallet.findUniqueOrThrow({
    where: { circleWalletId: treasuryCircleWalletId },
  });

  // walletAddress+blockchain (not walletId) is required here: the SDK's
  // walletId-based type branch statically forbids `blockchain`, but Circle's
  // API rejects tokenAddress without it — confirmed via a live 400 response
  // ("'blockchain' field may not be empty when 'TokenID' field is not set").
  const response = await circleDeveloperClient.createTransaction({
    walletAddress: treasuryWallet.address,
    blockchain: Blockchain.ArcTestnet,
    tokenAddress: ARC_USDC_ADDRESS,
    destinationAddress: toAddress,
    amount: [microsToDecimalString(netAmountMicros)],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });

  const circleTxId = response.data!.id;

  await db.transaction.create({
    data: {
      paymentLinkId,
      type: "PAYOUT",
      circleTxId,
      fromAddress: treasuryWallet.address,
      toAddress,
      amountMicros: netAmountMicros,
      gasFeeMicros: GAS_FEE_MICROS,
      status: "INITIATED",
    },
  });

  return { circleTxId, netAmountMicros };
}

/**
 * Creates a transfer challenge for a sender's non-custodial wallet to send
 * USDC to a treasury address. Unlike payoutFromTreasury, this cannot be
 * silent — the sender must authorize it via the Circle hosted UI (same
 * challenge/execute pattern as wallet PIN setup), since a user-controlled
 * wallet can't be debited without the owner's consent.
 *
 * A challenge and the transaction it eventually produces are different
 * Circle-side entities with different IDs, so nothing is written to our
 * Transaction table here — refId is how confirmDeposit finds the resulting
 * transaction afterward, mirroring the ensure/confirm split used for wallet
 * creation (nothing persisted until the client-side challenge succeeds).
 */
export async function createDepositChallenge({
  userToken,
  fromWalletId,
  treasuryAddress,
  amountMicros,
}: {
  userToken: string;
  fromWalletId: string;
  treasuryAddress: string;
  amountMicros: bigint;
}) {
  const refId = randomUUID();

  const response = await circleUserClient.createTransaction({
    userToken,
    walletId: fromWalletId,
    destinationAddress: treasuryAddress,
    amounts: [microsToDecimalString(amountMicros)],
    blockchain: Blockchain.ArcTestnet,
    tokenAddress: ARC_USDC_ADDRESS,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    refId,
    idempotencyKey: randomUUID(),
  });

  return { challengeId: response.data!.challengeId, refId };
}

/**
 * Called after the client-side challenge from createDepositChallenge
 * succeeds. Finds the resulting transaction by refId (there's no other
 * shared key between a challenge and the transaction it produces) and
 * records it.
 */
export async function confirmDeposit({
  paymentLinkId,
  userToken,
  fromWalletId,
  fromAddress,
  treasuryAddress,
  refId,
}: {
  paymentLinkId: string;
  userToken: string;
  fromWalletId: string;
  fromAddress: string;
  treasuryAddress: string;
  refId: string;
}) {
  const response = await circleUserClient.listTransactions({
    userToken,
    walletIds: [fromWalletId],
  });

  const transaction = (response.data?.transactions ?? []).find(
    (tx) => tx.refId === refId,
  );
  if (!transaction) {
    throw new Error(
      "Deposit transaction not found yet — Circle may still be indexing it.",
    );
  }

  await db.transaction.create({
    data: {
      paymentLinkId,
      type: "DEPOSIT",
      circleTxId: transaction.id,
      fromAddress,
      toAddress: treasuryAddress,
      amountMicros: BigInt(
        Math.round(Number(transaction.amounts?.[0] ?? "0") * 1_000_000),
      ),
      status: transaction.state,
    },
  });

  return { circleTxId: transaction.id, state: transaction.state };
}
