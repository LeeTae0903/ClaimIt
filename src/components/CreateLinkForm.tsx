"use client";

import { FormEvent, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { getWalletSdk } from "@/lib/circle/wallet-sdk";

type PrepareResponse = {
  linkId: string;
  challengeId: string;
  userToken: string;
  encryptionKey: string;
  claimToken: string;
  circleAppId: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The server already retries internally, but Circle's indexing lag can
// occasionally outlast that too — retry here as well before giving up. If
// even this gives up, the PaymentLink stays PENDING_DEPOSIT rather than
// missing entirely, and the reconciliation job picks it up automatically.
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

export function CreateLinkForm() {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [password, setPassword] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyClaimUrl() {
    if (!claimUrl) return;
    await navigator.clipboard.writeText(claimUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

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
          expiresInHours: expiresInHours || undefined,
        }),
      });
      const prepareData = await prepareRes.json();

      if (!prepareRes.ok) {
        if (prepareData.code === "NO_WALLET") {
          router.push("/wallet/setup?redirect=/links/new");
          return;
        }
        throw new Error(prepareData.error ?? "Couldn't start this link.");
      }

      const { linkId, challengeId, userToken, encryptionKey, claimToken, circleAppId } =
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

      await confirmDepositWithRetry(linkId);

      setClaimUrl(`${window.location.origin}/claim/${claimToken}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (claimUrl) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-ok/12 text-ok">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
              <path
                d="m5 12.5 4.5 4.5L19 7.5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-semibold tracking-tight">
            Link funded and ready
          </h2>
          <p className="mt-2 text-sm text-muted">
            The USDC is in escrow. The first person to open this link claims it.
          </p>
        </div>

        <div className="card overflow-hidden">
          <div className="flex justify-center bg-white p-6">
            <QRCodeSVG value={claimUrl} size={188} />
          </div>
          <div className="border-t border-line p-4">
            <span className="eyebrow">Claim link</span>
            <p className="mt-2 break-all font-mono text-xs leading-relaxed text-muted">
              {claimUrl}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <button type="button" onClick={copyClaimUrl} className="btn btn-primary">
            {copied ? "Copied to clipboard" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="btn btn-ghost"
          >
            View activity
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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
        <p className="mt-2 text-xs text-faint">
          The recipient receives this exact amount — gas is on us.
        </p>
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

      <button type="submit" disabled={loading} className="btn btn-primary">
        {loading ? "Waiting for authorisation…" : "Escrow and create link"}
      </button>

      <p className="text-center text-xs leading-relaxed text-faint">
        You&apos;ll authorise the transfer once in Circle&apos;s secure dialog.
        The link only becomes claimable after the deposit confirms.
      </p>
    </form>
  );
}
