import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const links = await db.paymentLink.findMany({
    where: { senderId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    links: links.map((link) => ({
      id: link.id,
      amountMicros: link.amountMicros.toString(),
      status: link.status,
      hasPassword: !!link.passwordHash,
      createdAt: link.createdAt,
      claimedAt: link.claimedAt,
      expiresAt: link.expiresAt,
    })),
  });
}
