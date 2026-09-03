import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { anonymous, emailOTP, siwe } from "better-auth/plugins";
import { generateSiweNonce } from "viem/siwe";
import { importPKCS8, SignJWT } from "jose";
import { db } from "@/lib/db";
import { sendOtpEmail } from "@/lib/email";
import { arcPublicClient } from "@/lib/chain/arc";

const APPLE_ENV_VARS = [
  "APPLE_CLIENT_ID",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
] as const;

function appleConfigured() {
  return APPLE_ENV_VARS.every((name) => !!process.env[name]);
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

const getBaseURL = () => {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
};

/**
 * The host a SIWE message must name.
 *
 * The browser signs a message containing `window.location.host`, and the
 * plugin rejects the signature unless it matches this exactly — so this has
 * to be the host people actually browse, not whatever BETTER_AUTH_URL
 * happens to say when it's unset. Derived from the same getBaseURL() the
 * rest of auth already trusts, so there's only one source of truth for it.
 */
function appHost(): string {
  try {
    return new URL(getBaseURL()).host;
  } catch {
    return "localhost:3000";
  }
}

export const auth = betterAuth({
  baseURL: getBaseURL(),
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
  // Required for Sign In with Apple's redirect flow to be trusted.
  trustedOrigins: ["https://appleid.apple.com"],
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        void sendOtpEmail({ email, otp, type });
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
      // recover, so smart-contract accounts (ERC-1271) work too — those
      // can't be checked off-chain at all.
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
