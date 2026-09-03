import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  confirmExternalBatch,
  DepositAlreadyUsedError,
  DepositNotFromSenderError,
  DepositNotMinedError,
  DepositRejectedError,
} from "@/server/services/external-funding-service";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const batchId: string | undefined = body.batchId;
  const txHash: string | undefined = body.txHash;
  if (!batchId || !txHash) {
    return NextResponse.json({ error: "Missing batchId or txHash" }, { status: 400 });
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
      return NextResponse.json({ error: err.message, retryable: true }, { status: 409 });
    }
    if (err instanceof DepositRejectedError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof DepositNotFromSenderError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof DepositAlreadyUsedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
