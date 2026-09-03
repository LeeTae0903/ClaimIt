"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Lock,
  Clock,
  Copy,
  Check,
  AlertCircle,
  ShieldCheck,
  Wallet,
  Gift,
} from "lucide-react";
import {
  getConnectedAccount,
  connectWallet,
  ensureArcChain,
  getUsdcBalanceMicros,
  sendUsdc,
  NoWalletExtensionError,
  WalletRejectedError,
} from "@/lib/wallet/connect";

type PrepareResponse = {
  linkId: string;
  treasuryAddress: string;
  amountMicros: string;
  claimToken: string;
  password: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function confirmWithRetry(
  linkId: string,
  txHash: string,
  maxAttempts = 5,
  delayMs = 4000,
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch("/api/links/confirm-external", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId, txHash }),
    });
    if (res.ok) return res.json();

    const data = await res.json().catch(() => ({}));
    if (data.retryable && attempt < maxAttempts) {
      await sleep(delayMs);
      continue;
    }
    throw new Error(data.error ?? "Couldn't confirm the deposit.");
  }
  throw new Error("Couldn't confirm the deposit.");
}

function formatUsdc(amountMicros: bigint | string): string {
  return (Number(amountMicros) / 1_000_000).toFixed(2);
}

function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function ExternalLinkForm({ onSuccess }: { onSuccess?: () => void }) {
  const [account, setAccount] = useState<string | null>(null);
  const [balanceMicros, setBalanceMicros] = useState<bigint | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [amount, setAmount] = useState("10");
  const [withPassword, setWithPassword] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ claimUrl: string; password: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getConnectedAccount().then((addr) => setAccount(addr));
  }, []);

  useEffect(() => {
    if (!account) {
      setBalanceMicros(null);
      return;
    }
    getUsdcBalanceMicros(account)
      .then(setBalanceMicros)
      .catch(() => setBalanceMicros(null));
  }, [account]);

  async function handleConnect() {
    setError(null);
    setConnecting(true);
    try {
      const addr = await connectWallet();
      await ensureArcChain();
      setAccount(addr);
    } catch (err) {
      if (err instanceof NoWalletExtensionError || err instanceof WalletRejectedError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Couldn't connect your wallet.");
      }
    } finally {
      setConnecting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!account) {
      setError("Connect your wallet first.");
      return;
    }

    setLoading(true);
    try {
      const prepareRes = await fetch("/api/links/prepare-external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          withPassword,
          expiresInHours: expiresInHours || undefined,
        }),
      });
      const prepareData = (await prepareRes.json()) as PrepareResponse & { error?: string };
      if (!prepareRes.ok) {
        throw new Error(prepareData.error ?? "Couldn't create the link.");
      }

      const { linkId, treasuryAddress, amountMicros, claimToken, password } = prepareData;

      if (balanceMicros !== null && BigInt(amountMicros) > balanceMicros) {
        throw new Error(
          `Insufficient USDC balance. You have ${formatUsdc(balanceMicros)} USDC, this link needs ${formatUsdc(amountMicros)} USDC.`,
        );
      }

      await ensureArcChain();
      const txHash = await sendUsdc({
        from: account,
        to: treasuryAddress,
        amountMicros: BigInt(amountMicros),
      });

      await confirmWithRetry(linkId, txHash);

      setResult({
        claimUrl: `${window.location.origin}/claim/${claimToken}`,
        password,
      });
      getUsdcBalanceMicros(account).then(setBalanceMicros).catch(() => {});
      onSuccess?.();
    } catch (err) {
      if (err instanceof NoWalletExtensionError || err instanceof WalletRejectedError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!result) return;
    const text = result.password ? `${result.claimUrl}  (password: ${result.password})` : result.claimUrl;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (result) {
    return (
      <div className="space-y-5">
        <div className="text-center space-y-1">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Check className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-white">Loot link is live!</h2>
          <p className="text-xs text-zinc-400">Funded straight from your wallet. Share it below.</p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 flex items-center justify-between gap-3">
          <span className="truncate font-mono text-xs text-zinc-200 select-all">{result.claimUrl}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>

        {result.password && (
          <p className="text-xs text-zinc-400">
            Password:{" "}
            <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-200">
              {result.password}
            </span>
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setResult(null);
            setAmount("10");
            setWithPassword(false);
            setExpiresInHours("");
          }}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
        >
          Create Another
        </button>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-center space-y-3">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Wallet className="h-5 w-5" />
          </div>
          <p className="text-sm text-zinc-300">
            Connect the wallet you want to fund this link from — no new wallet is created.
          </p>
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 text-left">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            <Wallet className="h-4 w-4" />
            <span>{connecting ? "Connecting…" : "Connect Wallet"}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
          <Wallet className="h-3.5 w-3.5 text-blue-400" />
          {shortenAddress(account)}
        </span>
        <span className="text-xs font-semibold text-zinc-300">
          {balanceMicros === null ? "—" : `${formatUsdc(balanceMicros)} USDC`}
        </span>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Amount (USDC)
        </label>
        <div className="relative">
          <div className="absolute left-4 top-3.5 text-lg font-bold text-blue-400">$</div>
          <input
            type="number"
            min="0.1"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10.00"
            className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/80 pl-9 pr-16 py-3.5 text-xl font-bold text-white outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <div className="absolute right-4 top-4 text-xs font-semibold text-zinc-400">USDC</div>
        </div>
      </div>

      <label className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 cursor-pointer">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Lock className="h-3.5 w-3.5 text-zinc-500" />
          Generate a password
        </span>
        <input
          type="checkbox"
          checked={withPassword}
          onChange={(e) => setWithPassword(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-blue-500"
        />
      </label>

      <div className="space-y-2">
        <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-zinc-500" />
            Link Expiration
          </span>
          <span className="text-[10px] text-zinc-500 font-normal">Optional</span>
        </label>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "1 Hour", value: "1" },
            { label: "24 Hours", value: "24" },
            { label: "7 Days", value: "168" },
            { label: "Never", value: "" },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setExpiresInHours(item.value)}
              className={`rounded-lg border py-2 text-xs font-medium transition ${
                expiresInHours === item.value
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !amount || Number(amount) <= 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50 shadow-md"
      >
        {loading ? <ShieldCheck className="h-4 w-4" /> : <Gift className="h-4 w-4" />}
        <span>{loading ? "Confirming Transfer…" : "Send USDC & Create Link"}</span>
      </button>
    </form>
  );
}
