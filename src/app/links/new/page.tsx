import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CreateLinkForm } from "@/components/CreateLinkForm";
import { Shell, ShellAction } from "@/components/Shell";

export default async function NewLinkPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?redirect=/links/new");

  return (
    <Shell account action={<ShellAction href="/dashboard" label="Activity" />}>
      <div className="space-y-7">
        <div>
          <span className="eyebrow">New link</span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Send USDC</h1>
          <p className="mt-1.5 text-sm text-muted">
            Escrow an amount now; whoever opens the link claims it.
          </p>
        </div>
        <CreateLinkForm />
      </div>
    </Shell>
  );
}
