"use client";

import { useEffect, useState } from "react";

type SentLink = {
  id: string;
  amountMicros: string;
  status: string;
  hasPassword: boolean;
  createdAt: string;
  claimedAt: string | null;
  expiresAt: string | null;
};

type ReceivedClaim = {
  id: string;
  amountMicros: string;
  status: string;
  circleTxId: string | null;
  createdAt: string;
};

function formatUsdc(amountMicros: string): string {
  return (Number(amountMicros) / 1_000_000).toFixed(2);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  PENDING_DEPOSIT: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  CLAIMED: "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60",
  EXPIRED: "bg-black/10 text-black/40 dark:bg-white/10 dark:text-white/40",
  CANCELLED: "bg-black/10 text-black/40 dark:bg-white/10 dark:text-white/40",
  PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  SUCCEEDED: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60"}`}
    >
      {status.toLowerCase().replace("_", " ")}
    </span>
  );
}

export function DashboardView() {
  const [tab, setTab] = useState<"sent" | "received">("sent");
  const [sent, setSent] = useState<SentLink[] | null>(null);
  const [received, setReceived] = useState<ReceivedClaim[] | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/sent")
      .then((res) => res.json())
      .then((data) => setSent(data.links));
    fetch("/api/dashboard/received")
      .then((res) => res.json())
      .then((data) => setReceived(data.claims));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-xl bg-black/5 p-1 dark:bg-white/10">
        <button
          type="button"
          onClick={() => setTab("sent")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
            tab === "sent"
              ? "bg-white shadow-sm dark:bg-black/60"
              : "text-black/50 dark:text-white/50"
          }`}
        >
          Sent
        </button>
        <button
          type="button"
          onClick={() => setTab("received")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
            tab === "received"
              ? "bg-white shadow-sm dark:bg-black/60"
              : "text-black/50 dark:text-white/50"
          }`}
        >
          Received
        </button>
      </div>

      {tab === "sent" && (
        <div className="space-y-2">
          {sent === null && (
            <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>
          )}
          {sent?.length === 0 && (
            <p className="text-sm text-black/60 dark:text-white/60">
              No links sent yet.
            </p>
          )}
          {sent?.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 dark:border-white/15"
            >
              <div>
                <p className="font-medium">{formatUsdc(link.amountMicros)} USDC</p>
                <p className="text-xs text-black/50 dark:text-white/50">
                  {formatDate(link.createdAt)}
                  {link.hasPassword && " · password protected"}
                </p>
              </div>
              <StatusBadge status={link.status} />
            </div>
          ))}
        </div>
      )}

      {tab === "received" && (
        <div className="space-y-2">
          {received === null && (
            <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>
          )}
          {received?.length === 0 && (
            <p className="text-sm text-black/60 dark:text-white/60">
              No claims yet.
            </p>
          )}
          {received?.map((claim) => (
            <div
              key={claim.id}
              className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 dark:border-white/15"
            >
              <div>
                <p className="font-medium">{formatUsdc(claim.amountMicros)} USDC</p>
                <p className="text-xs text-black/50 dark:text-white/50">
                  {formatDate(claim.createdAt)}
                </p>
              </div>
              <StatusBadge status={claim.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
