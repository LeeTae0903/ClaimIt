import { NextRequest, NextResponse } from "next/server";

// Holds a payment link's not-yet-persisted details between /prepare (which
// creates the Circle deposit challenge) and /confirm (which verifies the
// deposit landed and only then writes the PaymentLink row). Nothing here is
// trusted at confirm time except tokenHash/passwordHash/expiresAt/
// treasuryWalletId — the claimed amount is always re-derived from the
// actual on-chain transaction, never taken from this cookie or the client.
const COOKIE_NAME = "pending_link_draft";
const MAX_AGE_SECONDS = 55 * 60;

export type PendingLinkDraft = {
  tokenHash: string;
  requestedAmountMicros: string; // BigInt as string — JSON can't hold BigInt
  passwordHash: string | null;
  expiresAt: string | null; // ISO string
  treasuryWalletId: string;
  treasuryAddress: string;
  senderWalletId: string;
  senderWalletAddress: string;
  refId: string;
};

export function setDraftCookie(response: NextResponse, draft: PendingLinkDraft) {
  response.cookies.set(COOKIE_NAME, JSON.stringify(draft), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function getDraftCookie(request: NextRequest): PendingLinkDraft | undefined {
  const raw = request.cookies.get(COOKIE_NAME)?.value;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PendingLinkDraft;
  } catch {
    return undefined;
  }
}

export function clearDraftCookie(response: NextResponse) {
  response.cookies.delete(COOKIE_NAME);
}
