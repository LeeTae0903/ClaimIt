import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardView } from "@/components/DashboardView";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?redirect=/dashboard");

  return (
    <div className="flex min-h-dvh flex-col px-6 py-12">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
          <Link
            href="/links/new"
            className="text-sm text-black/60 underline-offset-4 hover:underline dark:text-white/60"
          >
            Send
          </Link>
        </div>
        <DashboardView />
      </div>
    </div>
  );
}
