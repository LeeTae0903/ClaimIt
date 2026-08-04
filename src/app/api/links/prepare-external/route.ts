import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prepareExternalLink } from "@/server/services/payment-link-service";
import { ARC_USDC_ADDRESS, arcTestnet } from "@/lib/chain/arc";

/**
 * Creates a link the sender funds from their own wallet. Unlike
 * /api/links/prepare there's no Circle challenge and no user token, so
 * nothing here needs a provisioned wallet — the response just says where to
 * send the USDC.
 */
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
  const passwordHash = password ? await hashPassword(password) : null;

  const expiresInHours: number | undefined = body.expiresInHours
    ? Number(body.expiresInHours)
    : undefined;
  const expiresAt =
    expiresInHours && expiresInHours > 0
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      : null;

  try {
    const prepared = await prepareExternalLink({
      senderId: session.user.id,
      amountMicros,
      passwordHash,
      expiresAt,
    });

    return NextResponse.json({
      linkId: prepared.linkId,
      claimToken: prepared.rawToken,
      treasuryAddress: prepared.treasuryAddress,
      amountMicros: prepared.amountMicros.toString(),
      // Sent so the browser never hardcodes chain or token details of its own
      // — the server decides what "USDC on Arc" means.
      chainId: arcTestnet.id,
      usdcAddress: ARC_USDC_ADDRESS,
    });
  } catch (err) {
    if (err instanceof Error && /at least/.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
