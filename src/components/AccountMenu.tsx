"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { getUsdcBalanceMicros } from "@/lib/wallet/connect";

type WalletInfo = { id: string; address: string; blockchain: string };
type AccountInfo = {
  wallets: WalletInfo[];
  walletAddresses: { address: string; chainId: number }[];
  user: { isAnonymous: boolean; email: string | null };
};

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function AccountMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/wallet").catch(() => null);
      const data: AccountInfo | null = res?.ok ? await res.json() : null;
      if (cancelled) return;
      setInfo(data);

      // Read straight from Arc rather than storing a balance we'd have to keep
      // fresh. Both addresses, because the built-in wallet is only worth
      // mentioning at all when it still holds something.
      const addresses = [
        data?.walletAddresses[0]?.address,
        data?.wallets[0]?.address,
      ].filter((a): a is string => !!a);

      const entries = await Promise.all(
        addresses.map(async (address) => {
          const balance = await getUsdcBalanceMicros(address).catch(() => null);
          return [address, balance] as const;
        }),
      );
      if (cancelled) return;
      setBalances(
        Object.fromEntries(
          entries.filter((e): e is readonly [string, bigint] => e[1] !== null),
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on outside click or Escape, so the panel never traps the page.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function copyAddress(address: string) {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  if (!info) return null;

  // The wallet they signed in with always wins. It IS the account — a Circle
  // wallet left over from an earlier visit to /wallet/setup is not what
  // "your wallet" means to someone who authenticated with MetaMask.
  const siweAddress = info.walletAddresses[0]?.address;
  const circleWallet = info.wallets[0];
  const primaryAddress = siweAddress ?? circleWallet?.address;
  const primaryKind = siweAddress ? "Signed in with" : "Built-in wallet";

  // The built-in wallet is only mentioned when it still holds USDC. Listing an
  // empty one is the clutter the user objected to; silently dropping one with
  // a balance would hide their money.
  const leftoverCircle =
    siweAddress && circleWallet && (balances[circleWallet.address] ?? 0n) > 0n
      ? circleWallet
      : null;

  // A wallet sign-in gets a synthetic email (0x…@domain) so Better Auth has a
  // unique identifier; showing that to the user would be nonsense. The address
  // is what they recognise.
  const label = siweAddress
    ? shorten(siweAddress)
    : info.user.isAnonymous
      ? "Guest"
      : (info.user.email ?? "Account");

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex max-w-[12rem] items-center gap-2 rounded-lg border border-line bg-raised px-3 py-1.5 text-sm text-muted transition hover:border-line-strong hover:text-ink"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
        <span className="truncate">{label}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-[0_20px_50px_-20px_#000]"
        >
          <div className="border-b border-line px-4 py-3">
            <span className="eyebrow">Signed in as</span>
            <p className="mt-1 truncate text-sm">{label}</p>
            {info.user.isAnonymous && (
              <p className="mt-1.5 text-xs leading-relaxed text-faint">
                A guest account lives in this browser only. Clearing site data
                loses access to it — and to any USDC in its wallet.
              </p>
            )}
          </div>

          <div className="border-b border-line px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="eyebrow">
                {primaryAddress ? primaryKind : "Wallet"}
              </span>
              {primaryAddress && (
                <span className="numeric text-sm">
                  {balances[primaryAddress] === undefined
                    ? "…"
                    : (Number(balances[primaryAddress]) / 1e6).toFixed(2)}{" "}
                  <span className="text-xs text-faint">USDC</span>
                </span>
              )}
            </div>
            {primaryAddress ? (
              <>
                <p className="mt-1.5 font-mono text-xs leading-relaxed break-all text-muted">
                  {primaryAddress}
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyAddress(primaryAddress)}
                    className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition hover:border-line-strong hover:text-ink"
                  >
                    {copied ? "Copied" : `Copy ${shorten(primaryAddress)}`}
                  </button>
                  <a
                    href={`https://testnet.arcscan.app/address/${primaryAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-accent transition hover:underline"
                  >
                    ArcScan ↗
                  </a>
                </div>
              </>
            ) : (
              <div className="mt-1.5">
                <p className="text-xs leading-relaxed text-faint">
                  No wallet yet — one is created the first time you send or
                  claim.
                </p>
                <Link
                  href="/wallet/setup"
                  onClick={() => setOpen(false)}
                  className="mt-2 inline-block rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition hover:border-line-strong hover:text-ink"
                >
                  Set one up now
                </Link>
              </div>
            )}
          </div>

          {leftoverCircle && (
            <div className="border-b border-line px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="eyebrow">Built-in wallet</span>
                <span className="numeric text-sm">
                  {(Number(balances[leftoverCircle.address]) / 1e6).toFixed(2)}{" "}
                  <span className="text-xs text-faint">USDC</span>
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-faint">
                From an earlier setup on this account, and it still holds funds.
                Nothing uses it now that you sign in with your own wallet.
              </p>
              <p className="mt-1.5 font-mono text-[0.7rem] leading-relaxed break-all text-muted">
                {leftoverCircle.address}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full px-4 py-3 text-left text-sm text-muted transition hover:bg-raised hover:text-ink disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
