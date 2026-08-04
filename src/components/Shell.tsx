import Link from "next/link";
import { ReactNode } from "react";
import { LogoMark, Wordmark } from "@/components/Brand";

/**
 * Page chrome shared by every route: a hairline sticky header and a centred
 * column. `width` widens the column for the landing page, which is the only
 * screen not built around a single form.
 */
export function Shell({
  children,
  action,
  width = "narrow",
  center = false,
}: {
  children: ReactNode;
  action?: ReactNode;
  width?: "narrow" | "wide";
  center?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark className="h-6 w-6" />
            <Wordmark />
          </Link>
          {action}
        </div>
      </header>

      <main
        className={`flex flex-1 flex-col px-5 ${center ? "justify-center" : ""}`}
      >
        <div
          className={`mx-auto w-full py-10 ${
            width === "wide" ? "max-w-5xl" : "max-w-md"
          }`}
        >
          {children}
        </div>
      </main>

      <footer className="border-t border-line/70">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
          <span className="eyebrow">Arc Testnet</span>
          <span className="eyebrow">USDC escrow</span>
        </div>
      </footer>
    </div>
  );
}

/** Small header link, used for the one contextual action each page offers. */
export function ShellAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-line bg-raised px-3 py-1.5 text-sm text-muted transition hover:border-line-strong hover:text-ink"
    >
      {label}
    </Link>
  );
}
