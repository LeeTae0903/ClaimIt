import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const wallet = await db.wallet.findFirst({
    where: { userId: session.user.id, role: "PERSONAL" },
    select: {
      id: true,
      address: true,
      blockchain: true,
      circleWalletId: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ wallet });
}
