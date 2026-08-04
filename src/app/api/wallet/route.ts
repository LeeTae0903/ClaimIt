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

  // Two different things, both legitimately "your wallet": one provisioned
  // through Circle, and one the user proved they own by signing in with it.
  // Someone who signed in with a wallet has the second and not the first, and
  // the UI has to stop treating the absence of a Circle wallet as "no wallet".
  const [wallets, walletAddresses] = await Promise.all([
    db.wallet.findMany({
      where: { userId: session.user.id, role: "PERSONAL" },
      select: { id: true, address: true, blockchain: true },
    }),
    db.walletAddress.findMany({
      where: { userId: session.user.id },
      select: { address: true, chainId: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return NextResponse.json({
    wallets,
    walletAddresses,
    user: {
      isAnonymous: session.user.isAnonymous ?? false,
      email: session.user.isAnonymous ? null : session.user.email,
    },
  });
}
