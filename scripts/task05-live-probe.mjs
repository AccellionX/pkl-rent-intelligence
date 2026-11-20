#!/usr/bin/env node
/**
 * Live Supabase readiness probe for Task #5.
 * Loads .env, never prints secret values.
 *
 * Exit codes:
 *  0 = schema ready (required tables visible to service role OpenAPI/REST)
 *  2 = project configured but schema/migrations not ready
 *  3 = missing env
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !anon || !service) {
  console.log(
    JSON.stringify(
      {
        status: "missing_env",
        hasUrl: Boolean(url),
        hasAnon: Boolean(anon),
        hasServiceRole: Boolean(service),
      },
      null,
      2,
    ),
  );
  process.exit(3);
}

const required = [
  "organizations",
  "organization_members",
  "properties",
  "unit_types",
  "source_documents",
  "extracted_values",
  "review_decisions",
  "report_snapshots",
  "comparable_properties",
  "comparable_unit_data",
  "source_value_conflicts",
  "report_runs",
];

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const openapi = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: service, Authorization: `Bearer ${service}` },
});
const spec = await openapi.json().catch(() => ({}));
const defs = Object.keys(spec.definitions ?? {});
const paths = Object.keys(spec.paths ?? {});

const tableChecks = {};
for (const t of required) {
  // IMPORTANT: head:true can return 204/null error even when the table is absent
  // from PostgREST schema cache with newer Supabase API keys. Always select rows.
  const { data, error, status } = await admin.from(t).select("id").limit(1);
  tableChecks[t] = error || status >= 400
    ? {
        ok: false,
        status,
        code: error?.code ?? null,
        message: (error?.message ?? `HTTP ${status}`).slice(0, 120),
      }
    : { ok: true, status, rowSampleCount: (data ?? []).length };
}

const { data: buckets, error: bucketErr } = await admin.storage.listBuckets();
const neededBuckets = ["source-documents", "report-photos", "generated-reports"];
const bucketIds = new Set((buckets ?? []).map((b) => b.id));

const pub = await fetch(`${url}/storage/v1/object/public/source-documents/probe`);
const missingTables = required.filter((t) => !tableChecks[t].ok);
const schemaReady = missingTables.length === 0;

const result = {
  status: schemaReady ? "schema_ready" : "schema_missing",
  projectHost: new URL(url).host,
  openapi: {
    status: openapi.status,
    definitionCount: defs.length,
    pathCount: paths.length,
    exposesOrganizations: defs.includes("organizations") || paths.includes("/organizations"),
  },
  tables: tableChecks,
  missingTables,
  buckets: bucketErr
    ? { ok: false, message: bucketErr.message.slice(0, 120) }
    : {
        ok: true,
        ids: [...bucketIds],
        privateSourceDocuments: buckets?.find((b) => b.id === "source-documents")?.public === false,
        missing: neededBuckets.filter((id) => !bucketIds.has(id)),
      },
  publicStorageProbeStatus: pub.status,
  nextAction: schemaReady
    ? "Run authenticated E2E upload/review/stats flow"
    : "Apply supabase/migrations/*.sql in order via Dashboard SQL or DATABASE_URL, then Settings → API → Reload schema",
};

console.log(JSON.stringify(result, null, 2));
process.exit(schemaReady ? 0 : 2);
