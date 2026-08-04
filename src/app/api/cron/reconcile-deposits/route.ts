import { NextRequest, NextResponse } from "next/server";
import { reconcilePendingDeposits } from "@/server/services/payment-link-service";

// Reconciliation can walk several stale deposits, each hitting Circle.
export const maxDuration = 60;

// Not user-facing — meant to be hit by a scheduler. Protected by a shared
// secret rather than a user session.
async function handle(request: NextRequest) {
  // Checked separately so an unset CRON_SECRET fails closed — otherwise the
  // comparison string becomes the literal "Bearer undefined" and anyone
  // sending that header gets in.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await reconcilePendingDeposits();
  return NextResponse.json({ results });
}

// Vercel Cron only ever issues GET, and injects `Authorization: Bearer
// $CRON_SECRET` itself when that env var is set — which is exactly what
// handle() checks. POST stays for manual/local invocation.
export const GET = handle;
export const POST = handle;
