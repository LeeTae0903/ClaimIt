import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { confirmLinkDeposit } from "@/server/services/payment-link-service";
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

  const result = await confirmLinkDeposit({
    senderId: session.user.id,
    userToken,
    draft,
  });

  const response = NextResponse.json(result);
  clearUserTokenCookie(response);
  clearDraftCookie(response);
  return response;
}
