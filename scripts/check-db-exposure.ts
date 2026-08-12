/**
 * Fails if this database is reachable from Supabase's public Data API.
 *
 * Supabase serves PostgREST over the `public` schema, authorised by a key that
 * is public by design. Tables created outside Supabase's own tooling — Prisma's,
 * here — inherit project default privileges that hand anon and authenticated
 * full DML, and arrive with RLS off. That combination once exposed every table
 * in this project, `session` included, to anyone holding the publishable key.
 *
 * The fix is three independent locks, and this script asserts all three so a
 * future migration can't quietly undo one. Run it after any schema change:
 *
 *   npm run security:check-db
 *
 * Checks are made against the database itself rather than by probing the API,
 * so no Supabase key is needed and the result doesn't depend on which key
 * happens to be lying around. Set SUPABASE_PROBE_URL and SUPABASE_PROBE_KEY to
 * additionally probe the live API end-to-end.
 */
import "dotenv/config";
import { db } from "../src/lib/db";

const EXPOSED_ROLES = ["anon", "authenticated"];

type Failure = { check: string; detail: string };
const failures: Failure[] = [];
const passes: string[] = [];

function record(ok: boolean, check: string, detail: string) {
  if (ok) passes.push(check);
  else failures.push({ check, detail });
}

async function main() {
  // 1. No table privileges for the publicly-reachable roles.
  const grants = await db.$queryRaw<{ grantee: string; table_name: string; privs: string }[]>`
    SELECT grantee, table_name, string_agg(DISTINCT privilege_type, ',') AS privs
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = ANY(${EXPOSED_ROLES})
    GROUP BY grantee, table_name`;
  record(
    grants.length === 0,
    "no table privileges for anon/authenticated",
    grants.map((g) => `${g.grantee} has ${g.privs} on ${g.table_name}`).join("; "),
  );

  // 2. RLS on everywhere, so a privilege that reappears still yields no rows.
  const noRls = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND NOT rowsecurity`;
  record(
    noRls.length === 0,
    "row-level security enabled on every table",
    noRls.map((t) => t.tablename).join(", "),
  );

  // 3. No USAGE on the schema, which makes the first two moot — nothing inside
  //    is reachable at all, including tables that don't exist yet.
  const usage = await db.$queryRaw<{ rolname: string }[]>`
    SELECT rolname FROM unnest(${EXPOSED_ROLES}::text[]) AS rolname
    WHERE has_schema_privilege(rolname, 'public', 'USAGE')`;
  record(
    usage.length === 0,
    "schema usage revoked from anon/authenticated",
    usage.map((r) => `${r.rolname} can reach schema public`).join(", "),
  );

  // 4. Default privileges, so the next migration's tables aren't born public.
  const defaults = await db.$queryRaw<{ acl: string }[]>`
    SELECT array_to_string(d.defaclacl, ', ') AS acl
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE n.nspname = 'public'
      AND pg_get_userbyid(d.defaclrole) = 'postgres'
      AND array_to_string(d.defaclacl, ',') ~ '(anon|authenticated)='`;
  record(
    defaults.length === 0,
    "postgres default privileges don't grant anon/authenticated",
    defaults.map((d) => d.acl).join(" | "),
  );

  // Optional: prove it from outside, the way an attacker would see it.
  const probeUrl = process.env.SUPABASE_PROBE_URL;
  const probeKey = process.env.SUPABASE_PROBE_KEY;
  if (probeUrl && probeKey) {
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    const reachable: string[] = [];
    for (const { tablename } of tables) {
      const res = await fetch(
        `${probeUrl}/rest/v1/${encodeURIComponent(tablename)}?select=*&limit=1`,
        { headers: { apikey: probeKey, Authorization: `Bearer ${probeKey}` } },
      );
      const body = await res.text();
      if (res.status === 200 && body.trim() !== "[]") reachable.push(tablename);
    }
    record(
      reachable.length === 0,
      "live Data API returns no rows for any table",
      reachable.join(", "),
    );
  }

  for (const p of passes) console.log(`  ok    ${p}`);
  for (const f of failures) console.log(`  FAIL  ${f.check}\n          ${f.detail}`);

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} check(s) failed — this database is reachable from the public API.`,
    );
    process.exit(1);
  }
  console.log("\nDatabase is not reachable from the public Data API.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
