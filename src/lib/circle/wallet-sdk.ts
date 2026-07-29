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
