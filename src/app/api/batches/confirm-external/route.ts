import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  DepositAlreadyUsedError,
  DepositNotFromSenderError,
  LinkNotFoundError,
  LinkOwnershipError,
} from "@/server/services/payment-link-service";
import { confirmExternalBatch } from "@/server/services/batch-service";
import {
  DepositNotMinedError,
  DepositRejectedError,
} from "@/server/services/onchain-deposit";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { batchId, txHash } = body as { batchId?: string; txHash?: string };
  if (!batchId || !txHash) {
    return NextResponse.json(
      { error: "Missing batchId or txHash" },
      { status: 400 },
    );
  }

  try {
    const result = await confirmExternalBatch({
      senderId: session.user.id,
      batchId,
      txHash,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DepositNotMinedError) {
      return NextResponse.json(
        { error: err.message, retryable: true },
        { status: 409 },
      );
    }
    // Terminal: no link was activated, so retrying can't help. Covers both a
    // transfer to the wrong place and one that doesn't cover the total.
    if (err instanceof DepositRejectedError) {
      return NextResponse.json(
        { error: err.message, retryable: false },
        { status: 422 },
      );
    }
    // The deposit is real but wasn't made by a wallet this account has
    // proven it owns, so crediting it here would hand someone else's money
    // to whoever asked first.
    if (err instanceof DepositNotFromSenderError) {
      return NextResponse.json(
        { error: err.message, retryable: false },
        { status: 403 },
      );
    }
    if (err instanceof DepositAlreadyUsedError) {
      return NextResponse.json(
        { error: err.message, retryable: false },
        { status: 409 },
      );
    }
    if (err instanceof LinkNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof LinkOwnershipError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[batches/confirm-external] unexpected failure:", err);
    return NextResponse.json(
      { error: "Couldn't confirm the deposit.", retryable: false },
      { status: 500 },
    );
  }
}
