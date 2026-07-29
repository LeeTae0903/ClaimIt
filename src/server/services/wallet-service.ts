import { randomUUID } from "node:crypto";
import { Blockchain, Error155106 } from "@circle-fin/user-controlled-wallets";
import { db } from "@/lib/db";
import { circleUserClient } from "@/lib/circle/user-wallets";

export type PendingWallet = {
  status: "pending-pin-setup";
  challengeId: string;
  userToken: string;
  encryptionKey: string;
};

export type ReadyWallet = {
  status: "ready";
  wallets: { id: string; address: string; blockchain: string }[];
};

async function ensureCircleUser(appUserId: string, circleUserId: string | null) {
  if (circleUserId) return;

  try {
    await circleUserClient.createUser({ userId: appUserId });
  } catch (err) {
    // Already exists from a prior attempt that didn't finish backfilling
    // circleUserId on our side — safe to continue.
    if (!(err instanceof Error155106)) throw err;
  }

  await db.user.update({
    where: { id: appUserId },
    data: { circleUserId: appUserId },
  });
}

/**
 * Idempotent: safe to call every time a user visits the wallet-setup flow.
 * Returns existing wallets if the user already has one, otherwise a
 * challenge for the client-side Circle SDK to run PIN setup through.
 */
export async function ensureUserWallet(user: {
  id: string;
  circleUserId: string | null;
}): Promise<PendingWallet | ReadyWallet> {
  await ensureCircleUser(user.id, user.circleUserId);

  const tokenResponse = await circleUserClient.createUserToken({
    userId: user.id,
  });
  const userToken = tokenResponse.data!.userToken;
  const encryptionKey = tokenResponse.data!.encryptionKey!;

  const existing = await circleUserClient.listWallets({ userToken });
  const existingWallets = existing.data?.wallets ?? [];
  if (existingWallets.length > 0) {
    await persistWallets(user.id, existingWallets);
    return {
      status: "ready",
      wallets: existingWallets.map((w) => ({
        id: w.id,
        address: w.address,
        blockchain: w.blockchain,
      })),
    };
  }

  const pinResponse = await circleUserClient.createUserPinWithWallets({
    userToken,
    blockchains: [Blockchain.ArcTestnet],
    accountType: "EOA",
    idempotencyKey: randomUUID(),
  });

  return {
    status: "pending-pin-setup",
    challengeId: pinResponse.data!.challengeId,
    userToken,
    encryptionKey,
  };
}

/**
 * Called after the client-side Circle SDK reports the PIN-setup challenge
 * succeeded. Circle needs a moment to index the new wallet, so this may need
 * a short retry from the caller if the list comes back empty.
 */
export async function confirmUserWallet(
  user: { id: string },
  userToken: string,
) {
  const response = await circleUserClient.listWallets({ userToken });
  const wallets = response.data?.wallets ?? [];
  await persistWallets(user.id, wallets);
  return wallets.map((w) => ({
    id: w.id,
    address: w.address,
    blockchain: w.blockchain,
  }));
}

async function persistWallets(
  userId: string,
  wallets: { id: string; address: string; blockchain: string; accountType?: string }[],
) {
  for (const wallet of wallets) {
    await db.wallet.upsert({
      where: { circleWalletId: wallet.id },
      create: {
        userId,
        custodyType: "USER_CONTROLLED",
        role: "PERSONAL",
        circleWalletId: wallet.id,
        address: wallet.address,
        blockchain: wallet.blockchain,
        accountType: wallet.accountType ?? "EOA",
      },
      update: {},
    });
  }
}
