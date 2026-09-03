import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hashPassword, generateReadablePassword } from "@/lib/password";
import {
  NoWalletError,
  prepareLinkDeposit,
} from "@/server/services/payment-link-service";
import { setUserTokenCookie } from "@/lib/circle/user-token-cookie";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  const amountMicros = BigInt(Math.round(amount * 1_000_000));

  const password: string | undefined = body.password || undefined;
  // "Generate one for me": same helper the giveaway flow already uses, so
  // a single link gets the same readable-password style. Only kicks in
  // when the sender didn't type their own — an explicit password always
  // wins.
  const withPassword: boolean = !!body.withPassword;
  const generatedPassword =
    !password && withPassword ? generateReadablePassword() : null;

  const finalPassword = password ?? generatedPassword;
  const passwordHash = finalPassword ? await hashPassword(finalPassword) : null;

  const expiresInHours: number | undefined = body.expiresInHours
    ? Number(body.expiresInHours)
    : undefined;
  const expiresAt =
    expiresInHours && expiresInHours > 0
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      : null;

  try {
    const { linkId, challengeId, userToken, encryptionKey, rawToken } =
      await prepareLinkDeposit({
        senderId: session.user.id,
        amountMicros,
        passwordHash,
        expiresAt,
      });

    const response = NextResponse.json({
      linkId,
      challengeId,
      // Needed once, immediately, for this render's sdk.execute() call —
      // same rule as wallet setup: not persisted client-side, the httpOnly
      // cookie is what makes /confirm work without the client handling it.
      userToken,
      encryptionKey,
      claimToken: rawToken,
      // Only set when we generated it — a password the sender typed
      // themselves is never echoed back, since they already know it.
      generatedPassword,
      circleAppId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID,
    });
    setUserTokenCookie(response, userToken);
    return response;
  } catch (err) {
    if (err instanceof NoWalletError) {
      return NextResponse.json(
        { error: err.message, code: "NO_WALLET" },
        { status: 400 },
      );
    }
    throw err;
  }
}
