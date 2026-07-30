import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { confirmLinkDeposit } from "@/server/services/payment-link-service";
import { DepositNotIndexedYetError } from "@/server/services/transfer-service";
import { clearUserTokenCookie, getUserTokenCookie } from "@/lib/circle/user-token-cookie";
import { clearDraftCookie, getDraftCookie } from "@/lib/payment-link-draft-cookie";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userToken = getUserTokenCookie(request);
  const draft = getDraftCookie(request);
  if (!userToken || !draft) {
    return NextResponse.json(
      { error: "No pending link for this session" },
      { status: 400 },
    );
  }

  try {
    const result = await confirmLinkDeposit({
      senderId: session.user.id,
      userToken,
      draft,
    });

    const response = NextResponse.json(result);
    clearUserTokenCookie(response);
    clearDraftCookie(response);
    return response;
  } catch (err) {
    // Deliberately don't clear the draft/userToken cookies here — the
    // client is expected to retry the same confirm call, and it needs the
    // same draft (refId etc.) to find the same deposit transaction.
    if (err instanceof DepositNotIndexedYetError) {
      return NextResponse.json(
        { error: err.message, retryable: true },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Couldn't confirm the deposit.", retryable: false },
      { status: 500 },
    );
  }
}
