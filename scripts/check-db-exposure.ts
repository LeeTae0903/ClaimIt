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

  const noRls = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND NOT rowsecurity`;
  record(
    noRls.length === 0,
    "row-level security enabled on every table",
    noRls.map((t) => t.tablename).join(", "),
  );

  const usage = await db.$queryRaw<{ rolname: string }[]>`
    SELECT rolname FROM unnest(${EXPOSED_ROLES}::text[]) AS rolname
    WHERE has_schema_privilege(rolname, 'public', 'USAGE')`;
  record(
    usage.length === 0,
    "schema usage revoked from anon/authenticated",
    usage.map((r) => `${r.rolname} can reach schema public`).join(", "),
  );

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

  for (const p of passes) console.log(`  ok    ${p}`);
  for (const f of failures) console.log(`  FAIL  ${f.check}\n        ${f.detail}`);

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
