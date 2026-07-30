import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { WalletSetup } from "@/components/WalletSetup";

export default async function WalletSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?redirect=/wallet/setup");

  const { redirect: redirectTo } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Your wallet</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Used to send and receive USDC on Arc Testnet.
          </p>
        </div>
        <WalletSetup redirectTo={redirectTo} />
      </div>
    </div>
  );
}
