"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";
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
  const [address, setAddress] = useState("");
  const [prefilled, setPrefilled] = useState(false);
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

  // If the visitor happens to already have a wallet here, offer it rather
  // than making them go and copy their own address. Still editable — they may
  // want the money somewhere else entirely.
  useEffect(() => {
    fetch("/api/wallet")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const own = data?.wallets?.[0]?.address;
        if (own) {
          setAddress(own);
          setPrefilled(true);
        }
      })
      .catch(() => {});
  }, []);

  async function handleClaim(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setClaiming(true);

    try {
      const res = await fetch(`/api/links/${token}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toAddress: address.trim() || undefined,
          password: password || undefined,
        }),
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
      <div className="card overflow-hidden text-center">
        <div className="px-6 py-10">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok/12 text-ok">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
              <path
                d="m5 12.5 4.5 4.5L19 7.5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="mt-5 text-sm text-muted">Claimed</p>
          <p className="numeric mt-1 text-4xl font-semibold">
            {formatUsdc(result.amountMicros)}
            <span className="ml-2 text-lg font-normal text-muted">USDC</span>
          </p>
          <p className="mt-3 text-sm text-muted">
            It&apos;s in your wallet now. Open the account menu above to see
            the address.
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="btn btn-ghost mt-7"
          >
            View my activity
          </button>
        </div>
        {result.txHash && (
          <a
            href={`https://testnet.arcscan.app/tx/${result.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="block border-t border-line px-6 py-4 text-sm text-accent transition hover:bg-raised"
          >
            View on ArcScan ↗
          </a>
        )}
      </div>
    );
  }

  const trimmedAddress = address.trim();
  const addressValid = isAddress(trimmedAddress);
  // Only complain once they've typed something long enough to be a real
  // attempt — flagging "invalid" at the first character is just noise.
  const showAddressError = trimmedAddress.length >= 10 && !addressValid;

  if (!info || sessionPending) return <ClaimSkeleton />;

  if (!info.found) {
    return (
      <ClaimNotice
        title="This link doesn't exist"
        body="Double-check the address you were sent — claim links are single-use and can't be looked up."
      />
    );
  }
  if (info.status === "claimed") {
    return (
      <ClaimNotice
        title="Already claimed"
        body="Someone got here first. Each link can only ever be claimed once."
      />
    );
  }
  if (info.status === "expired") {
    return (
      <ClaimNotice
        title="This link has expired"
        body="The sender set an expiry that has passed. The funds went back to them, not to anyone else."
      />
    );
  }
  if (info.status === "cancelled") {
    return (
      <ClaimNotice
        title="This link was cancelled"
        body="The sender withdrew it before anyone claimed."
      />
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="eyebrow">Incoming</span>
        <span className="flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 font-mono text-[0.66rem] uppercase tracking-wider text-ok">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" />
          claimable
        </span>
      </div>

      <div className="px-5 py-10 text-center">
        <p className="text-sm text-muted">You&apos;ve been sent</p>
        <p className="numeric mt-2 text-5xl font-semibold">
          {formatUsdc(info.amountMicros)}
          <span className="ml-2 text-xl font-normal text-muted">USDC</span>
        </p>

        <form onSubmit={handleClaim} className="mt-8 space-y-4">
          <div className="text-left">
            <label className="field-label">Send it to</label>
            <input
              type="text"
              required
              spellCheck={false}
              autoComplete="off"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setPrefilled(false);
              }}
              placeholder="0x… your wallet address on Arc"
              className="field font-mono text-sm"
            />
            <p
              className={`mt-2 text-xs leading-relaxed ${
                showAddressError ? "text-bad" : "text-faint"
              }`}
            >
              {showAddressError
                ? "That isn't a valid address. Check every character — a payout can't be undone."
                : prefilled
                  ? "This is your wallet. Change it if you want the money elsewhere."
                  : "Double-check it. The transfer is final and goes wherever this points."}
            </p>
          </div>

          {info.hasPassword && (
            <div className="text-left">
              <label className="field-label">Password required</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter the sender's password"
                className="field"
              />
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={claiming || !addressValid}
            className="btn btn-primary"
          >
            {claiming ? "Claiming…" : `Claim ${formatUsdc(info.amountMicros)} USDC`}
          </button>

          {!session && (
            <button
              type="button"
              onClick={() => router.push(`/sign-in?redirect=/claim/${token}`)}
              className="btn-quiet"
            >
              I don&apos;t have a wallet — create one for me
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

/** Terminal states all look the same: no amount shown, nothing to act on. */
function ClaimNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="card px-6 py-12 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-line bg-raised text-faint">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
          <path
            d="M12 8v5m0 3.5h.01M12 3l9 16H3l9-16Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="mt-5 text-lg font-medium tracking-tight">{title}</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">
        {body}
      </p>
    </div>
  );
}

function ClaimSkeleton() {
  return (
    <div className="card animate-pulse px-5 py-14">
      <div className="mx-auto h-3 w-28 rounded bg-line" />
      <div className="mx-auto mt-5 h-11 w-48 rounded-lg bg-line" />
      <div className="mt-9 h-12 w-full rounded-xl bg-line" />
    </div>
  );
}
