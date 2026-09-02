import "dotenv/config";
import { db } from "../src/lib/db";
import { circleUserClient } from "../src/lib/circle/user-wallets";

const LINK_IDS = [
  "cmtjxv29a000004l857cyev1j",
  "cmtjxzhe9000004jrtz4r9mqi",
  "cmtjy0nh6000004jisflb1nn2",
];

async function main() {
  for (const linkId of LINK_IDS) {
    console.log("\n=== Link", linkId, "===");
    const link = await db.paymentLink.findUnique({ where: { id: linkId } });
    if (!link) {
      console.log("  not found in DB");
      continue;
    }
    console.log("  status:", link.status, "refId:", link.refId, "senderId:", link.senderId);

    const senderWallet = await db.wallet.findFirst({
      where: { userId: link.senderId, role: "PERSONAL" },
    });
    if (!senderWallet) {
      console.log("  sender has no wallet");
      continue;
    }
    console.log("  senderWallet.circleWalletId:", senderWallet.circleWalletId);

    const { userToken } = await circleUserClient
      .createUserToken({ userId: link.senderId })
      .then((r) => r.data!);

    const response = await circleUserClient.listTransactions({
      userToken,
      walletIds: [senderWallet.circleWalletId],
    });

    const txs = response.data?.transactions ?? [];
    console.log(`  listTransactions returned ${txs.length} transaction(s):`);
    for (const tx of txs) {
      console.log(
        JSON.stringify(
          {
            id: tx.id,
            refId: tx.refId,
            state: tx.state,
            amounts: tx.amounts,
            destinationAddress: tx.destinationAddress,
            createDate: tx.createDate,
          },
          null,
          2,
        ),
      );
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
