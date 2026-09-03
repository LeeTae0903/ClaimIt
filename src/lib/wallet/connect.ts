"use client";

import { createWalletClient, custom, getAddress } from "viem";
import { createSiweMessage } from "viem/siwe";
import { arcTestnet } from "@/lib/chain/arc";

// Sign-in only: this app authenticates with a connected wallet but still
// provisions and uses a normal Circle-managed wallet for every deposit,
// payout and claim, exactly like any other login method. Sending USDC
// directly from the connected external wallet is out of scope here.

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export class NoWalletExtensionError extends Error {
  constructor() {
    super(
      "No wallet extension found. Install MetaMask, Rabby or OKX Wallet to sign in with a wallet.",
    );
    this.name = "NoWalletExtensionError";
  }
}

export class WalletRejectedError extends Error {
  constructor() {
    super("You declined the request in your wallet.");
    this.name = "WalletRejectedError";
  }
}

/** EIP-1193 codes: 4001 is the user saying no, which isn't an error to log. */
function isUserRejection(err: unknown): boolean {
  const code = (err as { code?: number })?.code;
  return code === 4001 || /user rejected|denied/i.test(String((err as Error)?.message));
}

function provider(): Eip1193Provider {
  const injected = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  if (!injected) throw new NoWalletExtensionError();
  return injected;
}

export function hasInjectedWallet(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as unknown as { ethereum?: unknown }).ethereum
  );
}

export async function connectWallet(): Promise<string> {
  try {
    const accounts = (await provider().request({
      method: "eth_requestAccounts",
    })) as string[];
    if (!accounts?.length) throw new WalletRejectedError();
    return getAddress(accounts[0]);
  } catch (err) {
    if (isUserRejection(err)) throw new WalletRejectedError();
    throw err;
  }
}

/**
 * Puts the wallet on Arc, adding the network first if it doesn't know it.
 *
 * Wallets without custom-gas-token support will label the balance "ETH" even
 * though the native token is USDC — per Arc's own docs they still sign and
 * send correctly, so this doesn't try to work around the display.
 */
export async function ensureArcChain(): Promise<void> {
  const chainIdHex = `0x${arcTestnet.id.toString(16)}`;
  try {
    await provider().request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (err) {
    // 4902: the wallet has never heard of this chain. Anything else is a real
    // failure and shouldn't be papered over by adding a duplicate network.
    if ((err as { code?: number })?.code !== 4902) {
      if (isUserRejection(err)) throw new WalletRejectedError();
      throw err;
    }
    try {
      await provider().request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: arcTestnet.name,
            nativeCurrency: arcTestnet.nativeCurrency,
            rpcUrls: [...arcTestnet.rpcUrls.default.http],
            blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
          },
        ],
      });
    } catch (addErr) {
      if (isUserRejection(addErr)) throw new WalletRejectedError();
      throw addErr;
    }
  }
}

/**
 * Signs in with the connected wallet (EIP-4361).
 *
 * The message is built here, in the browser, from `window.location.host` —
 * and the server rejects the signature unless that host matches the domain it
 * expects, which is what stops a message signed for another site being
 * replayed here. The nonce is single-use and consumed server-side, via
 * Better Auth's own siwe plugin routes (no custom API route needed).
 */
export async function signInWithWallet(): Promise<void> {
  const address = await connectWallet();
  await ensureArcChain();

  const nonceRes = await fetch("/api/auth/siwe/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: address, chainId: arcTestnet.id }),
  });
  if (!nonceRes.ok) throw new Error("Couldn't start wallet sign-in.");
  const { nonce } = (await nonceRes.json()) as { nonce: string };

  const message = createSiweMessage({
    address: getAddress(address),
    chainId: arcTestnet.id,
    domain: window.location.host,
    nonce,
    uri: window.location.origin,
    version: "1",
    statement: "Sign in to LootClaim. This does not move any funds.",
  });

  const walletClient = createWalletClient({
    chain: arcTestnet,
    transport: custom(provider()),
  });

  let signature: string;
  try {
    signature = await walletClient.signMessage({
      account: getAddress(address),
      message,
    });
  } catch (err) {
    if (isUserRejection(err)) throw new WalletRejectedError();
    throw err;
  }

  const verifyRes = await fetch("/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      signature,
      walletAddress: address,
      chainId: arcTestnet.id,
    }),
  });
  if (!verifyRes.ok) {
    const data = await verifyRes.json().catch(() => ({}));
    throw new Error(data.message ?? "Wallet sign-in was rejected.");
  }
}
