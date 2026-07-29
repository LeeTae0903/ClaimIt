import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyCircleWebhook } from "@/lib/circle/webhook-verify";

// Circle sends a HEAD request to validate the URL when a subscription is
// created or updated — must respond 200 for the subscription to activate.
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("X-Circle-Signature");
  const keyId = request.headers.get("X-Circle-Key-Id");
  const rawBody = await request.text();

  if (!signature || !keyId) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });
  }

  const valid = await verifyCircleWebhook(rawBody, signature, keyId);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const resource = event.notification;

  // The envelope's `notification` shape matches the changed resource's own
  // API response shape. We only act on ones that look like a transaction
  // (have an id + state) — other Wallets resource types aren't relevant yet.
  if (resource?.id && resource?.state) {
    // networkFeeInUSD is only present once Circle knows the actual cost
    // (i.e. once the transfer has gone on-chain), not at creation — this is
    // claimIT's real gas cost for the payout, tracked for internal
    // accounting only; it's never deducted from what the recipient receives.
    const gasFeeMicros = resource.networkFeeInUSD
      ? BigInt(Math.round(Number(resource.networkFeeInUSD) * 1_000_000))
      : undefined;

    // Idempotent by construction: this always writes the notification's
    // current state rather than incrementing/appending anything, so
    // Circle's at-least-once delivery (possible duplicate notificationIds)
    // is safe to just re-apply.
    await db.transaction.updateMany({
      where: { circleTxId: resource.id },
      data: {
        status: resource.state,
        rawWebhook: event,
        ...(gasFeeMicros !== undefined ? { gasFeeMicros } : {}),
      },
    });
  }

  return NextResponse.json({ received: true });
}
