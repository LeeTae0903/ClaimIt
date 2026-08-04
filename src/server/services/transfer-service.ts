import { randomUUID } from "node:crypto";
import { Blockchain } from "@circle-fin/developer-controlled-wallets";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { circleDeveloperClient } from "@/lib/circle/developer-wallets";
import { circleUserClient } from "@/lib/circle/user-wallets";

// Arc's USDC ERC-20 view (6 decimals) — always use this for amounts, never
// the 18-decimal native gas view. See architecture notes on the dual-view
// USDC model.
const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

function microsToDecimalString(micros: bigint): string {
  const whole = micros / 1_000_000n;
  const frac = (micros % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${frac}`;
}

/**
 * Backend-only transfer from a treasury wallet to a recipient address — no
 * client interaction required, since the treasury is developer-controlled.
 * This is what a claim payout actually calls.
 *
 * The recipient always receives the full escrowed amount. Gas for this
 * transfer is paid automatically by the treasury wallet itself, separate
 * from the transfer amount (that's just how gas works on Arc/EVM — the
 * signing wallet pays it, not the recipient) — so this is claimIT's
 * operating cost, not something deducted from what the recipient gets. The
 * real cost is tiny (measured ~$0.002–0.01 per transfer in testing) and
 * gets recorded into gasFeeMicros later, once the webhook reports the
 * completed transaction's actual networkFeeInUSD — it isn't knowable at
 * creation time.
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
    amount: [microsToDecimalString(amountMicros)],
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
      amountMicros,
      status: "INITIATED",
    },
  });

  return { circleTxId };
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

export class DepositNotIndexedYetError extends Error {
  constructor() {
    super("Deposit transaction not found yet — Circle may still be indexing it.");
    this.name = "DepositNotIndexedYetError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// How many of the wallet's most recent transactions to inspect per attempt.
// The one we're looking for was created seconds ago and the list comes back
// newest-first, so anything beyond this is someone else's older activity.
const DEPOSIT_SCAN_DEPTH = 10;

/**
 * Called after the client-side challenge from createDepositChallenge
 * succeeds. Finds the resulting transaction by refId (there's no other
 * shared key between a challenge and the transaction it produces) — read
 * only, no DB write, so callers that need to create a dependent row (e.g. a
 * PaymentLink) first can do so using this result as the source of truth for
 * the actual on-chain amount before recording the transaction itself via
 * recordTransaction.
 *
 * Matching costs a lookup per candidate because **Circle's list endpoint
 * omits refId entirely** — it's only present on GET /transactions/{id}, and
 * the documented `refId` query parameter is ignored (verified against the
 * live API: filtering by three different refIds returned the same unfiltered
 * set). Comparing `tx.refId` straight off the list therefore never matches,
 * which previously made every deposit look like an indexing failure forever.
 * refId is still the only safe key: two links for the same amount to the
 * same treasury are indistinguishable by amount/address alone.
 *
 * A genuine indexing lag also exists — Arc has sub-second finality but
 * Circle's query API isn't necessarily caught up the instant the client's
 * callback fires — so this still retries, and callers (the API route) should
 * treat DepositNotIndexedYetError as retryable.
 */
export async function findDepositTransaction({
  userToken,
  fromWalletId,
  refId,
  maxAttempts = 5,
  delayMs = 1500,
}: {
  userToken: string;
  fromWalletId: string;
  refId: string;
  maxAttempts?: number;
  delayMs?: number;
}) {
  // Transactions already fetched and ruled out. Retries only pay for ids
  // that appeared since the previous pass.
  const ruledOut = new Set<string>();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await circleUserClient.listTransactions({
      userToken,
      walletIds: [fromWalletId],
    });

    const candidates = (response.data?.transactions ?? []).slice(
      0,
      DEPOSIT_SCAN_DEPTH,
    );

    for (const candidate of candidates) {
      // Kept for the day Circle starts returning it in the list response:
      // then no detail call is needed at all.
      if (candidate.refId === refId) {
        return {
          circleTxId: candidate.id,
          state: candidate.state,
          amountMicros: BigInt(
            Math.round(Number(candidate.amounts?.[0] ?? "0") * 1_000_000),
          ),
        };
      }

      if (!candidate.id || ruledOut.has(candidate.id)) continue;

      const detail = await circleUserClient.getTransaction({
        userToken,
        id: candidate.id,
      });
      const transaction = detail.data?.transaction;

      if (transaction?.refId === refId) {
        return {
          circleTxId: transaction.id ?? candidate.id,
          state: transaction.state ?? candidate.state,
          amountMicros: BigInt(
            Math.round(Number(transaction.amounts?.[0] ?? "0") * 1_000_000),
          ),
        };
      }

      ruledOut.add(candidate.id);
    }

    if (attempt < maxAttempts) await sleep(delayMs);
  }

  throw new DepositNotIndexedYetError();
}

export async function recordTransaction(data: {
  paymentLinkId: string;
  type: "DEPOSIT" | "PAYOUT" | "REFUND";
  circleTxId: string;
  fromAddress: string;
  toAddress: string;
  amountMicros: bigint;
  status: string;
}) {
  return db.transaction.create({ data });
}

/**
 * Same as recordTransaction, but tolerates a duplicate circleTxId (P2002 on
 * the unique constraint) as a no-op success instead of throwing. Needed
 * because the synchronous confirm path and the reconciliation job can both
 * race to record the same deposit — either can win, the other just finds
 * it already recorded.
 */
export async function recordTransactionIdempotent(
  data: Parameters<typeof recordTransaction>[0],
) {
  try {
    return await recordTransaction(data);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return null;
    }
    throw err;
  }
}
