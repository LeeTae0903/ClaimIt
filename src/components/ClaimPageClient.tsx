"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { getWalletSdk } from "@/lib/circle/wallet-sdk";
import {
  ShieldCheck,
  Zap,
  Lock,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  ArrowRight,
  Shield,
} from "lucide-react";

type PublicLinkInfo =
  | { found: false }
  | {
      found: true;
      status: "claimable" | "claimed" | "expired" | "cancelled";
      amountMicros: string;
      hasPassword: boolean;
    };

function formatUsdc(amountMicros: string): string {
  return (Number(amountMicros) / 1_000_000).toFixed(2);
}

// The Circle PIN-setup widget loads a cross-origin iframe, which can be slow
// (cold start) or occasionally never load at all (blocked third-party
// storage — most common in Incognito/private windows, which restrict it by
// default). Priming it (getDeviceId) happens silently in the background here,
// before the user asked for it — so if it hangs, we don't want them stuck
// forever. Give it a few seconds; if it doesn't come back, just skip the
// proactive banner and fall back to the existing reactive flow (claim's own
// NO_WALLET redirect on submit).
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Timed out waiting for the wallet SDK.")), ms);
    }),
  ]);
}

export function ClaimPageClient({ token }: { token: string }) {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();

  const [info, setInfo] = useState<PublicLinkInfo | null>(null);
  const [password, setPassword] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ amountMicros: string; txHash: string | null } | null>(
    null,
  );

  // Proactive PIN setup: previously, someone claiming a link only found out
  // they needed a Circle wallet + PIN when the claim itself failed with
  // NO_WALLET, which bounced them to a separate /wallet/setup page. Now,
  // once they're signed in, we check /api/wallet/ensure right away and — if
  // the PIN isn't set up yet — show it inline, right here, before they ever
  // try to claim. By the time they hit "Claim", the wallet's already ready.
  const [walletReady, setWalletReady] = useState<boolean | null>(null);
  const [pinSetup, setPinSetup] = useState<{
    challengeId: string;
    userToken: string;
    encryptionKey: string;
    circleAppId: string;
  } | null>(null);
  const [pinSettingUp, setPinSettingUp] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/links/${token}`)
      .then((res) => res.json())
      .then(setInfo)
      .catch(() => setInfo({ found: false }));
  }, [token]);

  useEffect(() => {
    if (!session) {
      setWalletReady(null);
      setPinSetup(null);
      return;
    }
    let cancelled = false;
    fetch("/api/wallet/ensure", { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then(async (data) => {
        if (cancelled || !data) return;
        if (data.status === "ready") {
          setWalletReady(true);
        } else if (data.status === "pending-pin-setup") {
          try {
            const sdk = getWalletSdk(data.circleAppId);
            await withTimeout(sdk.getDeviceId(), 8000);
            if (cancelled) return;
            setPinSetup({
              challengeId: data.challengeId,
              userToken: data.userToken,
              encryptionKey: data.encryptionKey,
              circleAppId: data.circleAppId,
            });
            setWalletReady(false);
          } catch {
            // Couldn't prime the SDK here — don't block the claim form on
            // it, the NO_WALLET redirect on submit still catches this.
            setWalletReady(true);
          }
        } else {
          setWalletReady(true);
        }
      })
      .catch(() => {
        // Don't block claiming on this check failing — NO_WALLET on submit
        // remains the fallback either way.
        setWalletReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function setUpPin() {
    if (!pinSetup) return;
    setPinSettingUp(true);
    setPinError(null);
    try {
      const sdk = getWalletSdk(pinSetup.circleAppId);
      sdk.setAuthentication({
        userToken: pinSetup.userToken,
        encryptionKey: pinSetup.encryptionKey,
      });

      await new Promise<void>((resolve, reject) => {
        sdk.execute(pinSetup.challengeId, (err) => {
          if (err) reject(err instanceof Error ? err : new Error("PIN setup failed."));
          else resolve();
        });
      });

      const confirmRes = await fetch("/api/wallet/confirm", { method: "POST" });
      if (!confirmRes.ok) throw new Error("Couldn't finish setting up your wallet.");
      setPinSetup(null);
      setWalletReady(true);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Something went wrong setting up your PIN.");
    } finally {
      setPinSettingUp(false);
    }
  }

  async function handleClaim(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setClaiming(true);

    try {
      const res = await fetch(`/api/links/${token}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password || undefined }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === "NO_WALLET") {
          router.push(`/wallet/setup?redirect=/claim/${token}`);
          return;
        }
        throw new Error(data.error ?? "Couldn't claim this link.");
      }

      setResult({ amountMicros: data.amountMicros, txHash: data.txHash });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setClaiming(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-6 text-center rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Claimed {formatUsdc(result.amountMicros)} USDC
          </h1>
          <p className="text-xs text-zinc-400">
            Funds have been transferred directly into your wallet.
          </p>
        </div>

        {result.txHash && (
          <div className="pt-2">
            <a
              href={`https://testnet.arcscan.app/tx/${result.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
            >
              <span>View Transaction on ArcScan</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}

        <div className="pt-4 border-t border-zinc-800">
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all shadow-md active:scale-[0.98]"
          >
            <span>Go to Dashboard</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-12 text-center text-sm text-zinc-400 shadow-2xl backdrop-blur-xl">
        Checking link details...
      </div>
    );
  }

  if (!info.found) {
    return (
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-12 text-center space-y-4 shadow-2xl backdrop-blur-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-500">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-white">Payment Link Not Found</p>
          <p className="text-xs text-zinc-400">
            This payment link is invalid or may have been deleted.
          </p>
        </div>
      </div>
    );
  }

  if (info.status === "claimed") {
    return (
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-12 text-center space-y-4 shadow-2xl backdrop-blur-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-white">Link Already Claimed</p>
          <p className="text-xs text-zinc-400">
            This USDC payment link has already been claimed.
          </p>
        </div>
      </div>
    );
  }

  if (info.status === "expired") {
    return (
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-12 text-center space-y-4 shadow-2xl backdrop-blur-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-500">
          <Clock className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-white">Payment Link Expired</p>
          <p className="text-xs text-zinc-400">
            This payment link has passed its expiration time.
          </p>
        </div>
      </div>
    );
  }

  if (info.status === "cancelled") {
    return (
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-12 text-center space-y-4 shadow-2xl backdrop-blur-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-500">
          <XCircle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-white">Link Cancelled</p>
          <p className="text-xs text-zinc-400">
            This payment link was cancelled by the sender.
          </p>
        </div>
      </div>
    );
  }

  if (sessionPending) {
    return (
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-12 text-center text-sm text-zinc-400 shadow-2xl backdrop-blur-xl">
        Authenticating session...
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-8 shadow-2xl backdrop-blur-xl">
      {/* Header Info */}
      <div className="text-center space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          Circle Escrow Payment
        </span>
        <p className="text-xs text-zinc-400 pt-1">You&apos;ve been sent</p>
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-4xl font-extrabold text-white tracking-tight">
            {formatUsdc(info.amountMicros)}
          </span>
          <span className="text-lg font-bold text-blue-400">USDC</span>
        </div>
      </div>

      {/* Security Info */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-2 text-xs">
        <div className="flex justify-between text-zinc-400">
          <span>Claim Fee:</span>
          <span className="text-emerald-400 font-semibold">$0.00 (Gas Covered)</span>
        </div>
        <div className="flex justify-between text-zinc-400">
          <span>Escrow Custody:</span>
          <span className="text-zinc-200 font-medium">Circle Treasury</span>
        </div>
      </div>

      {!session ? (
        <button
          type="button"
          onClick={() => router.push(`/sign-in?redirect=/claim/${token}`)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all shadow-md active:scale-[0.98]"
        >
          <span>Sign In to Claim Funds</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : walletReady === null ? (
        <div className="py-4 text-center text-xs text-zinc-400">Checking your wallet...</div>
      ) : pinSetup ? (
        <div className="space-y-4 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/20 border border-blue-500/30 text-blue-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-white">Set up your security PIN</p>
            <p className="text-xs text-zinc-400">
              One quick step to activate your wallet, then your {formatUsdc(info.amountMicros)} USDC will be ready to claim.
            </p>
          </div>
          <button
            type="button"
            onClick={setUpPin}
            disabled={pinSettingUp}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>{pinSettingUp ? "Setting up…" : "Set Up PIN"}</span>
          </button>
          {pinError && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 text-left">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{pinError}</span>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleClaim} className="space-y-4">
          {info.hasPassword && (
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                <Lock className="h-3.5 w-3.5 text-zinc-500" />
                <span>Enter Password</span>
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password set by sender"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-zinc-600"
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={claiming}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            <Zap className="h-4 w-4" />
            <span>{claiming ? "Processing Payout…" : `Claim ${formatUsdc(info.amountMicros)} USDC`}</span>
          </button>
        </form>
      )}
    </div>
  );
}
