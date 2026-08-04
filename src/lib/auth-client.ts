import { createAuthClient } from "better-auth/react";
import {
  anonymousClient,
  emailOTPClient,
  siweClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [emailOTPClient(), anonymousClient(), siweClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
