#!/usr/bin/env node
/**
 * Apply Phase 1 SQL migrations when DATABASE_URL (or SUPABASE_DB_URL) is set.
 * Uses `psql` from PATH. Never prints the connection string.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/task05-apply-migrations.mjs
 */
import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

function loadEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

loadEnv();

const databaseUrl =
  process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();

if (!databaseUrl) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error:
          "DATABASE_URL or SUPABASE_DB_URL is required to apply migrations from the CLI",
        alternative:
          "Supabase Dashboard → SQL → run files in supabase/migrations/ in timestamp order, then Reload schema",
      },
      null,
      2,
    ),
  );
  process.exit(3);
}

const psqlCheck = spawnSync("psql", ["--version"], { encoding: "utf8" });
if (psqlCheck.error || psqlCheck.status !== 0) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "psql not found on PATH",
      alternative:
        "Install Postgres client tools, or apply SQL via Supabase Dashboard",
    }),
  );
  process.exit(3);
}

const dir = join(process.cwd(), "supabase/migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const bootstrap = `
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default timezone('utc', now())
);
`;

function runSql(sql) {
  const tmp = join(mkdtempSync(join(tmpdir(), "pkl-mig-")), "stmt.sql");
  writeFileSync(tmp, sql);
  const result = spawnSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", tmp],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "psql failed").slice(0, 500);
    throw new Error(err);
  }
  return result.stdout;
}

try {
  runSql(bootstrap);
  const applied = [];
  const skipped = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const check = spawnSync(
      "psql",
      [
        databaseUrl,
        "-tAc",
        `select 1 from public.schema_migrations where version = '${version.replace(/'/g, "''")}'`,
      ],
      { encoding: "utf8" },
    );
    if (check.status === 0 && check.stdout.trim() === "1") {
      skipped.push(version);
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    runSql(`begin;\n${sql}\ninsert into public.schema_migrations(version) values ('${version.replace(/'/g, "''")}');\ncommit;`);
    applied.push(version);
  }
  runSql("notify pgrst, 'reload schema';");
  console.log(
    JSON.stringify(
      {
        ok: true,
        applied,
        skipped,
        note: "If REST still returns PGRST205, use Dashboard → Settings → API → Reload schema",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      message: error instanceof Error ? error.message.slice(0, 500) : "unknown",
    }),
  );
  process.exit(1);
}
