import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { circleUserClient } from "@/lib/circle/user-wallets";
import { setUserTokenCookie } from "@/lib/circle/user-token-cookie";
import { createWithdrawChallenge } from "@/server/services/withdraw-service";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { toAddress, amount } = await request.json();

  if (!toAddress || typeof toAddress !== "string" || !toAddress.startsWith("0x")) {
    return NextResponse.json(
      { error: "Please enter a valid EVM wallet address." },
      { status: 400 },
    );
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return NextResponse.json(
      { error: "Please enter a valid USDC amount." },
      { status: 400 },
    );
  }

  const amountMicros = BigInt(Math.round(numAmount * 1_000_000));

  const wallet = await db.wallet.findFirst({
    where: { userId: session.user.id, role: "PERSONAL" },
  });

  if (!wallet) {
    return NextResponse.json(
      { error: "No wallet found for your account.", code: "NO_WALLET" },
      { status: 400 },
    );
  }

  try {
    const tokenResponse = await circleUserClient.createUserToken({
      userId: session.user.id,
    });
    const userToken = tokenResponse.data!.userToken;
    const encryptionKey = tokenResponse.data!.encryptionKey!;

    const { challengeId, refId } = await createWithdrawChallenge({
      userToken,
      fromWalletId: wallet.circleWalletId,
      toAddress,
      amountMicros,
    });

    const response = NextResponse.json({
      challengeId,
      refId,
      userToken,
      encryptionKey,
      circleAppId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID,
    });

    setUserTokenCookie(response, userToken);
    return response;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't prepare withdrawal." },
      { status: 500 },
    );
  }
}
