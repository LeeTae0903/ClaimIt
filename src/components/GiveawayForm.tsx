"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareWalletSdk } from "@/lib/circle/wallet-sdk";
import {
  connectWallet,
  ensureArcChain,
  getConnectedAccount,
  getUsdcBalanceMicros,
  sendUsdc,
} from "@/lib/wallet/connect";

type PreparedLink = {
  linkId: string;
  amountMicros: string;
  claimToken: string;
  password: string | null;
};

type PrepareResponse = {
  batchId: string;
  challengeId: string;
  userToken: string;
  encryptionKey: string;
  circleAppId: string;
  links: PreparedLink[];
};

type ExternalPrepareResponse = {
  batchId: string;
  treasuryAddress: string;
  totalMicros: string;
  links: PreparedLink[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatUsdc(micros: string) {
  return (Number(micros) / 1_000_000).toFixed(6).replace(/\.?0+$/, "");
}

// Same shape as the single-link confirm: the server retries internally, but
// indexing lag can outlast that, and the batch stays PENDING_DEPOSIT for the
// reconciliation job either way.
async function confirmWithRetry(
  path: string,
  body: Record<string, unknown>,
  maxAttempts: number,
  delayMs: number,
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

export function GiveawayForm({
  source = "builtin",
}: {
  source?: "builtin" | "external";
}) {
  const router = useRouter();
  const [account, setAccount] = useState<string | null>(null);
  const [balanceMicros, setBalanceMicros] = useState<bigint | null>(null);
  const [total, setTotal] = useState("");
  const [count, setCount] = useState("10");
  const [expiresInHours, setExpiresInHours] = useState("");
  const [withPasswords, setWithPasswords] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<PreparedLink[] | null>(null);
  const [copied, setCopied] = useState(false);

  const totalNum = Number(total);
  const countNum = Number(count);
  const perLink =
    Number.isFinite(totalNum) && totalNum > 0 && countNum >= 1
      ? totalNum / countNum
      : null;

  // Pick up an already-authorised wallet without prompting.
  useEffect(() => {
    if (source !== "external") return;
    let cancelled = false;
    (async () => {
      const existing = await getConnectedAccount();
      if (cancelled || !existing) return;
      setAccount(existing);
      const balance = await getUsdcBalanceMicros(existing).catch(() => null);
      if (!cancelled && balance !== null) setBalanceMicros(balance);
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

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

  const body = {
    totalAmount: total,
    linkCount: countNum,
    expiresInHours: expiresInHours || undefined,
    withPasswords,
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const prepareRes = await fetch(
        source === "external"
          ? "/api/batches/prepare-external"
          : "/api/batches/prepare",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const prepared = await prepareRes.json();

      if (!prepareRes.ok) {
        if (prepared.code === "NO_WALLET") {
          router.push("/wallet/setup?redirect=/links/new");
          return;
        }
        throw new Error(prepared.error ?? "Couldn't start this giveaway.");
      }

      if (source === "external") {
        if (!account) throw new Error("Connect a wallet first.");
        const { batchId, treasuryAddress, totalMicros, links: prepLinks } =
          prepared as ExternalPrepareResponse;

        await ensureArcChain();
        const txHash = await sendUsdc({
          from: account,
          to: treasuryAddress,
          amountMicros: BigInt(totalMicros),
        });
        await confirmWithRetry(
          "/api/batches/confirm-external",
          { batchId, txHash },
          8,
          2500,
        );
        setLinks(prepLinks);
        setBalanceMicros(
          await getUsdcBalanceMicros(account).catch(() => balanceMicros!),
        );
        return;
      }

      const { batchId, challengeId, userToken, encryptionKey, circleAppId, links: prepLinks } =
        prepared as PrepareResponse;

      const sdk = await prepareWalletSdk(circleAppId);
      sdk.setAuthentication({ userToken, encryptionKey });

      await new Promise<void>((resolve, reject) => {
        sdk.execute(challengeId, (err) => {
          if (err) reject(err instanceof Error ? err : new Error("Transfer authorization failed."));
          else resolve();
        });
      });

      await confirmWithRetry("/api/batches/confirm", { batchId }, 3, 3000);
      setLinks(prepLinks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function rowsAsText(rows: PreparedLink[]) {
    const origin = window.location.origin;
    return rows
      .map((l) =>
        l.password
          ? `${origin}/claim/${l.claimToken}  —  password: ${l.password}`
          : `${origin}/claim/${l.claimToken}`,
      )
      .join("\n");
  }

  async function copyAll() {
    if (!links) return;
    await navigator.clipboard.writeText(rowsAsText(links));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadCsv() {
    if (!links) return;
    const origin = window.location.origin;
    const csv = [
      "url,password,amount_usdc",
      ...links.map(
        (l) =>
          `${origin}/claim/${l.claimToken},${l.password ?? ""},${formatUsdc(l.amountMicros)}`,
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "claimit-giveaway.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (links) {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <h2 className="text-xl font-semibold tracking-tight">
            {links.length} links funded
          </h2>
          <p className="mt-2 text-sm text-muted">
            Hand out one row per person. Each link can be claimed once.
          </p>
        </div>

        <p className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm leading-relaxed text-warn">
          Save these now. The links and passwords are shown once and only their
          hashes are stored — closing this page loses them.
        </p>

        <div className="card max-h-[26rem] overflow-y-auto">
          {links.map((l, i) => (
            <div key={l.linkId} className="border-b border-line px-4 py-3 last:border-b-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="eyebrow">#{String(i + 1).padStart(2, "0")}</span>
                <span className="numeric text-xs text-muted">
                  {formatUsdc(l.amountMicros)} USDC
                </span>
              </div>
              <p className="mt-1.5 break-all font-mono text-[0.7rem] leading-relaxed text-muted">
                {typeof window !== "undefined" ? window.location.origin : ""}
                /claim/{l.claimToken}
              </p>
              {l.password && (
                <p className="mt-1 font-mono text-xs text-accent">
                  password: {l.password}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <button type="button" onClick={copyAll} className="btn btn-primary">
            {copied ? "Copied to clipboard" : "Copy all"}
          </button>
          <button type="button" onClick={downloadCsv} className="btn btn-ghost">
            Download CSV
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="btn-quiet"
          >
            View activity
          </button>
        </div>
      </div>
    );
  }

  if (source === "external" && !account) {
    return (
      <div className="space-y-4">
        <div className="card p-5">
          <p className="text-sm leading-relaxed text-muted">
            One transfer from your wallet funds the whole giveaway — you sign
            once, however many links it splits into.
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {source === "external" && account && (
        <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
          <div>
            <span className="eyebrow">Funding from</span>
            <p className="mt-1 font-mono text-xs text-muted">
              {account.slice(0, 6)}…{account.slice(-4)}
            </p>
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
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="field-label">Total to give away</label>
          <div className="relative">
            <input
              type="number"
              min="0.1"
              step="0.01"
              required
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="10.00"
              className="field numeric pr-16 text-xl"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-faint">
              USDC
            </span>
          </div>
        </div>

        <div>
          <label className="field-label">Split into</label>
          <div className="relative">
            <input
              type="number"
              min="1"
              max="100"
              required
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="field numeric pr-16 text-xl"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-faint">
              links
            </span>
          </div>
        </div>
      </div>

      {perLink !== null && (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          Each link will be worth{" "}
          <span className="numeric text-ink">{perLink.toFixed(6).replace(/\.?0+$/, "")} USDC</span>
          . One deposit funds all {countNum} — you authorise once.
        </p>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3.5">
        <input
          type="checkbox"
          checked={withPasswords}
          onChange={(e) => setWithPasswords(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#4d9bf0]"
        />
        <span>
          <span className="text-sm">Generate a password for each link</span>
          <span className="mt-1 block text-xs leading-relaxed text-faint">
            Eight readable characters, different per link. Without one, anyone
            who sees a link can claim it.
          </span>
        </span>
      </label>

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

      {error && (
        <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn btn-primary">
        {loading ? "Waiting for authorisation…" : "Escrow and create links"}
      </button>
    </form>
  );
}
