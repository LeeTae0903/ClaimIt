"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { getWalletSdk } from "@/lib/circle/wallet-sdk";
import {
  Lock,
  Clock,
  Copy,
  Check,
  AlertCircle,
  ShieldCheck,
  Layers,
  KeyRound,
} from "lucide-react";

type PrepareResponse = {
  batchId: string;
  challengeId: string;
  userToken: string;
  encryptionKey: string;
  links: { linkId: string; amountMicros: string; claimToken: string; password: string | null }[];
  circleAppId: string;
};

type GiveawayLink = {
  linkId: string;
  amountMicros: string;
  claimUrl: string;
  password: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function confirmBatchWithRetry(
  batchId: string,
  maxAttempts = 3,
  delayMs = 3000,
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch("/api/batches/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId }),
    });
    if (res.ok) return;

    const data = await res.json().catch(() => ({}));
    if (data.retryable && attempt < maxAttempts) {
      await sleep(delayMs);
      continue;
    }
    throw new Error(data.error ?? "Couldn't confirm the deposit.");
  }
}

function formatUsdc(amountMicros: string): string {
  return (Number(amountMicros) / 1_000_000).toFixed(2);
}

export function CreateGiveawayForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState("50");
  const [linkCount, setLinkCount] = useState("10");
  const [withPasswords, setWithPasswords] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<GiveawayLink[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const countPresets = ["5", "10", "25", "50"];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const prepareRes = await fetch("/api/batches/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          linkCount,
          withPasswords,
          expiresInHours: expiresInHours || undefined,
        }),
      });
      const prepareData = await prepareRes.json();

      if (!prepareRes.ok) {
        if (prepareData.code === "NO_WALLET") {
          router.push("/wallet/setup?redirect=/dashboard");
          return;
        }
        throw new Error(prepareData.error ?? "Couldn't create the giveaway.");
      }

      const { batchId, challengeId, userToken, encryptionKey, links: createdLinks, circleAppId } =
        prepareData as PrepareResponse;

      const sdk = getWalletSdk(circleAppId);
      await sdk.getDeviceId();
      sdk.setAuthentication({ userToken, encryptionKey });

      await new Promise<void>((resolve, reject) => {
        sdk.execute(challengeId, (err) => {
          if (err) reject(err instanceof Error ? err : new Error("Transfer authorization failed."));
          else resolve();
        });
      });

      await confirmBatchWithRetry(batchId);

      setLinks(
        createdLinks.map((l) => ({
          linkId: l.linkId,
          amountMicros: l.amountMicros,
          claimUrl: `${window.location.origin}/claim/${l.claimToken}`,
          password: l.password,
        })),
      );
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(link: GiveawayLink) {
    const text = link.password ? `${link.claimUrl}  (password: ${link.password})` : link.claimUrl;
    navigator.clipboard.writeText(text);
    setCopiedId(link.linkId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleCopyAll() {
    if (!links) return;
    const text = links
      .map((l) => (l.password ? `${l.claimUrl}  (password: ${l.password})` : l.claimUrl))
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopiedId("all");
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (links) {
    return (
      <div className="space-y-5">
        <div className="text-center space-y-1">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Check className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-white">Giveaway is live!</h2>
          <p className="text-xs text-zinc-400">
            {links.length} links,{" "}
            {formatUsdc(links.reduce((sum, l) => sum + BigInt(l.amountMicros), 0n).toString())} USDC
            total. Passwords are shown once — copy them now.
          </p>
        </div>

        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {links.map((link, i) => (
            <div
              key={link.linkId}
              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-white">#{i + 1}</span>
                  <span className="text-blue-400 font-semibold">{formatUsdc(link.amountMicros)} USDC</span>
                  {link.password && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                      <KeyRound className="h-2.5 w-2.5" />
                      {link.password}
                    </span>
                  )}
                </div>
                <p className="truncate font-mono text-[11px] text-zinc-500">{link.claimUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(link)}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 transition-colors"
              >
                {copiedId === link.linkId ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            type="button"
            onClick={handleCopyAll}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all shadow-md active:scale-[0.98]"
          >
            {copiedId === "all" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span>Copy All Links</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLinks(null);
              setAmount("50");
              setLinkCount("10");
              setWithPasswords(false);
              setExpiresInHours("");
            }}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <span>Create Another</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Total amount */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Total Amount (USDC)
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
            placeholder="50.00"
            className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/80 pl-9 pr-16 py-3.5 text-xl font-bold text-white outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <div className="absolute right-4 top-4 text-xs font-semibold text-zinc-400">USDC</div>
        </div>
      </div>

      {/* Number of links */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Number of Links
        </label>
        <input
          type="number"
          min="1"
          max="100"
          step="1"
          required
          value={linkCount}
          onChange={(e) => setLinkCount(e.target.value)}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <div className="flex gap-2 pt-1">
          {countPresets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setLinkCount(preset)}
              className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition ${
                linkCount === preset
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
        {Number(amount) > 0 && Number(linkCount) > 0 && (
          <p className="text-[11px] text-zinc-500">
            ≈ {(Number(amount) / Number(linkCount)).toFixed(2)} USDC per link
          </p>
        )}
      </div>

      {/* Password toggle */}
      <label className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 cursor-pointer">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Lock className="h-3.5 w-3.5 text-zinc-500" />
          Generate a password per link
        </span>
        <input
          type="checkbox"
          checked={withPasswords}
          onChange={(e) => setWithPasswords(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-blue-500"
        />
      </label>

      {/* Expiration */}
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
        disabled={loading || !amount || Number(amount) <= 0 || !linkCount || Number(linkCount) <= 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50 shadow-md"
      >
        {loading ? <ShieldCheck className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
        <span>{loading ? "Authorizing Escrow Deposit…" : "Deposit & Create Giveaway"}</span>
      </button>
    </form>
  );
}
