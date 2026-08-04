import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Read-only view of the signed-in user's wallets.
 *
 * Deliberately separate from POST /api/wallet/ensure, which provisions one
 * as a side effect: anything that just wants to *display* the wallet (the
 * account menu, the dashboard) must not be able to trigger Circle user
 * creation and a PIN challenge simply by rendering.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const wallets = await db.wallet.findMany({
    where: { userId: session.user.id, role: "PERSONAL" },
    select: { id: true, address: true, blockchain: true },
  });

  return NextResponse.json({
    wallets,
    user: {
      isAnonymous: session.user.isAnonymous ?? false,
      email: session.user.isAnonymous ? null : session.user.email,
    },
  });
}
