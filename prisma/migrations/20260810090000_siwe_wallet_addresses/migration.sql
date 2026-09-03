CREATE TABLE "walletAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "walletAddress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "walletAddress_address_chainId_key" ON "walletAddress"("address", "chainId");

CREATE INDEX "walletAddress_userId_idx" ON "walletAddress"("userId");

ALTER TABLE "walletAddress" ADD CONSTRAINT "walletAddress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
