import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureUserWallet } from "@/server/services/wallet-service";

const USER_TOKEN_COOKIE = "circle_user_token";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
  });

  const result = await ensureUserWallet({
    id: user.id,
    circleUserId: user.circleUserId,
  });

  if (result.status === "ready") {
    return NextResponse.json(result);
  }

  const response = NextResponse.json({
    status: result.status,
    challengeId: result.challengeId,
    // Needed once, immediately, for this render's sdk.execute() call. The
    // client must not persist it itself (no localStorage) — the httpOnly
    // cookie below is what makes the follow-up /confirm call work without
    // the client ever having to handle this value again.
    userToken: result.userToken,
    encryptionKey: result.encryptionKey,
    circleAppId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID,
  });

  response.cookies.set(USER_TOKEN_COOKIE, result.userToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 55 * 60,
  });

  return response;
}
