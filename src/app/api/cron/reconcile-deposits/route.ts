import { NextRequest, NextResponse } from "next/server";
import { reconcilePendingDeposits } from "@/server/services/payment-link-service";
import { reconcilePendingBatches } from "@/server/services/batch-service";

// Not user-facing — meant to be hit by a scheduler (Vercel Cron in
// production; invoked manually for now, since real scheduling needs a
// deployed environment, same constraint as webhooks and Apple Sign In).
// Protected by a shared secret rather than a user session.
async function handleReconcile(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [results, batchResults] = await Promise.all([
    reconcilePendingDeposits(),
    reconcilePendingBatches(),
  ]);
  return NextResponse.json({ results, batchResults });
}

export async function GET(request: NextRequest) {
  return handleReconcile(request);
}

export async function POST(request: NextRequest) {
  return handleReconcile(request);
}
