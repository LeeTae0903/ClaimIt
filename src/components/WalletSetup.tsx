"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getWalletSdk } from "@/lib/circle/wallet-sdk";

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
    return <p className="text-sm text-black/60 dark:text-white/60">Setting up your wallet…</p>;
  }

  if (state.phase === "error") {
    return <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>;
  }

  if (state.phase === "ready") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Wallet ready</p>
          {state.wallets.map((w) => (
            <p key={w.id} className="font-mono text-xs text-black/60 dark:text-white/60">
              {w.blockchain}: {w.address}
            </p>
          ))}
        </div>
        {redirectTo && (
          <button
            type="button"
            onClick={() => router.push(redirectTo)}
            className="w-full rounded-xl bg-black px-4 py-3.5 text-base font-medium text-white transition active:scale-[0.98] dark:bg-white dark:text-black"
          >
            Continue
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={setUpPin}
      disabled={state.phase === "setting-up"}
      className="w-full rounded-xl bg-black px-4 py-3.5 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-black"
    >
      {state.phase === "setting-up" ? "Setting up…" : "Set up your wallet"}
    </button>
  );
}
