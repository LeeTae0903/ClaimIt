import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  regenerateClaimLink,
  LinkNotFoundError,
  LinkOwnershipError,
} from "@/server/services/payment-link-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const result = await regenerateClaimLink({ senderId: session.user.id, linkId: id });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LinkNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof LinkOwnershipError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't regenerate link." },
      { status: 400 },
    );
  }
}