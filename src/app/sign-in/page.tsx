"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { SocialSignInButton } from "@/components/SocialSignInButton";

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
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 fill-black dark:fill-white"
      aria-hidden="true"
    >
      <path d="M16.36 1.4c0 1.14-.42 2.2-1.24 3.06-.85.9-2.13 1.6-3.24 1.5-.13-1.1.44-2.24 1.22-3.02.83-.86 2.28-1.5 3.26-1.54zM20.5 17.1c-.5 1.15-1.1 2.24-2 3.24-.9 1-1.79 1.99-3.2 2.01-1.36.03-1.8-.83-3.36-.83-1.55 0-2.05.8-3.34.86-1.36.05-2.4-1.08-3.31-2.08-1.85-2.05-3.28-5.79-1.37-8.32.94-1.26 2.6-2.06 4.4-2.09 1.32-.02 2.57.9 3.37.9.8 0 2.32-1.11 3.9-.95.66.03 2.53.27 3.73 2.02-.1.06-2.22 1.3-2.2 3.87.03 3.07 2.7 4.1 2.73 4.11-.02.06-.42 1.46-1.35 2.26z" />
    </svg>
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";

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

  async function asGuest() {
    setError(null);
    setLoading("guest");
    const { error } = await authClient.signIn.anonymous();
    if (error) {
      setError(error.message ?? "Couldn't continue as guest.");
      setLoading(null);
      return;
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
    <div className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm space-y-8">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">claimIT</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Sign in to send or claim USDC.
          </p>
        </div>

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
        </div>

        <div className="flex items-center gap-3 text-xs text-black/40 dark:text-white/40">
          <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          or
          <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
        </div>

        {step === "email" ? (
          <form onSubmit={sendCode} className="space-y-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3.5 text-base outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
            />
            <button
              type="submit"
              disabled={loading !== null}
              className="w-full rounded-xl bg-black px-4 py-3.5 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {loading === "send-otp" ? "Sending code…" : "Continue with email"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-3">
            <p className="text-sm text-black/60 dark:text-white/60">
              Enter the code sent to <span className="font-medium">{email}</span>
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3.5 text-center text-lg tracking-[0.3em] outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
            />
            <button
              type="submit"
              disabled={loading !== null}
              className="w-full rounded-xl bg-black px-4 py-3.5 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {loading === "verify-otp" ? "Verifying…" : "Verify code"}
            </button>
            <button
              type="button"
              onClick={() => setStep("email")}
              className="w-full text-center text-sm text-black/50 dark:text-white/50"
            >
              Use a different email
            </button>
          </form>
        )}

        {error && (
          <p className="text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={asGuest}
          disabled={loading !== null}
          className="w-full text-center text-sm text-black/50 underline-offset-4 hover:underline disabled:opacity-50 dark:text-white/50"
        >
          {loading === "guest" ? "Continuing…" : "Continue as guest"}
        </button>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
