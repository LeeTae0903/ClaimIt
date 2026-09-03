"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { signInWithWallet } from "@/lib/wallet/connect";
import { SocialSignInButton } from "@/components/SocialSignInButton";
import {
  Gift,
  Mail,
  ArrowRight,
  Sparkles,
  AlertCircle,
  KeyRound,
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

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-zinc-100" aria-hidden="true">
      <path d="M16.36 1.4c0 1.14-.42 2.2-1.24 3.06-.85.9-2.13 1.6-3.24 1.5-.13-1.1.44-2.24 1.22-3.02.83-.86 2.28-1.5 3.26-1.54zM20.5 17.1c-.5 1.15-1.1 2.24-2 3.24-.9 1-1.79 1.99-3.2 2.01-1.36.03-1.8-.83-3.36-.83-1.55 0-2.05.8-3.34.86-1.36.05-2.4-1.08-3.31-2.08-1.85-2.05-3.28-5.79-1.37-8.32.94-1.26 2.6-2.06 4.4-2.09 1.32-.02 2.57.9 3.37.9.8 0 2.32-1.11 3.9-.95.66.03 2.53.27 3.73 2.02-.1.06-2.22 1.3-2.2 3.87.03 3.07 2.7 4.1 2.73 4.11-.02.06-.42 1.46-1.35 2.26z" />
    </svg>
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
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

  async function withApple() {
    setError(null);
    setLoading("apple");
    const { error } = await authClient.signIn.social({
      provider: "apple",
      callbackURL: redirectTo,
    });
    if (error) setError(error.message ?? "Apple sign-in failed.");
    setLoading(null);
  }

  async function withWallet() {
    setError(null);
    setLoading("wallet");
    try {
      await signInWithWallet();
      router.push(redirectTo);
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
    router.push(redirectTo);
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading("send-otp");
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });
    setLoading(null);
    if (error) {
      setError(error.message ?? "Couldn't send code.");
      return;
    }
    setStep("otp");
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading("verify-otp");
    const { error } = await authClient.signIn.emailOtp({ email, otp });
    setLoading(null);
    if (error) {
      setError(error.message ?? "Invalid or expired code.");
      return;
    }
    router.push(redirectTo);
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
            onClick={withApple}
            disabled={loading !== null}
            icon={<AppleIcon />}
            label="Continue with Apple"
          />
          <SocialSignInButton
            onClick={withWallet}
            disabled={loading !== null}
            icon={<Wallet className="h-5 w-5 text-blue-400" />}
            label={loading === "wallet" ? "Confirm in your wallet…" : "Continue with wallet"}
          />
        </div>

        <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-zinc-600">
          <div className="h-px flex-1 bg-zinc-800" />
          <span>or email</span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        {step === "email" ? (
          <form onSubmit={sendCode} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 h-5 w-5 text-zinc-500" />
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 pl-11 pr-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-zinc-600"
              />
            </div>
            <button
              type="submit"
              disabled={loading !== null}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50 shadow-md"
            >
              <span>{loading === "send-otp" ? "Sending OTP Code…" : "Continue with Email OTP"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-blue-400 flex-shrink-0" />
              <span>Code sent to <strong className="text-zinc-200 font-semibold">{email}</strong></span>
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3.5 text-center text-xl font-mono tracking-[0.3em] text-zinc-100 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading !== null}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50 shadow-md"
            >
              <span>{loading === "verify-otp" ? "Verifying Code…" : "Verify & Sign In"}</span>
            </button>
            <button
              type="button"
              onClick={() => setStep("email")}
              className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Use a different email address
            </button>
          </form>
        )}

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
