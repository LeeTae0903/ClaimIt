import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { WalletSetup } from "@/components/WalletSetup";
import { Gift } from "lucide-react";

export default async function WalletSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?redirect=/wallet/setup");

  const { redirect: redirectTo } = await searchParams;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-blue-600/30 selection:text-blue-200">
      {/* Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
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
        <div className="mx-auto w-full max-w-md">
          <WalletSetup redirectTo={redirectTo} />
        </div>
      </main>
    </div>
  );
}
