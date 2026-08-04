import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  confirmExternalLink,
  DepositAlreadyUsedError,
  LinkNotFoundError,
  LinkOwnershipError,
} from "@/server/services/payment-link-service";
import {
  DepositNotMinedError,
  DepositRejectedError,
} from "@/server/services/onchain-deposit";

// Arc finalises in under a second, but the RPC node this reads from may lag a
// moment behind the wallet that broadcast the transaction.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { linkId, txHash } = body as { linkId?: string; txHash?: string };
  if (!linkId || !txHash) {
    return NextResponse.json(
      { error: "Missing linkId or txHash" },
      { status: 400 },
    );
  }

  try {
    const result = await confirmExternalLink({
      senderId: session.user.id,
      linkId,
      txHash,
    });
    return NextResponse.json({
      linkId: result.linkId,
      amountMicros: result.amountMicros.toString(),
    });
  } catch (err) {
    // Young transaction, not a bad one — the client should keep asking.
    if (err instanceof DepositNotMinedError) {
      return NextResponse.json(
        { error: err.message, retryable: true },
        { status: 409 },
      );
    }
    if (err instanceof DepositRejectedError) {
      return NextResponse.json(
        { error: err.message, retryable: false },
        { status: 422 },
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
    console.error("[links/confirm-external] unexpected failure:", err);
    return NextResponse.json(
      { error: "Couldn't confirm the deposit.", retryable: false },
      { status: 500 },
    );
  }
}
