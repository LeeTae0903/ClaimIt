import { randomUUID } from "node:crypto";
import { Blockchain } from "@circle-fin/user-controlled-wallets";
import { circleUserClient } from "@/lib/circle/user-wallets";

const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

function microsToDecimalString(micros: bigint): string {
  const whole = micros / 1_000_000n;
  const frac = (micros % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${frac}`;
}

export async function createWithdrawChallenge({
  userToken,
  fromWalletId,
  toAddress,
  amountMicros,
}: {
  userToken: string;
  fromWalletId: string;
  toAddress: string;
  amountMicros: bigint;
}) {
  const refId = randomUUID();

  const response = await circleUserClient.createTransaction({
    userToken,
    walletId: fromWalletId,
    destinationAddress: toAddress,
    amounts: [microsToDecimalString(amountMicros)],
    blockchain: Blockchain.ArcTestnet,
    tokenAddress: ARC_USDC_ADDRESS,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    refId,
    idempotencyKey: randomUUID(),
  });

  return { challengeId: response.data!.challengeId, refId };
}
