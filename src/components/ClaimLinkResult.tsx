"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

/** Shown after a single link is funded, whichever wallet paid for it. */
export function ClaimLinkResult({ claimUrl }: { claimUrl: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(claimUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-ok/12 text-ok">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
            <path
              d="m5 12.5 4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">
          Link funded and ready
        </h2>
        <p className="mt-2 text-sm text-muted">
          The USDC is in escrow. The first person to open this link claims it.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="flex justify-center bg-white p-6">
          <QRCodeSVG value={claimUrl} size={188} />
        </div>
        <div className="border-t border-line p-4">
          <span className="eyebrow">Claim link</span>
          <p className="mt-2 break-all font-mono text-xs leading-relaxed text-muted">
            {claimUrl}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <button type="button" onClick={copy} className="btn btn-primary">
          {copied ? "Copied to clipboard" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="btn btn-ghost"
        >
          View activity
        </button>
      </div>
    </div>
  );
}
