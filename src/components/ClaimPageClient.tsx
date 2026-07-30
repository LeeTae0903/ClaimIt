"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

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
      <div className="space-y-4 text-center">
        <p className="text-2xl font-semibold tracking-tight">
          Claimed {formatUsdc(result.amountMicros)} USDC
        </p>
        <p className="text-sm text-black/60 dark:text-white/60">
          It&apos;s in your wallet now.
        </p>
        {result.txHash && (
          <a
            href={`https://testnet.arcscan.app/tx/${result.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm text-black/50 underline-offset-4 hover:underline dark:text-white/50"
          >
            View on ArcScan
          </a>
        )}
      </div>
    );
  }

  if (!info) {
    return <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>;
  }

  if (!info.found) {
    return <p className="text-sm text-black/60 dark:text-white/60">This link doesn&apos;t exist.</p>;
  }

  if (info.status === "claimed") {
    return <p className="text-sm text-black/60 dark:text-white/60">This link has already been claimed.</p>;
  }
  if (info.status === "expired") {
    return <p className="text-sm text-black/60 dark:text-white/60">This link has expired.</p>;
  }
  if (info.status === "cancelled") {
    return <p className="text-sm text-black/60 dark:text-white/60">This link was cancelled.</p>;
  }

  if (sessionPending) {
    return <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>;
  }

  return (
    <div className="space-y-6 text-center">
      <div className="space-y-1">
        <p className="text-sm text-black/60 dark:text-white/60">You&apos;ve been sent</p>
        <p className="text-3xl font-semibold tracking-tight">
          {formatUsdc(info.amountMicros)} USDC
        </p>
      </div>

      {!session ? (
        <button
          type="button"
          onClick={() => router.push(`/sign-in?redirect=/claim/${token}`)}
          className="w-full rounded-xl bg-black px-4 py-3.5 text-base font-medium text-white transition active:scale-[0.98] dark:bg-white dark:text-black"
        >
          Sign in to claim
        </button>
      ) : (
        <form onSubmit={handleClaim} className="space-y-3 text-left">
          {info.hasPassword && (
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3.5 text-base outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
            />
          )}
          {error && (
            <p className="text-center text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={claiming}
            className="w-full rounded-xl bg-black px-4 py-3.5 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {claiming ? "Claiming…" : `Claim ${formatUsdc(info.amountMicros)} USDC`}
          </button>
        </form>
      )}
    </div>
  );
}
