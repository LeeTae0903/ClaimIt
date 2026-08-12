"use client";

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import {
  connectWallet,
  ensureArcChain,
  getConnectedAccount,
  hasInjectedWallet,
} from "@/lib/wallet/connect";

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

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Where a claim is heading, and how we came to know it. */
type Destination = {
  address: string;
  kind: "signed-in" | "built-in" | "connected";
};

const DESTINATION_LABEL: Record<Destination["kind"], string> = {
  "signed-in": "the wallet you signed in with",
  "built-in": "your built-in wallet",
  connected: "your connected wallet",
};

export function ClaimPageClient({ token }: { token: string }) {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();

  const [info, setInfo] = useState<PublicLinkInfo | null>(null);
  // A wallet we already know about: signed in with, provisioned here, or
  // already authorised in this browser. With one of these the claim is a
  // single press; without one, connecting is the press.
  const [known, setKnown] = useState<Destination | null>(null);
  const [password, setPassword] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedChain, setAddedChain] = useState(false);
  const [result, setResult] = useState<{
    amountMicros: string;
    txHash: string | null;
    toAddress: string;
  } | null>(null);

  const walletAvailable = useSyncExternalStore(
    () => () => {},
    () => hasInjectedWallet(),
    () => true,
  );

  useEffect(() => {
    fetch(`/api/links/${token}`)
      .then((res) => res.json())
      .then(setInfo)
      .catch(() => setInfo({ found: false }));
  }, [token]);

  // Find a wallet without asking. The account's own wallets come from the
  // session; a browser extension already authorised for this site answers
  // eth_accounts without prompting. Only if both come up empty does the
  // visitor have to do anything at all.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/wallet").catch(() => null);
      const data = res?.ok ? await res.json() : null;
      if (cancelled) return;

      const signedInWith = data?.walletAddresses?.[0]?.address;
      if (signedInWith) {
        setKnown({ address: signedInWith, kind: "signed-in" });
        return;
      }
      const builtIn = data?.wallets?.[0]?.address;
      if (builtIn) {
        setKnown({ address: builtIn, kind: "built-in" });
        return;
      }
      const already = await getConnectedAccount();
      if (!cancelled && already) {
        setKnown({ address: already, kind: "connected" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function claimTo(toAddress: string) {
    const res = await fetch(`/api/links/${token}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toAddress, password: password || undefined }),
    });
    const data = await res.json();

    if (!res.ok) {
      if (data.code === "NO_WALLET") {
        router.push(`/wallet/setup?redirect=/claim/${token}`);
        return;
      }
      throw new Error(data.error ?? "Couldn't claim this link.");
    }
    setResult({
      amountMicros: data.amountMicros,
      txHash: data.txHash,
      toAddress: data.toAddress ?? toAddress,
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!destination) return;
    setError(null);
    setClaiming(true);
    try {
      await claimTo(destination.address);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setClaiming(false);
    }
  }

  /** Connect and claim in one press — the wallet prompt is the only step. */
  async function handleConnectAndClaim(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setClaiming(true);
    try {
      const address = await connectWallet();
      setKnown({ address, kind: "connected" });
      await claimTo(address);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect.");
    } finally {
      setClaiming(false);
    }
  }

  async function addArcToWallet() {
    try {
      await ensureArcChain();
      setAddedChain(true);
    } catch {
      /* Declining is fine — the USDC has already arrived either way. */
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
            Sent to{" "}
            <span className="font-mono text-ink">
              {shorten(result.toAddress)}
            </span>
            .
          </p>
          {walletAvailable && !addedChain && (
            <button
              type="button"
              onClick={addArcToWallet}
              className="btn btn-ghost mt-7"
            >
              Add Arc Testnet to see it in your wallet
            </button>
          )}
          {addedChain && (
            <p className="mt-7 text-xs text-faint">
              Arc Testnet added — the USDC shows up under that network.
            </p>
          )}
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="btn btn-ghost mt-3"
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

  // A claim always goes to a wallet the visitor controls right now — one on
  // their account, or one they connect here. Pasting an address was removed
  // deliberately: it is the only way to send an irreversible payout to a
  // typo, and every recipient who has a wallet can just connect it.
  const destination = known;

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

        <form
          onSubmit={destination ? handleSubmit : handleConnectAndClaim}
          className="mt-8 space-y-4"
        >
          {destination ? (
            <div className="rounded-xl border border-line bg-surface px-4 py-3 text-left">
              <span className="eyebrow">Goes to</span>
              <p className="mt-1.5 font-mono text-sm text-ink">
                {shorten(destination.address)}
              </p>
              <p className="mt-1 text-xs text-faint">
                {DESTINATION_LABEL[destination.kind]}
              </p>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted">
              Connect your wallet and the USDC goes straight into it. Nothing to
              copy, nothing to type.
            </p>
          )}

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
            disabled={claiming || (!destination && !walletAvailable)}
            className="btn btn-primary"
          >
            {claiming
              ? destination
                ? "Claiming…"
                : "Check your wallet…"
              : destination
                ? `Claim ${formatUsdc(info.amountMicros)} USDC`
                : "Connect wallet & claim"}
          </button>

          {!destination && !walletAvailable && (
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-xs leading-relaxed text-faint">
              No wallet extension found in this browser. Install MetaMask, Rabby
              or OKX Wallet — or have one created for you below.
            </p>
          )}

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
