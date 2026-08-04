"use client";

import { useEffect, useState } from "react";

type SentEntry =
  | {
      kind: "link";
      id: string;
      amountMicros: string;
      status: string;
      hasPassword: boolean;
      createdAt: string;
      claimedAt: string | null;
      expiresAt: string | null;
    }
  | {
      kind: "batch";
      id: string;
      amountMicros: string;
      linkCount: number;
      claimedCount: number;
      status: string;
      createdAt: string;
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

const NEUTRAL = "bg-white/[0.06] text-muted";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-ok/12 text-ok",
  SUCCEEDED: "bg-ok/12 text-ok",
  PENDING_DEPOSIT: "bg-warn/12 text-warn",
  PENDING: "bg-warn/12 text-warn",
  FAILED: "bg-bad/12 text-bad",
  CLAIMED: NEUTRAL,
  EXPIRED: NEUTRAL,
  CANCELLED: NEUTRAL,
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 font-mono text-[0.66rem] uppercase tracking-wider ${
        STATUS_STYLES[status] ?? NEUTRAL
      }`}
    >
      {status.toLowerCase().replace(/_/g, " ")}
    </span>
  );
}

function Row({
  amountMicros,
  meta,
  status,
  rawStatus,
}: {
  amountMicros: string;
  meta: string;
  status: string;
  /** Show the label as-is instead of mapping it to a LinkStatus badge — a
      giveaway's state is a progress count, not one of the link statuses. */
  rawStatus?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3.5 last:border-b-0">
      <div className="min-w-0">
        <p className="numeric text-[0.95rem] font-medium">
          {formatUsdc(amountMicros)}
          <span className="ml-1.5 text-xs font-normal text-faint">USDC</span>
        </p>
        <p className="mt-0.5 truncate text-xs text-faint">{meta}</p>
      </div>
      {rawStatus ? (
        <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 font-mono text-[0.66rem] uppercase tracking-wider text-muted">
          {status}
        </span>
      ) : (
        <StatusBadge status={status} />
      )}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[18rem] text-xs leading-relaxed text-faint">
        {body}
      </p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="animate-pulse space-y-px">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between px-4 py-4">
          <div className="space-y-2">
            <div className="h-3.5 w-24 rounded bg-line" />
            <div className="h-2.5 w-32 rounded bg-line" />
          </div>
          <div className="h-5 w-16 rounded-full bg-line" />
        </div>
      ))}
    </div>
  );
}

export function DashboardView() {
  const [tab, setTab] = useState<"sent" | "received">("sent");
  const [sent, setSent] = useState<SentEntry[] | null>(null);
  const [received, setReceived] = useState<ReceivedClaim[] | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/sent")
      .then((res) => res.json())
      .then((data) => setSent(data.entries));
    fetch("/api/dashboard/received")
      .then((res) => res.json())
      .then((data) => setReceived(data.claims));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
        {(["sent", "received"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize transition ${
              tab === t ? "bg-raised text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {tab === "sent" &&
          (sent === null ? (
            <LoadingRows />
          ) : sent.length === 0 ? (
            <EmptyState
              title="No links sent yet"
              body="Create one and the escrowed amount shows up here until someone claims it."
            />
          ) : (
            sent.map((entry) =>
              entry.kind === "batch" ? (
                <Row
                  key={entry.id}
                  amountMicros={entry.amountMicros}
                  status={`${entry.claimedCount}/${entry.linkCount} claimed`}
                  rawStatus
                  meta={`Giveaway · ${entry.linkCount} links · ${formatDate(entry.createdAt)}`}
                />
              ) : (
                <Row
                  key={entry.id}
                  amountMicros={entry.amountMicros}
                  status={entry.status}
                  meta={`${formatDate(entry.createdAt)}${
                    entry.hasPassword ? " · password protected" : ""
                  }`}
                />
              ),
            )
          ))}

        {tab === "received" &&
          (received === null ? (
            <LoadingRows />
          ) : received.length === 0 ? (
            <EmptyState
              title="No claims yet"
              body="Anything you claim from a link someone sent you appears here."
            />
          ) : (
            received.map((claim) => (
              <Row
                key={claim.id}
                amountMicros={claim.amountMicros}
                status={claim.status}
                meta={formatDate(claim.createdAt)}
              />
            ))
          ))}
      </div>
    </div>
  );
}
