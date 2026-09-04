"use client";

import { FormEvent, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { getWalletSdk } from "@/lib/circle/wallet-sdk";
import {
  Lock,
  Clock,
  Copy,
  Check,
  AlertCircle,
  Share2,
  ShieldCheck,
  Gift,
  KeyRound,
  Sparkles,
} from "lucide-react";

type PrepareResponse = {
  linkId: string;
  challengeId: string;
  userToken: string;
  encryptionKey: string;
  claimToken: string;
  // Only set when the sender asked us to generate one — a password they
  // typed themselves is never echoed back, since they already know it.
  generatedPassword: string | null;
  circleAppId: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function confirmDepositWithRetry(
  linkId: string,
  maxAttempts = 3,
  delayMs = 3000,
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch("/api/links/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId }),
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

export function CreateLinkForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState("10");
  const [password, setPassword] = useState("");
  const [generatePassword, setGeneratePassword] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const presets = ["5", "10", "25", "50", "100"];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const prepareRes = await fetch("/api/links/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          password: password || undefined,
          withPassword: generatePassword,
          expiresInHours: expiresInHours || undefined,
        }),
      });
      const prepareData = await prepareRes.json();

      if (!prepareRes.ok) {
        if (prepareData.code === "NO_WALLET") {
          router.push("/wallet/setup?redirect=/dashboard");
          return;
        }
        throw new Error(prepareData.error ?? "Couldn't create Loot link.");
      }

      const { linkId, challengeId, userToken, encryptionKey, claimToken, generatedPassword, circleAppId } =
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

      // The deposit is authorized and already moved on-chain at this point
      // — show the claim link and password right away. Don't gate this on
      // confirmDepositWithRetry below: that call is just bookkeeping (marks
      // our DB row ACTIVE) and can be slow or time out on Circle's own
      // indexing lag without the transfer having failed at all. Previously
      // this reveal only happened after confirm succeeded, so a slow/failed
      // confirm meant the user never saw their link OR their generated
      // password — and since the password is only ever returned once here
      // (only its hash is persisted), that made it permanently unrecoverable
      // even though their money had already moved and the link worked fine
      // once the background reconciliation job caught up.
      setClaimUrl(`${window.location.origin}/claim/${claimToken}`);
      setRevealedPassword(generatedPassword ?? (password || null));
      onSuccess?.();

      confirmDepositWithRetry(linkId).catch((err) => {
        // Best-effort from here — the reconciliation job (or the next
        // confirm attempt when the user revisits) still catches this.
        console.error("[CreateLinkForm] confirm deposit failed, reconciliation job will retry:", err);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!claimUrl) return;
    // Just the URL — pasting "<url> (password: ...)" somewhere doesn't
    // navigate anywhere. The password has its own copy button right below,
    // shown only when one exists.
    navigator.clipboard.writeText(claimUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCopyPassword() {
    if (!revealedPassword) return;
    navigator.clipboard.writeText(revealedPassword);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  }

  if (claimUrl) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <Check className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white">Loot Link Ready!</h2>
          <p className="text-xs text-zinc-400">
            Share this URL or QR code with your recipient.
          </p>
        </div>

        {/* QR Code Card */}
        <div className="mx-auto flex justify-center rounded-2xl bg-white p-6 shadow-inner w-max">
          <QRCodeSVG value={claimUrl} size={180} />
        </div>

        {/* URL Box */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 flex items-center justify-between gap-3">
          <span className="truncate font-mono text-xs text-zinc-300 select-all">
            {claimUrl}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 transition-colors flex-shrink-0"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Generated Password (shown once — same rule as the claim link itself) */}
        {revealedPassword && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-xs text-zinc-400">
              <KeyRound className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
              Password:{" "}
              <span className="font-mono text-zinc-100 select-all">{revealedPassword}</span>
            </span>
            <button
              type="button"
              onClick={handleCopyPassword}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 transition-colors flex-shrink-0"
            >
              {copiedPassword ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all shadow-md active:scale-[0.98]"
          >
            <Share2 className="h-4 w-4" />
            <span>Share Link</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setClaimUrl(null);
              setRevealedPassword(null);
              setAmount("10");
              setPassword("");
              setGeneratePassword(false);
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
      {/* Amount Input */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Loot Amount (USDC)
        </label>
        <div className="relative">
          <div className="absolute left-4 top-3.5 text-lg font-bold text-blue-400">
            $
          </div>
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
          <div className="absolute right-4 top-4 text-xs font-semibold text-zinc-400">
            USDC
          </div>
        </div>

        {/* Quick Amount Presets */}
        <div className="flex gap-2 pt-1">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(preset)}
              className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition ${
                amount === preset
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              ${preset}
            </button>
          ))}
        </div>
      </div>

      {/* Password Protection */}
      <div className="space-y-2">
        <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-zinc-500" />
            Password Protection
          </span>
          <span className="text-[10px] text-zinc-500 font-normal">Optional</span>
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (e.target.value) setGeneratePassword(false);
          }}
          disabled={generatePassword}
          placeholder="Set password to unlock Loot"
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-zinc-600 disabled:opacity-50"
        />
        <label className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-2.5 cursor-pointer">
          <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
            <Sparkles className="h-3.5 w-3.5 text-zinc-500" />
            Or generate one for me
          </span>
          <input
            type="checkbox"
            checked={generatePassword}
            onChange={(e) => {
              setGeneratePassword(e.target.checked);
              if (e.target.checked) setPassword("");
            }}
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-blue-500"
          />
        </label>
      </div>

      {/* Expiration Options */}
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

      {/* Summary Box */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-2 text-xs">
        <div className="flex justify-between text-zinc-400">
          <span>Deposit Amount:</span>
          <span className="font-semibold text-white">{amount || "0"} USDC</span>
        </div>
        <div className="flex justify-between text-zinc-400">
          <span>Recipient Network Fee:</span>
          <span className="text-emerald-400 font-semibold">Free ($0.00)</span>
        </div>
        <div className="flex justify-between border-t border-zinc-800/80 pt-2 text-zinc-300 font-semibold">
          <span>Recipient Claim Amount:</span>
          <span className="text-blue-400 font-bold text-sm">{amount || "0"} USDC</span>
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
        <ShieldCheck className="h-4 w-4" />
        <span>{loading ? "Authorizing Escrow Deposit…" : `Deposit & Generate Loot Link`}</span>
      </button>
    </form>
  );
}
