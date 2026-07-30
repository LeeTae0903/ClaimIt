import { NextRequest, NextResponse } from "next/server";

// Short-lived holder for a Circle userToken between an "ensure/prepare" step
// (which creates a challenge) and the "confirm" step that follows client-side
// challenge execution. httpOnly so the token never round-trips through
// client-side JS storage after the initial response that hands it to the SDK.
const COOKIE_NAME = "circle_user_token";
const MAX_AGE_SECONDS = 55 * 60; // Circle userTokens expire after 60 minutes.

export function setUserTokenCookie(response: NextResponse, userToken: string) {
  response.cookies.set(COOKIE_NAME, userToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function getUserTokenCookie(request: NextRequest): string | undefined {
  return request.cookies.get(COOKIE_NAME)?.value;
}

export function clearUserTokenCookie(response: NextResponse) {
  response.cookies.delete(COOKIE_NAME);
}
