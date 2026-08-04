import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  claimPaymentLink,
  LinkNotClaimableError,
  IncorrectPasswordError,
  TooManyAttemptsError,
  AlreadyClaimedError,
  NoWalletError,
} from "@/server/services/claim-service";

// The payout waits up to 15s for Circle to reach COMPLETE (compliance
// screening can deny after acceptance). Must not be cut short by the
// platform's default function timeout while a transfer is in flight.
export const maxDuration = 60;

function clientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/links/[token]/claim">,
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { token } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  try {
    const result = await claimPaymentLink({
      token,
      claimantId: session.user.id,
      password: body.password,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? "unknown",
    });

    return NextResponse.json({
      amountMicros: result.amountMicros.toString(),
      circleTxId: result.circleTxId,
      txHash: result.txHash,
      toAddress: result.toAddress,
    });
  } catch (err) {
    if (err instanceof NoWalletError) {
      return NextResponse.json(
        { error: err.message, code: "NO_WALLET" },
        { status: 400 },
      );
    }
    if (err instanceof IncorrectPasswordError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof TooManyAttemptsError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof AlreadyClaimedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof LinkNotClaimableError) {
      return NextResponse.json({ error: err.message }, { status: 410 });
    }
    throw err;
  }
}
