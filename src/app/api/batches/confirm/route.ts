import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  LinkNotFoundError,
  LinkOwnershipError,
} from "@/server/services/payment-link-service";
import {
  BatchUnderfundedError,
  confirmBatchDeposit,
} from "@/server/services/batch-service";
import { DepositNotIndexedYetError } from "@/server/services/transfer-service";
import {
  clearUserTokenCookie,
  getUserTokenCookie,
} from "@/lib/circle/user-token-cookie";

// Same reasoning as /api/links/confirm: the deposit lookup rides out Circle's
// indexing lag with retries, which the platform default would cut short.
export const maxDuration = 60;

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
    if (err instanceof DepositNotIndexedYetError) {
      return NextResponse.json(
        { error: err.message, retryable: true },
        { status: 409 },
      );
    }
    // Terminal: the batch has been marked FAILED and no link was activated,
    // so retrying can't help and the client shouldn't be told to.
    if (err instanceof BatchUnderfundedError) {
      return NextResponse.json(
        { error: err.message, retryable: false },
        { status: 422 },
      );
    }
    if (err instanceof LinkNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof LinkOwnershipError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[batches/confirm] unexpected failure:", err);
    return NextResponse.json(
      { error: "Couldn't confirm the deposit.", retryable: false },
      { status: 500 },
    );
  }
}
