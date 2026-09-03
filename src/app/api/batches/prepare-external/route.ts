import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { MAX_BATCH_LINKS } from "@/server/services/batch-service";
import { prepareExternalBatch } from "@/server/services/external-funding-service";

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
  const totalMicros = BigInt(Math.round(amount * 1_000_000));

  const linkCount = Number(body.linkCount);
  if (!Number.isInteger(linkCount) || linkCount < 1 || linkCount > MAX_BATCH_LINKS) {
    return NextResponse.json(
      { error: `linkCount must be between 1 and ${MAX_BATCH_LINKS}` },
      { status: 400 },
    );
  }

  const withPasswords: boolean = !!body.withPasswords;

  const expiresInHours: number | undefined = body.expiresInHours
    ? Number(body.expiresInHours)
    : undefined;
  const expiresAt =
    expiresInHours && expiresInHours > 0
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      : null;

  try {
    const { batchId, treasuryAddress, totalMicros: finalTotal, links } =
      await prepareExternalBatch({
        senderId: session.user.id,
        totalMicros,
        linkCount,
        expiresAt,
        withPasswords,
      });

    return NextResponse.json({
      batchId,
      treasuryAddress,
      totalMicros: finalTotal.toString(),
      links: links.map((l) => ({
        linkId: l.linkId,
        amountMicros: l.amountMicros.toString(),
        claimToken: l.rawToken,
        password: l.password,
      })),
    });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
