-- Deposits signed by the sender's own wallet, rather than routed through
-- Circle's user-controlled wallet.

-- The on-chain transfer that funded a link or batch. Unique so the same
-- transfer can't be presented as the deposit for two of them.
ALTER TABLE "PaymentLink" ADD COLUMN "externalTxHash" TEXT;
CREATE UNIQUE INDEX "PaymentLink_externalTxHash_key" ON "PaymentLink"("externalTxHash");

ALTER TABLE "LinkBatch" ADD COLUMN "externalTxHash" TEXT;
CREATE UNIQUE INDEX "LinkBatch_externalTxHash_key" ON "LinkBatch"("externalTxHash");

-- A Circle transfer has a Circle id; a self-signed one only has a hash.
ALTER TABLE "Transaction" ALTER COLUMN "circleTxId" DROP NOT NULL;
ALTER TABLE "Transaction" ADD COLUMN "onchainTxHash" TEXT;
CREATE UNIQUE INDEX "Transaction_onchainTxHash_key" ON "Transaction"("onchainTxHash");

-- A transaction with neither identifier can't be reconciled against anything,
-- so it isn't a transaction we can act on.
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_has_identifier"
    CHECK ("circleTxId" IS NOT NULL OR "onchainTxHash" IS NOT NULL);
