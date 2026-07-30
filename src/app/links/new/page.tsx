import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CreateLinkForm } from "@/components/CreateLinkForm";

export default async function NewLinkPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?redirect=/links/new");

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Send USDC</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Create a link anyone can claim.
          </p>
        </div>
        <CreateLinkForm />
      </div>
    </div>
  );
}
