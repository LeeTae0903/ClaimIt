import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { WalletSetup } from "@/components/WalletSetup";
import { Shell } from "@/components/Shell";

export default async function WalletSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?redirect=/wallet/setup");

  const { redirect: redirectTo } = await searchParams;

  return (
    <Shell account center>
      <div className="space-y-6">
        <div>
          <span className="eyebrow">Setup</span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Your wallet
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Non-custodial, on Arc Testnet. Used to send and receive USDC.
          </p>
        </div>
        <WalletSetup redirectTo={redirectTo} />
      </div>
    </Shell>
  );
}
