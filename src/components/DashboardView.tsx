"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { CreateLinkForm } from "@/components/CreateLinkForm";
import { CreateGiveawayForm } from "@/components/CreateGiveawayForm";
import { getWalletSdk } from "@/lib/circle/wallet-sdk";
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
  Wallet,
  QrCode,
  Sparkles,
  ShieldCheck,
  Layers,
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

type UserWallet = {
  id: string;
  address: string;
  blockchain: string;
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

function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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
  const [userWallet, setUserWallet] = useState<UserWallet | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const [isGiveawayModalOpen, setIsGiveawayModalOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);

  // Withdraw state
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("10");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

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

    fetch("/api/wallet/me")
      .then((res) => res.json())
      .then(async (data) => {
        if (data.wallet) {
          setUserWallet(data.wallet);
        } else {
          // Auto-ensure wallet if DB table doesn't have it yet
          const ensureRes = await fetch("/api/wallet/ensure", { method: "POST" });
          if (ensureRes.ok) {
            const ensureData = await ensureRes.json();
            if (ensureData.status === "ready" && ensureData.wallets?.[0]) {
              setUserWallet(ensureData.wallets[0]);
            }
          }
        }
      })
      .catch(() => setUserWallet(null));
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  async function handleCopyLink(linkId: string) {
    try {
      const res = await fetch(`/api/links/${linkId}/regenerate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't get a link to copy.");
      const claimUrl = `${window.location.origin}/claim/${data.claimToken}`;
      navigator.clipboard.writeText(claimUrl);
      setCopiedId(linkId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      alert("Couldn't get a shareable link right now — please try again.");
    }
  }

  function handleCopyAddress() {
    if (!userWallet?.address) return;
    navigator.clipboard.writeText(userWallet.address);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  }

  async function handleWithdraw(e: FormEvent) {
    e.preventDefault();
    setWithdrawError(null);
    setWithdrawLoading(true);

    try {
      const res = await fetch("/api/wallet/withdraw/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toAddress: withdrawAddress,
          amount: withdrawAmount,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Withdrawal failed.");
      }

      const { challengeId, userToken, encryptionKey, circleAppId } = data;

      const sdk = getWalletSdk(circleAppId);
      await sdk.getDeviceId();
      sdk.setAuthentication({ userToken, encryptionKey });

      await new Promise<void>((resolve, reject) => {
        sdk.execute(challengeId, (err) => {
          if (err) reject(err instanceof Error ? err : new Error("Transfer authorization failed."));
          else resolve();
        });
      });

      setWithdrawSuccess(true);
      fetchDashboardData();
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setWithdrawLoading(false);
    }
  }

  // Calculate totals
  const totalSentMicros = sent?.reduce((acc, item) => acc + BigInt(item.amountMicros), BigInt(0)) ?? BigInt(0);
  const totalReceivedMicros = received?.reduce((acc, item) => acc + BigInt(item.amountMicros), BigInt(0)) ?? BigInt(0);

  return (
    <div className="space-y-6">
      {/* Wallet Address Banner / Quick Deposit Indicator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Your Embedded Wallet</span>
              <span className="rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
                Arc Testnet
              </span>
            </div>
            {userWallet ? (
              <p className="font-mono text-sm font-bold text-white tracking-tight">
                {shortenAddress(userWallet.address)}
              </p>
            ) : (
              <p className="text-xs text-zinc-500">Checking wallet address...</p>
            )}
          </div>
        </div>

        {userWallet && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsWalletModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-zinc-800 border border-zinc-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-700 transition-colors shadow-sm"
            >
              <QrCode className="h-4 w-4 text-blue-400" />
              <span>Deposit & QR</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setWithdrawSuccess(false);
                setWithdrawError(null);
                setIsWithdrawModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-xl bg-zinc-800 border border-zinc-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-700 transition-colors shadow-sm"
            >
              <ArrowUpRight className="h-4 w-4 text-emerald-400" />
              <span>Withdraw USDC</span>
            </button>
            <a
              href="https://faucet.circle.com/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-500/20 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Get Free USDC</span>
            </a>
          </div>
        )}
      </div>

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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsGiveawayModalOpen(true)}
            className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 hover:text-white transition-all shadow-sm active:scale-[0.98]"
          >
            <Layers className="h-4 w-4 text-blue-400" />
            <span>Create Giveaway</span>
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 transition-all shadow-md active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            <span>Create Loot Link</span>
          </button>
        </div>
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

            <CreateLinkForm
              onSuccess={() => {
                fetchDashboardData();
              }}
            />
          </div>
        </div>
      )}

      {/* CREATE GIVEAWAY MODAL */}
      {isGiveawayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/95 p-6 md:p-8 shadow-2xl space-y-6 text-zinc-100 my-auto">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Layers className="h-4 w-4" />
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight">Create Giveaway</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsGiveawayModalOpen(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <CreateGiveawayForm
              onSuccess={() => {
                fetchDashboardData();
              }}
            />
          </div>
        </div>
      )}

      {/* WALLET ADDRESS / DEPOSIT MODAL */}
      {isWalletModalOpen && userWallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/95 p-6 md:p-8 shadow-2xl space-y-6 text-zinc-100 text-center my-auto">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Wallet className="h-4 w-4" />
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight">Your Wallet Address</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsWalletModalOpen(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mx-auto flex justify-center rounded-2xl bg-white p-6 shadow-inner w-max">
              <QRCodeSVG value={userWallet.address} size={180} />
            </div>

            <div className="space-y-2 text-left">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Deposit USDC Address ({userWallet.blockchain})
              </span>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 flex items-center justify-between gap-3">
                <span className="truncate font-mono text-xs text-zinc-200 select-all">
                  {userWallet.address}
                </span>
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 transition-colors flex-shrink-0"
                >
                  {copiedAddress ? (
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
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-400 text-left space-y-1">
              <p className="font-semibold text-zinc-200">How to deposit USDC:</p>
              <p>Send USDC on <strong>Arc Testnet</strong> to this address. Need free test tokens?</p>
            </div>

            <div className="pt-2">
              <a
                href="https://faucet.circle.com/"
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all shadow-md active:scale-[0.98]"
              >
                <Sparkles className="h-4 w-4" />
                <span>Get Free Testnet USDC (Circle Faucet)</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* WITHDRAW / TRANSFER TO EXTERNAL WALLET MODAL */}
      {isWithdrawModalOpen && userWallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/95 p-6 md:p-8 shadow-2xl space-y-6 text-zinc-100 my-auto">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <ArrowUpRight className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight">Withdraw USDC</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsWithdrawModalOpen(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {withdrawSuccess ? (
              <div className="space-y-6 text-center py-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xl font-bold text-white">Withdrawal Initiated!</h4>
                  <p className="text-xs text-zinc-400">
                    Transferred {withdrawAmount} USDC on Arc Testnet to <span className="font-mono text-zinc-200">{shortenAddress(withdrawAddress)}</span>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsWithdrawModalOpen(false)}
                  className="w-full rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all shadow-md"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleWithdraw} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Destination Wallet Address
                  </label>
                  <input
                    type="text"
                    required
                    value={withdrawAddress}
                    onChange={(e) => setWithdrawAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm font-mono text-zinc-100 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-zinc-600"
                  />
                  <p className="text-[10px] text-zinc-500">Enter recipient&apos;s EVM address (e.g. MetaMask/Coinbase Wallet)</p>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Withdrawal Amount (USDC)
                  </label>
                  <div className="relative">
                    <div className="absolute left-4 top-3 text-sm font-bold text-emerald-400">
                      $
                    </div>
                    <input
                      type="number"
                      min="0.1"
                      step="0.01"
                      required
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="10.00"
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 pl-8 pr-16 py-2.5 text-base font-bold text-white outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    <div className="absolute right-4 top-3 text-xs font-semibold text-zinc-400">
                      USDC
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-2 text-xs">
                  <div className="flex justify-between text-zinc-400">
                    <span>Source Wallet:</span>
                    <span className="font-mono text-zinc-200">{shortenAddress(userWallet.address)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Blockchain Network:</span>
                    <span className="text-blue-400 font-semibold">{userWallet.blockchain}</span>
                  </div>
                  <div className="flex justify-between border-t border-zinc-800/80 pt-2 text-zinc-300 font-semibold">
                    <span>Net Transfer Amount:</span>
                    <span className="text-emerald-400 font-bold text-sm">{withdrawAmount || "0"} USDC</span>
                  </div>
                </div>

                {withdrawError && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{withdrawError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={withdrawLoading || !withdrawAddress || !withdrawAmount || Number(withdrawAmount) <= 0}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 shadow-md"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>{withdrawLoading ? "Authorizing Transfer with PIN…" : "Confirm & Transfer USDC"}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
