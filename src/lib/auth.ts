import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { anonymous, emailOTP, siwe } from "better-auth/plugins";
import { generateSiweNonce } from "viem/siwe";
import { arcPublicClient } from "@/lib/chain/arc";
import { importPKCS8, SignJWT } from "jose";
import { after } from "next/server";
import { db } from "@/lib/db";
import { sendOtpEmail } from "@/lib/email";

const APPLE_ENV_VARS = [
  "APPLE_CLIENT_ID",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
] as const;

function appleConfigured() {
  return APPLE_ENV_VARS.every((name) => !!process.env[name]);
}

/**
 * The host a SIWE message must name.
 *
 * The browser signs a message containing `window.location.host`, and the
 * plugin rejects the signature unless it matches this exactly — so this has to
 * be the host people actually browse, not whatever BETTER_AUTH_URL happens to
 * say. Vercel provides the production hostname itself; locally it comes from
 * BETTER_AUTH_URL.
 */
function appHost(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return process.env.VERCEL_PROJECT_PRODUCTION_URL;
  }
  try {
    return new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").host;
  } catch {
    return "localhost:3000";
  }
}

async function appleClientSecret() {
  const teamId = process.env.APPLE_TEAM_ID!;
  const keyId = process.env.APPLE_KEY_ID!;
  const clientId = process.env.APPLE_CLIENT_ID!;
  const privateKey = process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n");

  const key = await importPKCS8(privateKey, "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 180 * 24 * 60 * 60)
    .sign(key);
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
    apple: async () => ({
      clientId: process.env.APPLE_CLIENT_ID ?? "",
      clientSecret: appleConfigured() ? await appleClientSecret() : "",
      appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER,
    }),
  },
  // appleid.apple.com is required for Sign In with Apple's redirect flow.
  // The Vercel hosts are there because Better Auth's origin check rejects
  // any request whose Origin isn't baseURL or listed here — and it only
  // bites once a session cookie exists, so a misconfigured BETTER_AUTH_URL
  // looks like "sign-in works, then everything 403s" rather than an
  // outright failure. Vercel sets these three itself, so the deployment
  // trusts its own hostnames whatever BETTER_AUTH_URL happens to say.
  trustedOrigins: [
    "https://appleid.apple.com",
    ...[
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
    ]
      .filter((host): host is string => !!host)
      .map((host) => `https://${host}`),
  ],
  advanced: {
    backgroundTasks: {
      // Hands the send to Next's `after()` so the response still goes out
      // immediately (keeping the timing oracle closed) while the platform is
      // told to keep the instance alive until Resend actually responds.
      // Without this, Better Auth falls back to awaiting the promise inline.
      handler: (promise) => after(promise),
    },
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        // Awaited, not voided: the promise this returns is what Better Auth
        // hands to the background handler above. Discarding it orphaned the
        // HTTP call to Resend, which survives locally but gets frozen on
        // serverless the moment the response flushes — OTP mail silently
        // never sent.
        await sendOtpEmail({ email, otp, type });
      },
    }),
    anonymous(),
    siwe({
      domain: appHost(),
      // No email step: proving control of the address is the whole sign-in.
      // Better Auth still needs a unique email internally, and derives one
      // from the address plus this domain.
      anonymous: true,
      emailDomainName: appHost(),
      getNonce: async () => generateSiweNonce(),
      // Verified through the chain's own client rather than a plain ECDSA
      // recover, so smart-contract accounts (ERC-1271) work too — those can't
      // be checked off-chain at all.
      verifyMessage: async ({ message, signature, address }) =>
        arcPublicClient.verifyMessage({
          address: address as `0x${string}`,
          message,
          signature: signature as `0x${string}`,
        }),
    }),
    // Must stay last: lets server actions calling auth.api.* set cookies.
    nextCookies(),
  ],
});
