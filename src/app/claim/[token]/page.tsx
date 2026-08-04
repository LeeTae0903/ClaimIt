import { ClaimPageClient } from "@/components/ClaimPageClient";
import { Shell } from "@/components/Shell";

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <Shell center>
      <ClaimPageClient token={token} />
    </Shell>
  );
}
