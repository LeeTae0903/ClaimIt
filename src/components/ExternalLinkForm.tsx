"use client";

import { FormEvent, useState, useSyncExternalStore } from "react";
import { ClaimLinkResult } from "@/components/ClaimLinkResult";
import {
  connectWallet,
  ensureArcChain,
  getUsdcBalanceMicros,
  hasInjectedWallet,
  sendUsdc,
} from "@/lib/wallet/connect";

type Prepared = {
  linkId: string;
  claimToken: string;
  treasuryAddress: string;
  amountMicros: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * The RPC this reads from can trail the wallet that broadcast the transfer, so
 * a 409 means "ask again", not "failed". The link row already exists either
 * way, so nothing is lost if the browser gives up first.
 */
async function confirmWithRetry(linkId: string, txHash: string) {
  for (let attempt = 1; attempt <= 8; attempt++) {
    const res = await fetch("/api/links/confirm-external", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId, txHash }),
    });
    if (res.ok) return;

    const data = await res.json().catch(() => ({}));
    if (data.retryable && attempt < 8) {
      await sleep(2500);
      continue;
    }
    throw new Error(data.error ?? "Couldn't confirm the deposit.");
  }
}

export function ExternalLinkForm() {
  // window.ethereum doesn't exist during SSR, so the server always renders
  // "no wallet" and hydration corrects it. useSyncExternalStore rather than an
  // effect: there's nothing to synchronise, just a value that differs between
  // server and client.
  const available = useSyncExternalStore(
    () => () => {},
    () => hasInjectedWallet(),
    () => true,
  );
  const [account, setAccount] = useState<string | null>(null);
  const [balanceMicros, setBalanceMicros] = useState<bigint | null>(null);

  const [amount, setAmount] = useState("");
  const [password, setPassword] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("");

  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);

  async function handleConnect() {
    setError(null);
    try {
      const address = await connectWallet();
      await ensureArcChain();
      setAccount(address);
      setBalanceMicros(await getUsdcBalanceMicros(address));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!account) return;
    setError(null);

    try {
      setStep("Creating the link…");
      const res = await fetch("/api/links/prepare-external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          password: password || undefined,
          expiresInHours: expiresInHours || undefined,
        }),
      });
      const prepared = await res.json();
      if (!res.ok) throw new Error(prepared.error ?? "Couldn't start this link.");

      const { linkId, claimToken, treasuryAddress, amountMicros } =
        prepared as Prepared;

      // Re-assert the network right before signing: the user may have switched
      // chains in the wallet since connecting.
      await ensureArcChain();

      setStep("Confirm the transfer in your wallet…");
      const txHash = await sendUsdc({
        from: account,
        to: treasuryAddress,
        amountMicros: BigInt(amountMicros),
      });

      setStep("Waiting for Arc to confirm…");
      await confirmWithRetry(linkId, txHash);

      setClaimUrl(`${window.location.origin}/claim/${claimToken}`);
      setBalanceMicros(await getUsdcBalanceMicros(account).catch(() => balanceMicros!));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStep(null);
    }
  }

  if (claimUrl) return <ClaimLinkResult claimUrl={claimUrl} />;

  if (!available) {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3.5 text-sm leading-relaxed text-muted">
        No wallet extension detected in this browser. Install MetaMask, Rabby or
        OKX Wallet, or switch to the built-in wallet above.
      </p>
    );
  }

  if (!account) {
    return (
      <div className="space-y-4">
        <div className="card space-y-2 p-5">
          <p className="text-sm leading-relaxed text-muted">
            Fund the link straight from your own wallet — no PIN, no second
            wallet to top up. claimIT never holds your keys; you sign one USDC
            transfer into escrow.
          </p>
          <p className="text-xs leading-relaxed text-faint">
            Arc Testnet will be added to your wallet if it isn&apos;t there yet.
            Some wallets label the balance &quot;ETH&quot; — on Arc the native
            token is USDC.
          </p>
        </div>
        {error && (
          <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
            {error}
          </p>
        )}
        <button type="button" onClick={handleConnect} className="btn btn-primary">
          Connect wallet
        </button>
      </div>
    );
  }

  const insufficient =
    balanceMicros !== null &&
    amount !== "" &&
    BigInt(Math.round(Number(amount) * 1_000_000) || 0) > balanceMicros;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
        <div>
          <span className="eyebrow">Connected</span>
          <p className="mt-1 font-mono text-xs text-muted">{shorten(account)}</p>
        </div>
        <div className="text-right">
          <span className="eyebrow">Balance</span>
          <p className="numeric mt-1 text-sm">
            {balanceMicros === null
              ? "…"
              : (Number(balanceMicros) / 1e6).toFixed(2)}{" "}
            <span className="text-xs text-faint">USDC</span>
          </p>
        </div>
      </div>

      <div>
        <label className="field-label">Amount</label>
        <div className="relative">
          <input
            type="number"
            min="0.1"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50.00"
            className="field numeric pr-20 text-2xl"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sm text-faint">
            USDC
          </span>
        </div>
        {insufficient && (
          <p className="mt-2 text-xs text-warn">
            That&apos;s more than this wallet holds.
          </p>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="field-label">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="None"
            className="field"
          />
        </div>
        <div>
          <label className="field-label">Expires in (hours)</label>
          <input
            type="number"
            min="1"
            value={expiresInHours}
            onChange={(e) => setExpiresInHours(e.target.value)}
            placeholder="Never"
            className="field numeric"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!!step || insufficient}
        className="btn btn-primary"
      >
        {step ?? "Escrow and create link"}
      </button>
    </form>
  );
}
