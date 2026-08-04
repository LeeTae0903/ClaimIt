-- Claiming no longer requires an account: the recipient can supply a payout
-- address instead of having a wallet provisioned for them.

-- 1. An account is now optional on a claim.
ALTER TABLE "Claim" ALTER COLUMN "claimantId" DROP NOT NULL;

-- 2. Record where the payout went. Added nullable first so existing rows can
--    be backfilled from the claimant's wallet — the address the payout was
--    actually sent to at the time — before the column is made required.
ALTER TABLE "Claim" ADD COLUMN "toAddress" TEXT;

UPDATE "Claim" c
SET "toAddress" = w."address"
FROM "Wallet" w
WHERE w."userId" = c."claimantId"
  AND w."role" = 'PERSONAL'
  AND c."toAddress" IS NULL;

-- Any claim still without an address has no wallet to derive one from, which
-- shouldn't be possible: every prior claim paid out to the claimant's own
-- wallet. Fail loudly here rather than silently inventing a value.
DO $$
DECLARE missing INT;
BEGIN
  SELECT COUNT(*) INTO missing FROM "Claim" WHERE "toAddress" IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'Cannot backfill Claim.toAddress: % row(s) have no PERSONAL wallet', missing;
  END IF;
END $$;

ALTER TABLE "Claim" ALTER COLUMN "toAddress" SET NOT NULL;
