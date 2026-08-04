import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardView } from "@/components/DashboardView";
import { Shell, ShellAction } from "@/components/Shell";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?redirect=/dashboard");

  return (
    <Shell action={<ShellAction href="/links/new" label="Send USDC" />}>
      <div className="space-y-6">
        <div>
          <span className="eyebrow">Your account</span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Activity</h1>
          <p className="mt-1.5 text-sm text-muted">
            Links you&apos;ve funded, and claims you&apos;ve received.
          </p>
        </div>
        <DashboardView />
      </div>
    </Shell>
  );
}
