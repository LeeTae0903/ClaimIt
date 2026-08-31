import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardView } from "@/components/DashboardView";
import { Shield, LogOut, User, Gift } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?redirect=/dashboard");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-blue-600/30 selection:text-blue-200">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-blue-400 group-hover:border-blue-500/50 transition-colors">
              <Gift className="h-5 w-5 text-blue-400" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              Loot<span className="text-blue-400">Claim</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-400">
              <User className="h-3.5 w-3.5 text-blue-400" />
              <span className="truncate max-w-[160px]">{session.user.email || session.user.name || "Guest Account"}</span>
            </div>

            <Link
              href="/sign-in"
              className="flex items-center justify-center h-9 w-9 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Sign Out / Switch Account"
            >
              <LogOut className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Dashboard Container */}
      <main className="flex-1 py-10 px-6">
        <div className="mx-auto max-w-5xl space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard & Activity</h1>
              <p className="text-xs text-zinc-400 mt-1">
                Manage your active Loot links and track received claims on Arc Testnet.
              </p>
            </div>
          </div>

          <DashboardView />
        </div>
      </main>
    </div>
  );
}
