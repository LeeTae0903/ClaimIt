import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateModeSwitch } from "@/components/CreateModeSwitch";
import { Shell, ShellAction } from "@/components/Shell";

export default async function NewLinkPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?redirect=/links/new");

  // If they signed in with a wallet, that wallet is the account — so it funds
  // links, full stop. An earlier visit to /wallet/setup may have left a Circle
  // wallet behind, and letting its mere existence win sent people who had just
  // authenticated with MetaMask back into a PIN flow for a wallet they never
  // asked for. Decided on the server so the form never renders the wrong
  // choice and corrects itself a moment later.
  const siweAddress = await db.walletAddress.findFirst({
    where: { userId: session.user.id },
    select: { address: true },
  });

  const defaultSource = siweAddress ? "external" : "builtin";

  return (
    <Shell account action={<ShellAction href="/dashboard" label="Activity" />}>
      <div className="space-y-7">
        <div>
          <span className="eyebrow">New link</span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Send USDC</h1>
          <p className="mt-1.5 text-sm text-muted">
            Escrow an amount now; whoever opens the link claims it. Split it
            across many links for a giveaway.
          </p>
        </div>
        <CreateModeSwitch defaultSource={defaultSource} />
      </div>
    </Shell>
  );
}
