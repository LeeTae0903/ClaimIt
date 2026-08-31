"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
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

  useEffect(() => {
    fetch(`/api/links/${token}`)
      .then((res) => res.json())
      .then(setInfo)
      .catch(() => setInfo({ found: false }));
  }, [token]);

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
