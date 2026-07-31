import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const claims = await db.claim.findMany({
    where: { claimantId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { paymentLink: true },
  });

  return NextResponse.json({
    claims: claims.map((claim) => ({
      id: claim.id,
      amountMicros: claim.paymentLink.amountMicros.toString(),
      status: claim.status,
      circleTxId: claim.circleTxId,
      createdAt: claim.createdAt,
    })),
  });
}
