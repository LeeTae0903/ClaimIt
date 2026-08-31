import Link from "next/link";
import {
  Zap,
  Wallet,
  Lock,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Copy,
  Gift,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-blue-600/30 selection:text-blue-200">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-blue-400 group-hover:border-blue-500/50 transition-colors">
              <Gift className="h-5 w-5 text-blue-400" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              Loot<span className="text-blue-400">Claim</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
            <a href="#features" className="hover:text-zinc-200 transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-zinc-200 transition-colors">
              How It Works
            </a>
            <a href="#security" className="hover:text-zinc-200 transition-colors">
              Security
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-all shadow-sm active:scale-[0.98]"
            >
              <span>Launch App</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-24 md:py-32 px-6">
          <div className="mx-auto max-w-5xl text-center space-y-8">
            {/* Tech Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3.5 py-1.5 text-xs font-medium text-blue-400">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Powered by Circle & Arc Testnet</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.1]">
              Send USDC Loot as easily <br className="hidden sm:inline" />
              as sending a link.
            </h1>

            {/* Subheadline */}
            <p className="mx-auto max-w-2xl text-lg sm:text-xl text-zinc-400 font-normal leading-relaxed">
              Deposit crypto into secure escrow and share a Loot claim link. Anyone can claim USDC instantly into an auto-provisioned wallet — zero wallet setup required for recipients.
            </p>

            {/* Hero CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <Link
                href="/dashboard"
                className="w-full sm:w-auto flex items-center justify-center gap-2.5 rounded-xl bg-blue-600 px-7 py-3.5 text-base font-semibold text-white hover:bg-blue-500 transition-all shadow-lg active:scale-[0.98]"
              >
                <span>Create Loot Link</span>
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/dashboard"
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-7 py-3.5 text-base font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all active:scale-[0.98]"
              >
                <span>View Dashboard</span>
                <ArrowUpRight className="h-4 w-4 text-zinc-400" />
              </Link>
            </div>

            {/* Live Card Preview Mockup */}
            <div className="pt-12 mx-auto max-w-md">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-2xl text-left space-y-5 relative">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs">
                      $
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Loot Claim Link</p>
                      <p className="text-sm font-medium text-zinc-200">USDC Transfer</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Active
                  </span>
                </div>

                <div className="space-y-1 py-1">
                  <p className="text-xs text-zinc-400">Escrow Amount</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-white tracking-tight">50.00</span>
                    <span className="text-sm font-semibold text-blue-400">USDC</span>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 flex items-center justify-between">
                  <span className="truncate font-mono text-xs text-zinc-400">
                    https://lootclaim.app/claim/t_8x92a01f
                  </span>
                  <button type="button" className="p-1.5 text-zinc-400 hover:text-white transition-colors">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-500 pt-1">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                    Circle Escrow
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5 text-amber-400" />
                    Gas Covered
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 border-t border-zinc-900 bg-zinc-950 px-6">
          <div className="mx-auto max-w-6xl space-y-12">
            <div className="text-center space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-blue-400">Features</h2>
              <p className="text-3xl font-bold text-white tracking-tight sm:text-4xl">
                Built for friction-free Web3 loot payments
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Feature 1 */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4 hover:border-zinc-700 transition-colors">
                <div className="h-11 w-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Wallet className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-white">Auto Recipient Wallets</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Recipients without an existing Web3 wallet get a Circle User-Controlled Wallet created inline with PIN protection.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4 hover:border-zinc-700 transition-colors">
                <div className="h-11 w-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Zap className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-white">Zero Recipient Fees</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Recipients receive 100% of the sender-specified USDC amount. On-chain gas fees are fully absorbed by LootClaim.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4 hover:border-zinc-700 transition-colors">
                <div className="h-11 w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Gift className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-white">Treasury Escrow</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Deposits are safely held in Circle Developer-Controlled Treasury wallets until claimed by the designated recipient.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4 hover:border-zinc-700 transition-colors">
                <div className="h-11 w-11 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <Lock className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-white">Password & Expiry</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Protect your payment links with custom passwords and configure automatic expiration windows (1h, 24h, 7d).
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="py-20 border-t border-zinc-900 bg-zinc-900/30 px-6">
          <div className="mx-auto max-w-5xl space-y-14">
            <div className="text-center space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-blue-400">Simple Workflow</h2>
              <p className="text-3xl font-bold text-white tracking-tight sm:text-4xl">
                How LootClaim Works
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
              {/* Step 1 */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 space-y-4 relative">
                <div className="text-xs font-bold font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full w-8 h-8 flex items-center justify-center">
                  01
                </div>
                <h3 className="text-xl font-semibold text-white">Deposit & Create</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Enter your desired USDC amount, set optional security settings, and deposit funds into escrow with 1 click.
                </p>
              </div>

              {/* Step 2 */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 space-y-4 relative">
                <div className="text-xs font-bold font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full w-8 h-8 flex items-center justify-center">
                  02
                </div>
                <h3 className="text-xl font-semibold text-white">Share Link Anywhere</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Copy your unique Loot URL or QR code and send it via Telegram, Email, X, or any messaging app.
                </p>
              </div>

              {/* Step 3 */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 space-y-4 relative">
                <div className="text-xs font-bold font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full w-8 h-8 flex items-center justify-center">
                  03
                </div>
                <h3 className="text-xl font-semibold text-white">Instant Recipient Claim</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Recipient opens the link and receives USDC immediately into their existing or auto-provisioned wallet.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Security & Architecture Banner */}
        <section id="security" className="py-16 border-t border-zinc-900 bg-zinc-950 px-6">
          <div className="mx-auto max-w-4xl rounded-3xl border border-zinc-800 bg-zinc-900/60 p-8 sm:p-12 text-center space-y-6">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Non-Custodial Security</h2>
            <p className="mx-auto max-w-xl text-sm sm:text-base text-zinc-400 leading-relaxed">
              Powered by Circle Developer-Controlled Treasury Escrow and User-Controlled Wallets. Double-spend protections and automated transaction reconciliation guarantee your funds are always safe.
            </p>
            <div className="pt-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 transition-colors shadow-md"
              >
                <span>Try LootClaim Now</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-10 px-6 text-zinc-500 text-xs">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-blue-400" />
            <span className="font-bold text-zinc-300">LootClaim</span>
            <span>© 2026. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-zinc-500">Arc Testnet</span>
            <span className="text-zinc-500">Circle Wallets SDK</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
