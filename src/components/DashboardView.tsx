"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { CreateLinkForm } from "@/components/CreateLinkForm";
import {
  Send,
  Inbox,
  Lock,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  ExternalLink,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Shield,
  X,
  Gift,
} from "lucide-react";

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
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  let badgeStyle = "bg-zinc-800 text-zinc-400 border-zinc-700";
  let Icon = Clock;
  let label = status.toLowerCase().replace("_", " ");

  if (status === "ACTIVE" || status === "SUCCEEDED") {
    badgeStyle = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    Icon = CheckCircle2;
  } else if (status === "PENDING_DEPOSIT" || status === "PENDING") {
    badgeStyle = "bg-amber-500/10 text-amber-400 border-amber-500/20";
    Icon = Clock;
  } else if (status === "CLAIMED") {
    badgeStyle = "bg-blue-500/10 text-blue-400 border-blue-500/20";
    Icon = CheckCircle2;
  } else if (status === "EXPIRED" || status === "CANCELLED" || status === "FAILED") {
    badgeStyle = "bg-zinc-900 text-zinc-500 border-zinc-800";
    Icon = XCircle;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${badgeStyle}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </span>
  );
}

export function DashboardView({
  isCreateModalOpen,
  setIsCreateModalOpen,
}: {
  isCreateModalOpen?: boolean;
  setIsCreateModalOpen?: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<"sent" | "received">("sent");
  const [sent, setSent] = useState<SentLink[] | null>(null);
  const [received, setReceived] = useState<ReceivedClaim[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [internalModalOpen, setInternalModalOpen] = useState(false);

  const modalOpen = isCreateModalOpen ?? internalModalOpen;
  const setModalOpen = setIsCreateModalOpen ?? setInternalModalOpen;

  const fetchDashboardData = useCallback(() => {
    fetch("/api/dashboard/sent")
      .then((res) => res.json())
      .then((data) => setSent(data.links || []))
      .catch(() => setSent([]));

    fetch("/api/dashboard/received")
      .then((res) => res.json())
      .then((data) => setReceived(data.claims || []))
      .catch(() => setReceived([]));
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  function handleCopyLink(linkId: string) {
    const claimUrl = `${window.location.origin}/claim/${linkId}`;
    navigator.clipboard.writeText(claimUrl);
    setCopiedId(linkId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Calculate totals
  const totalSentMicros = sent?.reduce((acc, item) => acc + BigInt(item.amountMicros), BigInt(0)) ?? BigInt(0);
  const totalReceivedMicros = received?.reduce((acc, item) => acc + BigInt(item.amountMicros), BigInt(0)) ?? BigInt(0);

  return (
    <div className="space-y-6">
      {/* Stats Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Total Sent</span>
            <ArrowUpRight className="h-4 w-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white tracking-tight">
            {formatUsdc(totalSentMicros.toString())} <span className="text-sm font-normal text-zinc-400">USDC</span>
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Total Claimed</span>
            <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white tracking-tight">
            {formatUsdc(totalReceivedMicros.toString())} <span className="text-sm font-normal text-zinc-400">USDC</span>
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Active Loot Links</span>
            <Shield className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-white tracking-tight">
            {sent?.filter((l) => l.status === "ACTIVE").length ?? 0}
          </p>
        </div>
      </div>

      {/* Navigation Tabs & Primary Action */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-1 rounded-xl border border-zinc-800 bg-zinc-900/80 p-1">
          <button
            type="button"
            onClick={() => setTab("sent")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all ${
              tab === "sent"
                ? "bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Send className="h-3.5 w-3.5" />
            <span>Sent Loot ({sent?.length ?? 0})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("received")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all ${
              tab === "received"
                ? "bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Inbox className="h-3.5 w-3.5" />
            <span>Received Claims ({received?.length ?? 0})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 transition-all shadow-md active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          <span>Create Loot Link</span>
        </button>
      </div>

      {/* Sent Links View */}
      {tab === "sent" && (
        <div className="space-y-3">
          {sent === null && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-8 text-center text-sm text-zinc-400">
              Loading sent links...
            </div>
          )}
          {sent?.length === 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-12 text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
                <Send className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-white">No Loot links created yet</p>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Create your first USDC Loot link to send funds securely to anyone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-md"
              >
                <Plus className="h-4 w-4" />
                <span>Create Loot Link</span>
              </button>
            </div>
          )}
          {sent?.map((link) => (
            <div
              key={link.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">
                  $
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-white tracking-tight">
                      {formatUsdc(link.amountMicros)} USDC
                    </span>
                    {link.hasPassword && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                        <Lock className="h-3 w-3" /> Password
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">
                    Created {formatDate(link.createdAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 border-t border-zinc-800/60 pt-3 sm:border-0 sm:pt-0">
                <StatusBadge status={link.status} />

                {link.status === "ACTIVE" && (
                  <button
                    type="button"
                    onClick={() => handleCopyLink(link.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                  >
                    {copiedId === link.id ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Received Claims View */}
      {tab === "received" && (
        <div className="space-y-3">
          {received === null && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-8 text-center text-sm text-zinc-400">
              Loading claims...
            </div>
          )}
          {received?.length === 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-12 text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
                <Inbox className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-white">No claims received yet</p>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  When you claim USDC Loot links, your transaction history will appear here.
                </p>
              </div>
            </div>
          )}
          {received?.map((claim) => (
            <div
              key={claim.id}
              className="flex items-center justify-between rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm">
                  +$
                </div>
                <div>
                  <p className="text-base font-bold text-white tracking-tight">
                    {formatUsdc(claim.amountMicros)} USDC
                  </p>
                  <p className="text-xs text-zinc-500">
                    Claimed {formatDate(claim.createdAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <StatusBadge status={claim.status} />

                {claim.circleTxId && (
                  <a
                    href={`https://testnet.arcscan.app/tx/${claim.circleTxId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-zinc-500 hover:text-zinc-200 transition-colors"
                    title="View on ArcScan"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE LINK MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/95 p-6 md:p-8 shadow-2xl space-y-6 text-zinc-100 my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Gift className="h-4 w-4" />
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight">Create Loot Link</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <CreateLinkForm
              onSuccess={() => {
                fetchDashboardData();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
