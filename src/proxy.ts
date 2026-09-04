import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Every hostname that currently serves this app in production. Only one of
// these can ever be the domain wallet sign-in (SIWE) expects — see
// appHost() in src/lib/auth.ts. The signed SIWE message carries
// window.location.host, and the server only accepts a signature for the
// single domain BETTER_AUTH_URL points it at. Vercel's own domain redirect
// (Settings > Domains) already sends the bare lootclaim.xyz apex to
// www.lootclaim.xyz, but it can't redirect away the old default
// lootclaim.vercel.app URL — so anyone who landed there from a stale link
// or bookmark and tried "Continue with wallet" got "Unauthorized: SIWE
// message does not match the expected nonce, domain, address, or chain ID"
// even though everything else (nonce, address, chain ID) was correct.
// Redirecting to the canonical host here, before any page renders, keeps
// the two in sync no matter which URL someone actually typed in.
//
// Scoped to page routes only (not /api/*) so this can't interfere with
// server-to-server calls that hit this app directly, like the Vercel cron
// job or Circle webhooks.
const CANONICAL_HOST = "www.lootclaim.xyz";
const NON_CANONICAL_HOSTS = new Set(["lootclaim.vercel.app", "lootclaim.xyz"]);

const PROTECTED_PATH_PREFIXES = ["/dashboard", "/wallet", "/links"];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const host = request.headers.get("host") ?? "";

  if (!pathname.startsWith("/api/") && NON_CANONICAL_HOSTS.has(host)) {
    const url = new URL(request.url);
    url.protocol = "https:";
    url.host = CANONICAL_HOST;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  // Optimistic cookie-presence check only — fast, but not a security
  // boundary. Every protected route/action must still call
  // auth.api.getSession() itself; this just avoids rendering a page we
  // already know will bounce to sign-in.
  const isProtected = PROTECTED_PATH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
  if (isProtected) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
