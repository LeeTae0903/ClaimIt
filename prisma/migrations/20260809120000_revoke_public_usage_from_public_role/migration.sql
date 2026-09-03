-- The previous revoke was a no-op for the roles that mattered.
--
-- anon and authenticated never held a direct USAGE grant on `public`; they
-- inherited it from PUBLIC, the pseudo-role every role belongs to, which
-- Postgres grants USAGE on this schema by default. Revoking "FROM anon" left
-- that inherited path untouched, so has_schema_privilege still answered yes.
--
-- Revoking from PUBLIC is safe to do here and not elsewhere: the schema's ACL
-- shows postgres and service_role hold their own explicit grants
-- (postgres=U/pg_database_owner, service_role=U/pg_database_owner), so neither
-- loses anything. dashboard_user is granted back so the Supabase table editor
-- keeps working; anon and authenticated have no explicit grant and are left
-- with nothing, which is the point.
--
-- With no USAGE on the schema, no object inside it is reachable regardless of
-- table privileges, RLS, or which role created it — including tables a future
-- migration hasn't written yet.
REVOKE USAGE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO postgres, service_role, dashboard_user;
