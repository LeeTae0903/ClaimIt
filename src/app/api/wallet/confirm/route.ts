import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { confirmUserWallet } from "@/server/services/wallet-service";

const USER_TOKEN_COOKIE = "circle_user_token";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userToken = request.cookies.get(USER_TOKEN_COOKIE)?.value;
  if (!userToken) {
    return NextResponse.json(
      { error: "No pending wallet setup for this session" },
      { status: 400 },
    );
  }

  const wallets = await confirmUserWallet({ id: session.user.id }, userToken);

  const response = NextResponse.json({ wallets });
  response.cookies.delete(USER_TOKEN_COOKIE);
  return response;
}
