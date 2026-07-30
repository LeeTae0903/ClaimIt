"use client";

import { FormEvent, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { getWalletSdk } from "@/lib/circle/wallet-sdk";

type PrepareResponse = {
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
// occasionally outlast that too — retry here as well before giving up.
async function confirmDepositWithRetry(maxAttempts = 3, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch("/api/links/confirm", { method: "POST" });
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

      const { challengeId, userToken, encryptionKey, claimToken, circleAppId } =
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

      await confirmDepositWithRetry();

      setClaimUrl(`${window.location.origin}/claim/${claimToken}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (claimUrl) {
    return (
      <div className="space-y-6 text-center">
        <p className="text-sm font-medium text-black/70 dark:text-white/70">
          Your link is ready
        </p>
        <div className="flex justify-center rounded-2xl bg-white p-6">
          <QRCodeSVG value={claimUrl} size={200} />
        </div>
        <div className="break-all rounded-xl border border-black/10 px-4 py-3 font-mono text-xs dark:border-white/15">
          {claimUrl}
        </div>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(claimUrl)}
          className="w-full rounded-xl bg-black px-4 py-3.5 text-base font-medium text-white transition active:scale-[0.98] dark:bg-white dark:text-black"
        >
          Copy link
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm text-black/60 dark:text-white/60">
          Amount (USDC)
        </label>
        <input
          type="number"
          min="0.1"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="50.00"
          className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3.5 text-base outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm text-black/60 dark:text-white/60">
          Password (optional)
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Leave blank for none"
          className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3.5 text-base outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm text-black/60 dark:text-white/60">
          Expires in (hours, optional)
        </label>
        <input
          type="number"
          min="1"
          value={expiresInHours}
          onChange={(e) => setExpiresInHours(e.target.value)}
          placeholder="Never"
          className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3.5 text-base outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-black px-4 py-3.5 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {loading ? "Creating…" : "Create claim link"}
      </button>
    </form>
  );
}
