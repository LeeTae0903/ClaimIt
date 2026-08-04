import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * What the sender actually sent.
 *
 * Two deliberate exclusions. PENDING_DEPOSIT rows are left out: they exist
 * from the moment a link is *started*, before the deposit is authorised, so
 * an abandoned attempt would otherwise appear in activity as something that
 * happened. Nothing was sent until the money moved.
 *
 * And a giveaway is reported as one entry rather than as its links — a
 * 10-link batch filling activity with ten identical rows is what the count is
 * for.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [links, batches] = await Promise.all([
    db.paymentLink.findMany({
      where: {
        senderId: session.user.id,
        batchId: null,
        status: { not: "PENDING_DEPOSIT" },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.linkBatch.findMany({
      where: { senderId: session.user.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: {
        links: { select: { status: true, expiresAt: true } },
      },
    }),
  ]);

  const linkEntries = links.map((link) => ({
    kind: "link" as const,
    id: link.id,
    amountMicros: link.amountMicros.toString(),
    status: link.status,
    hasPassword: !!link.passwordHash,
    createdAt: link.createdAt,
    claimedAt: link.claimedAt,
    expiresAt: link.expiresAt,
  }));

  const batchEntries = batches.map((batch) => ({
    kind: "batch" as const,
    id: batch.id,
    amountMicros: batch.totalMicros.toString(),
    linkCount: batch.linkCount,
    claimedCount: batch.links.filter((l) => l.status === "CLAIMED").length,
    status: "ACTIVE" as const,
    createdAt: batch.createdAt,
    expiresAt: batch.links[0]?.expiresAt ?? null,
  }));

  const entries = [...linkEntries, ...batchEntries].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  return NextResponse.json({ entries });
}
