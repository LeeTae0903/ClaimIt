import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Optimistic cookie-presence check only — fast, but not a security boundary.
// Every protected route/action must still call auth.api.getSession() itself;
// this just avoids rendering a page we already know will bounce to sign-in.
export async function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/wallet/:path*", "/links/:path*"],
};
