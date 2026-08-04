import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { MAX_BATCH_LINKS, prepareExternalBatch } from "@/server/services/batch-service";
import { ARC_USDC_ADDRESS, arcTestnet } from "@/lib/chain/arc";

/** A giveaway funded from the sender's own wallet. No Circle wallet needed. */
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
    const prepared = await prepareExternalBatch({
      senderId: session.user.id,
      totalMicros,
      linkCount,
      expiresAt,
      withPasswords: body.withPasswords !== false,
    });

    return NextResponse.json({
      batchId: prepared.batchId,
      treasuryAddress: prepared.treasuryAddress,
      totalMicros: prepared.totalMicros.toString(),
      chainId: arcTestnet.id,
      usdcAddress: ARC_USDC_ADDRESS,
      // Plaintext exists here and nowhere else — only hashes are stored.
      links: prepared.links.map((l) => ({
        linkId: l.linkId,
        amountMicros: l.amountMicros.toString(),
        claimToken: l.rawToken,
        password: l.password,
      })),
    });
  } catch (err) {
    if (err instanceof Error && /at least|at most|positive integer/.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
