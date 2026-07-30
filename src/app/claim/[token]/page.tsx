import { ClaimPageClient } from "@/components/ClaimPageClient";

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <ClaimPageClient token={token} />
      </div>
    </div>
  );
}
