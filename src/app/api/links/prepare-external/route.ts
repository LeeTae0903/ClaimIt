import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prepareExternalLink } from "@/server/services/external-funding-service";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  const amountMicros = BigInt(Math.round(amount * 1_000_000));

  const withPassword: boolean = !!body.withPassword;

  const expiresInHours: number | undefined = body.expiresInHours
    ? Number(body.expiresInHours)
    : undefined;
  const expiresAt =
    expiresInHours && expiresInHours > 0
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      : null;

  try {
    const { linkId, treasuryAddress, amountMicros: finalAmount, rawToken, password } =
      await prepareExternalLink({
        senderId: session.user.id,
        amountMicros,
        expiresAt,
        withPassword,
      });

    return NextResponse.json({
      linkId,
      treasuryAddress,
      amountMicros: finalAmount.toString(),
      claimToken: rawToken,
      password,
    });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
