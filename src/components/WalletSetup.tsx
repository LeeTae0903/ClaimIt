"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getWalletSdk, prepareWalletSdk } from "@/lib/circle/wallet-sdk";

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

  // Guards against React Strict Mode's dev-only double-invocation of
  // effects: without this, POST /api/wallet/ensure fires twice in quick
  // succession, and the second call loses a genuine race against Circle's
  // API (both read circleUserId as not-yet-set and try to create the same
  // user). Refs persist across Strict Mode's mount/cleanup/remount cycle
  // for the same component instance, so this reliably runs ensure() once.
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
          await prepareWalletSdk(data.circleAppId);
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
      <div className="card animate-pulse px-6 py-12 text-center">
        <div className="mx-auto h-3 w-40 rounded bg-line" />
        <div className="mx-auto mt-4 h-2.5 w-56 rounded bg-line" />
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
        {state.message}
      </p>
    );
  }

  if (state.phase === "ready") {
    return (
      <div className="space-y-5">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="eyebrow">Wallet</span>
            <span className="flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 font-mono text-[0.66rem] uppercase tracking-wider text-ok">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" />
              ready
            </span>
          </div>
          {state.wallets.map((w) => (
            <div key={w.id} className="border-b border-line px-4 py-3.5 last:border-b-0">
              <p className="eyebrow">{w.blockchain}</p>
              <p className="mt-1.5 break-all font-mono text-xs leading-relaxed text-muted">
                {w.address}
              </p>
            </div>
          ))}
        </div>
        {redirectTo && (
          <button
            type="button"
            onClick={() => router.push(redirectTo)}
            className="btn btn-primary"
          >
            Continue
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-3 p-5">
        <p className="text-sm leading-relaxed text-muted">
          You&apos;ll set a PIN in Circle&apos;s secure dialog. It never reaches
          claimIT — the wallet is yours, not ours, and the PIN is the only thing
          that can move funds out of it.
        </p>
      </div>
      <button
        type="button"
        onClick={setUpPin}
        disabled={state.phase === "setting-up"}
        className="btn btn-primary"
      >
        {state.phase === "setting-up" ? "Waiting for PIN setup…" : "Set up your wallet"}
      </button>
    </div>
  );
}
