-- Sign-In with Ethereum: the address that proves an account's identity.
-- Separate from the domain "Wallet" table, which is about moving funds.

CREATE TABLE "walletAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "walletAddress_pkey" PRIMARY KEY ("id")
);

-- One address on one chain identifies one account, so a second account can't
-- claim the same wallet.
CREATE UNIQUE INDEX "walletAddress_address_chainId_key" ON "walletAddress"("address", "chainId");
CREATE INDEX "walletAddress_userId_idx" ON "walletAddress"("userId");

ALTER TABLE "walletAddress" ADD CONSTRAINT "walletAddress_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
