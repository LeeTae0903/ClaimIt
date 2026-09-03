import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  confirmBatchDeposit,
  BatchUnderfundedError,
} from "@/server/services/batch-service";
import {
  LinkNotFoundError,
  LinkOwnershipError,
} from "@/server/services/payment-link-service";
import { DepositNotIndexedYetError } from "@/server/services/transfer-service";
import { clearUserTokenCookie, getUserTokenCookie } from "@/lib/circle/user-token-cookie";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userToken = getUserTokenCookie(request);
  if (!userToken) {
    return NextResponse.json(
      { error: "No pending wallet session — please retry from the form." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const batchId: string | undefined = body.batchId;
  if (!batchId) {
    return NextResponse.json({ error: "Missing batchId" }, { status: 400 });
  }

  try {
    const result = await confirmBatchDeposit({
      senderId: session.user.id,
      batchId,
      userToken,
    });

    const response = NextResponse.json(result);
    clearUserTokenCookie(response);
    return response;
  } catch (err) {
    // Deliberately don't clear the userToken cookie on a retryable failure
    // — the client is expected to call confirm again with the same
    // batchId, and the LinkBatch row (not this cookie) is what carries the
    // state that matters (refId etc.) between attempts. Even if this
    // cookie is lost too, the reconciliation job will pick up the
    // PENDING_DEPOSIT row independently.
    if (err instanceof DepositNotIndexedYetError) {
      return NextResponse.json(
        { error: err.message, retryable: true },
        { status: 409 },
      );
    }
    if (err instanceof LinkNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof LinkOwnershipError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof BatchUnderfundedError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[batches/confirm] unexpected error:", err);
    return NextResponse.json(
      { error: "Couldn't confirm the deposit.", retryable: false },
      { status: 500 },
    );
  }
}
