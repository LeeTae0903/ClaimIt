import { getAddress, parseEventLogs } from "viem";
import { ARC_USDC_ADDRESS, ERC20_ABI, arcPublicClient } from "@/lib/chain/arc";

export class DepositNotMinedError extends Error {
  constructor() {
    super("That transaction isn't confirmed on Arc yet.");
    this.name = "DepositNotMinedError";
  }
}

export class DepositRejectedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "DepositRejectedError";
  }
}

/**
 * Confirms that a transaction hash the browser handed us really did move USDC
 * into one of our treasury wallets.
 *
 * Everything here is deliberately re-derived from the chain rather than taken
 * from the client: the browser supplies only a hash, and a hash is a claim,
 * not evidence. The amount used downstream is the one in the Transfer event,
 * never the one the sender said they were sending.
 *
 * Reading the ERC-20 Transfer log — rather than the transaction's value — is
 * also what keeps the decimals straight: the log's value is in the token's
 * own 6-decimal base units, while Arc's native value is 18-decimal gas USDC.
 */
export async function verifyUsdcDeposit({
  txHash,
  treasuryAddress,
  minAmountMicros,
}: {
  txHash: string;
  treasuryAddress: string;
  minAmountMicros: bigint;
}): Promise<{ amountMicros: bigint; fromAddress: string; blockNumber: bigint }> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new DepositRejectedError("That isn't a valid transaction hash.");
  }

  let receipt;
  try {
    receipt = await arcPublicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });
  } catch {
    // Not mined, or the node hasn't caught up. Retryable, not a rejection —
    // a deposit that is merely young must not be treated as fraudulent.
    throw new DepositNotMinedError();
  }

  if (receipt.status !== "success") {
    throw new DepositRejectedError("That transaction failed on-chain.");
  }

  const transfers = parseEventLogs({
    abi: ERC20_ABI,
    eventName: "Transfer",
    logs: receipt.logs,
  });

  const treasury = getAddress(treasuryAddress);
  const match = transfers.find(
    (log) =>
      getAddress(log.address) === getAddress(ARC_USDC_ADDRESS) &&
      getAddress(log.args.to) === treasury,
  );

  if (!match) {
    throw new DepositRejectedError(
      "That transaction didn't send USDC to the escrow address for this link.",
    );
  }

  const amountMicros = match.args.value;
  if (amountMicros < minAmountMicros) {
    throw new DepositRejectedError(
      `That transfer was ${Number(amountMicros) / 1e6} USDC, less than the ${
        Number(minAmountMicros) / 1e6
      } USDC this link promises.`,
    );
  }

  return {
    amountMicros,
    fromAddress: getAddress(match.args.from),
    blockNumber: receipt.blockNumber,
  };
}
