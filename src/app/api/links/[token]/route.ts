import { NextResponse } from "next/server";
import { getPublicLinkInfo } from "@/server/services/claim-service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/links/[token]">,
) {
  const { token } = await ctx.params;
  const info = await getPublicLinkInfo(token);
  return NextResponse.json(info);
}
