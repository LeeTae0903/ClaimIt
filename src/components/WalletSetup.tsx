"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getWalletSdk } from "@/lib/circle/wallet-sdk";
import {
  Wallet,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
} from "lucide-react";

type WalletInfo = { id: string; address: string; blockchain: string };

type EnsureResponse =
  | { status: "ready"; wallets: WalletInfo[] }
  | {
      status: "pending-pin-setup";
      challengeId: string;
      userToken: string;
      encryptionKey: string;
      circleAppId: string;
    };

export function WalletSetup({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "ready"; wallets: WalletInfo[] }
    | { phase: "needs-pin"; data: Extract<EnsureResponse, { status: "pending-pin-setup" }> }
    | { phase: "setting-up" }
    | { phase: "error"; message: string }
  >({ phase: "loading" });

  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    let cancelled = false;

    async function ensure() {
      try {
        const res = await fetch("/api/wallet/ensure", { method: "POST" });
        if (!res.ok) throw new Error("Couldn't reach wallet service.");
        const data: EnsureResponse = await res.json();
        if (cancelled) return;

        if (data.status === "ready") {
          setState({ phase: "ready", wallets: data.wallets });
        } else {
          if (!data.circleAppId) {
            setState({
              phase: "error",
              message:
                "Wallet setup isn't configured yet (missing Circle App ID).",
            });
            return;
          }
          const sdk = getWalletSdk(data.circleAppId);
          await sdk.getDeviceId();
          setState({ phase: "needs-pin", data });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            phase: "error",
            message: err instanceof Error ? err.message : "Something went wrong.",
          });
        }
      }
    }

    void ensure();
    return () => {
      cancelled = true;
    };
  }, []);

  async function setUpPin() {
    if (state.phase !== "needs-pin") return;
    const { challengeId, userToken, encryptionKey, circleAppId } = state.data;
    setState({ phase: "setting-up" });

    const sdk = getWalletSdk(circleAppId);
    sdk.setAuthentication({ userToken, encryptionKey });
    sdk.execute(challengeId, async (error) => {
      if (error) {
        setState({
          phase: "error",
          message: error.message || "PIN setup failed.",
        });
        return;
      }

      try {
        const res = await fetch("/api/wallet/confirm", { method: "POST" });
        if (!res.ok) throw new Error("Couldn't confirm wallet creation.");
        const { wallets } = await res.json();
        setState({ phase: "ready", wallets });
      } catch (err) {
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : "Something went wrong.",
        });
      }
    });
  }

  if (state.phase === "loading") {
    return (
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-8 text-center space-y-3 shadow-2xl backdrop-blur-xl">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
          <Sparkles className="h-5 w-5 animate-pulse" />
        </div>
        <p className="text-sm font-medium text-zinc-300">Initializing Circle Wallet Provisioning...</p>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-8 space-y-4 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{state.message}</span>
        </div>
      </div>
    );
  }

  if (state.phase === "ready") {
    return (
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-8 space-y-6 shadow-2xl backdrop-blur-xl text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Wallet Ready!</h2>
          <p className="text-xs text-zinc-400">
            Your Circle User-Controlled Wallet has been securely provisioned.
          </p>
        </div>

        <div className="space-y-2">
          {state.wallets.map((w) => (
            <div key={w.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-left space-y-1">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-blue-400">{w.blockchain}</span>
              <p className="font-mono text-xs text-zinc-300 break-all select-all">
                {w.address}
              </p>
            </div>
          ))}
        </div>

        {redirectTo && (
          <button
            type="button"
            onClick={() => router.push(redirectTo)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all shadow-md active:scale-[0.98]"
          >
            <span>Continue to Destination</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-8 space-y-6 shadow-2xl backdrop-blur-xl text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
        <KeyRound className="h-6 w-6" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold text-white">Set Up Security PIN</h2>
        <p className="text-xs text-zinc-400">
          Circle hosted security setup is required to initialize your non-custodial wallet PIN.
        </p>
      </div>

      <button
        type="button"
        onClick={setUpPin}
        disabled={state.phase === "setting-up"}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
      >
        <ShieldCheck className="h-4 w-4" />
        <span>{state.phase === "setting-up" ? "Opening Circle Hosted PIN UI…" : "Set Up Security PIN"}</span>
      </button>
    </div>
  );
}
