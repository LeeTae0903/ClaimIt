import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CreateLinkForm } from "@/components/CreateLinkForm";
import { Gift, ArrowLeft } from "lucide-react";

export default async function NewLinkPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?redirect=/links/new");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-blue-600/30 selection:text-blue-200">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </Link>

          <Link href="/" className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-blue-400" />
            <span className="text-base font-bold text-white tracking-tight">
              Loot<span className="text-blue-400">Claim</span>
            </span>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col justify-center px-6 py-12">
        <div className="mx-auto w-full max-w-md space-y-6">
          <div className="space-y-1 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">Create Loot Link</h1>
            <p className="text-xs text-zinc-400">
              Funds are escrowed safely until claimed by your recipient.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-8 shadow-2xl backdrop-blur-xl">
            <CreateLinkForm />
          </div>
        </div>
      </main>
    </div>
  );
}
