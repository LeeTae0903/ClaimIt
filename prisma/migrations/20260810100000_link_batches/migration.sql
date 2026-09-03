CREATE TYPE "BatchStatus" AS ENUM ('PENDING_DEPOSIT', 'ACTIVE', 'FAILED');

CREATE TABLE "LinkBatch" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "treasuryWalletId" TEXT NOT NULL,
    "totalMicros" BIGINT NOT NULL,
    "linkCount" INTEGER NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'PENDING_DEPOSIT',
    "refId" TEXT,
    "depositTxId" TEXT,
    "depositedMicros" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LinkBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LinkBatch_refId_key" ON "LinkBatch"("refId");
CREATE INDEX "LinkBatch_senderId_idx" ON "LinkBatch"("senderId");
CREATE INDEX "LinkBatch_status_createdAt_idx" ON "LinkBatch"("status", "createdAt");

ALTER TABLE "LinkBatch" ADD CONSTRAINT "LinkBatch_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentLink" ADD COLUMN "batchId" TEXT;
CREATE INDEX "PaymentLink_batchId_idx" ON "PaymentLink"("batchId");
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "LinkBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Transaction" ALTER COLUMN "paymentLinkId" DROP NOT NULL;
ALTER TABLE "Transaction" ADD COLUMN "batchId" TEXT;
CREATE INDEX "Transaction_batchId_idx" ON "Transaction"("batchId");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "LinkBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_one_owner"
  CHECK (("paymentLinkId" IS NOT NULL) <> ("batchId" IS NOT NULL));
