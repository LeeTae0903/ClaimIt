"use client";

import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

let sdk: W3SSdk | null = null;

// Must only be constructed in the browser — it manages an iframe.
export function getWalletSdk(appId: string): W3SSdk {
  if (!sdk) {
    sdk = new W3SSdk({ appSettings: { appId } });
  }
  return sdk;
}

export class WalletSdkUnavailableError extends Error {
  constructor() {
    super(
      "Couldn't reach Circle's wallet service. If this keeps happening, this site's domain may not be authorised for the Circle App ID.",
    );
    this.name = "WalletSdkUnavailableError";
  }
}

/**
 * Builds the SDK and waits for its device registration.
 *
 * `getDeviceId()` talks to Circle through an iframe, and when that iframe
 * can't load — a domain Circle doesn't recognise, a CSP that blocks it, a
 * browser partitioning third-party storage — the promise simply never
 * settles rather than rejecting. Awaiting it bare therefore hangs the caller
 * forever with nothing logged, so every entry point goes through this bound
 * version instead.
 */
export async function prepareWalletSdk(
  appId: string,
  timeoutMs = 20_000,
): Promise<W3SSdk> {
  const instance = getWalletSdk(appId);

  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WalletSdkUnavailableError()), timeoutMs);
  });

  try {
    await Promise.race([instance.getDeviceId(), timeout]);
  } catch (err) {
    console.error("[wallet-sdk] getDeviceId failed:", err);
    throw err instanceof WalletSdkUnavailableError
      ? err
      : new WalletSdkUnavailableError();
  } finally {
    clearTimeout(timer!);
  }

  return instance;
}
