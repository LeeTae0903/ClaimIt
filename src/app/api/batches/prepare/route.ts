import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { NoWalletError } from "@/server/services/payment-link-service";
import { MAX_BATCH_LINKS, prepareBatchDeposit } from "@/server/services/batch-service";
import { setUserTokenCookie } from "@/lib/circle/user-token-cookie";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();

  const total = Number(body.totalAmount);
  if (!Number.isFinite(total) || total <= 0) {
    return NextResponse.json({ error: "Invalid total amount" }, { status: 400 });
  }
  const totalMicros = BigInt(Math.round(total * 1_000_000));

  const linkCount = Number(body.linkCount);
  if (!Number.isInteger(linkCount) || linkCount < 1 || linkCount > MAX_BATCH_LINKS) {
    return NextResponse.json(
      { error: `Number of links must be between 1 and ${MAX_BATCH_LINKS}` },
      { status: 400 },
    );
  }

  const expiresInHours: number | undefined = body.expiresInHours
    ? Number(body.expiresInHours)
    : undefined;
  const expiresAt =
    expiresInHours && expiresInHours > 0
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      : null;

  try {
    const { batchId, challengeId, userToken, encryptionKey, links } =
      await prepareBatchDeposit({
        senderId: session.user.id,
        totalMicros,
        linkCount,
        expiresAt,
        withPasswords: body.withPasswords !== false,
      });

    const response = NextResponse.json({
      batchId,
      challengeId,
      userToken,
      encryptionKey,
      circleAppId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID,
      // Claim tokens and generated passwords exist in plaintext here and
      // nowhere else — only hashes are stored. The client has to hold these
      // until the deposit confirms, which is why the batch is rendered from
      // this response rather than re-fetched afterwards.
      links: links.map((l) => ({
        linkId: l.linkId,
        amountMicros: l.amountMicros.toString(),
        claimToken: l.rawToken,
        password: l.password,
      })),
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
    // Amount/count validation from the service (per-link minimum, batch cap)
    // is a client mistake, not a server fault.
    if (err instanceof Error && /at least|at most|positive integer/.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
