-- AlterEnum
ALTER TYPE "LinkStatus" ADD VALUE 'PENDING_DEPOSIT';

-- AlterTable
ALTER TABLE "PaymentLink" ADD COLUMN     "refId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING_DEPOSIT';

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_refId_key" ON "PaymentLink"("refId");

-- CreateIndex
CREATE INDEX "PaymentLink_status_createdAt_idx" ON "PaymentLink"("status", "createdAt");

