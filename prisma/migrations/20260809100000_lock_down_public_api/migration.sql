-- Close the Supabase Data API off from this database.
--
-- Supabase exposes PostgREST over every table in `public`, authorised by the
-- publishable key — a key that is public by design. Tables created by Prisma
-- inherit the project's default privileges, which grant anon and authenticated
-- full DML. Verified before this migration: an unauthenticated request holding
-- only the publishable key could SELECT from `session` (that is account
-- takeover), and held UPDATE/DELETE/TRUNCATE on `PaymentLink`, `Claim` and
-- every other table.
--
-- claimIT never uses that API. It reaches Postgres through Prisma as the
-- `postgres` role, which owns these tables and therefore bypasses RLS, so
-- nothing below affects the application.
--
-- Two independent locks, because either alone would be enough and neither is
-- worth betting the database on:
-- 1. REVOKE — PostgREST has no privilege to exercise.
-- 2. RLS with no policies — deny by default even if a privilege reappears.

-- 1. Take the privileges away, and stop new tables from being granted them.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Without this, the next `prisma migrate` creates a table that is public again.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 2. Deny-by-default on every table. No policies are created: there is no
-- legitimate anon or authenticated access to grant, since every read and
-- write goes through the application's own authorisation.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
