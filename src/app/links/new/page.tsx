import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateModeSwitch } from "@/components/CreateModeSwitch";
import { Shell, ShellAction } from "@/components/Shell";

export default async function NewLinkPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?redirect=/links/new");

  // Someone who signed in with their own wallet has no Circle wallet, so
  // defaulting to the built-in one would send them straight to wallet setup
  // for a wallet they don't need. Decided on the server so the form never
  // renders the wrong choice first and then corrects itself.
  const [circleWallet, siweAddress] = await Promise.all([
    db.wallet.findFirst({
      where: { userId: session.user.id, role: "PERSONAL" },
      select: { id: true },
    }),
    db.walletAddress.findFirst({
      where: { userId: session.user.id },
      select: { address: true },
    }),
  ]);

  const defaultSource =
    !circleWallet && siweAddress ? "external" : "builtin";

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
