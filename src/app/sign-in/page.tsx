"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { signInWithWallet } from "@/lib/wallet/connect";
import { SocialSignInButton } from "@/components/SocialSignInButton";
import {
  Gift,
  Sparkles,
  AlertCircle,
  ArrowLeft,
  Wallet,
} from "lucide-react";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.12-1.43.34-2.09V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function withGoogle() {
    setError(null);
    setLoading("google");
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: redirectTo,
    });
    if (error) setError(error.message ?? "Google sign-in failed.");
    setLoading(null);
  }

  async function withWallet() {
    setError(null);
    setLoading("wallet");
    try {
      await signInWithWallet();
      window.location.href = redirectTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet sign-in failed.");
    } finally {
      setLoading(null);
    }
  }

  async function asGuest() {
    setError(null);
    setLoading("guest");
    const { error } = await authClient.signIn.anonymous();
    if (error) {
      // Every visitor is silently handed a working anonymous session on
      // their very first request (see middleware) so the rest of the app
      // always has someone to act as — by the time this button is
      // clickable, that session already exists. Better Auth's anonymous
      // plugin then refuses a second one with this specific code. That's
      // not a failure from the user's point of view: they already have a
      // working guest session, so just continue instead of showing an
      // error they can't do anything about.
      if (error.code !== "ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY") {
        setError(error.message ?? "Couldn't continue as guest.");
        setLoading(null);
        return;
      }
    }
    window.location.href = redirectTo;
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto w-full max-w-sm space-y-8 rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-8 shadow-2xl backdrop-blur-xl">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-2">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs font-medium">Back to Home</span>
          </Link>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-400">
            <Gift className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Sign in to LootClaim</h1>
          <p className="text-xs text-zinc-400">
            Send, escrow, and claim USDC Loot instantly on Arc.
          </p>
        </div>

        {/* Social Sign-in Options */}
        <div className="space-y-3">
          <SocialSignInButton
            onClick={withGoogle}
            disabled={loading !== null}
            icon={<GoogleIcon />}
            label="Continue with Google"
          />
          <SocialSignInButton
            onClick={withWallet}
            disabled={loading !== null}
            icon={<Wallet className="h-5 w-5 text-blue-400" />}
            label={loading === "wallet" ? "Confirm in your wallet…" : "Continue with wallet"}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Guest Access Divider */}
        <div className="pt-2 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={asGuest}
            disabled={loading !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white active:scale-[0.98] disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4 text-blue-400" />
            <span>{loading === "guest" ? "Creating Guest Session…" : "Instant Access as Guest"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400 text-sm">
        Loading sign-in...
      </div>
    }>
      <SignInForm />
    </Suspense>
  );
}
