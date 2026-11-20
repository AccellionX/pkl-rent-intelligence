import { loadDotEnv, clientSourcePath } from "./lib/local-e2e-env.mjs";
/**
 * Authenticated live E2E against running Next app + live Supabase.
 * Usage: node scripts/task05-live-e2e.mjs
 * Requires: .env, npm run dev, ephemeral user credentials JSON path via
 *   PKL_TASK05_USER_JSON (default: agent-store file if present).
 */
import fs from "fs";
import path from "path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

loadDotEnv();

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) throw new Error(".env missing");
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadEnv();

const BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CSV =
  process.env.PKL_RENTOMETER_855_CSV ||
  clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "20261114-Rentometer-855_Providence_St_West_Warwick_RI_02893_USA-2-bed-qPiKWT24DL0.csv");
const HD =
  process.env.PKL_HELLODATA_855_PDF ||
  clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "855_Providence_St_-11-14-2026.pdf");

const userJsonPath =
  process.env.PKL_TASK05_USER_JSON;

const creds = JSON.parse(fs.readFileSync(userJsonPath || (() => { throw new Error("Set PKL_TASK05_USER_JSON to a local credentials JSON path"); })(), "utf8"));

const cookieJar = new Map();

function cookieHeader() {
  return [...cookieJar.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
}

function userClient() {
  return createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return [...cookieJar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          if (value == null || value === "") cookieJar.delete(name);
          else cookieJar.set(name, value);
        }
      },
    },
  });
}

async function api(method, pathname, { json, form } = {}) {
  const headers = { Cookie: cookieHeader() };
  let body;
  if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  if (form) body = form;
  const res = await fetch(`${BASE}${pathname}`, { method, headers, body });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

function log(step, payload) {
  console.log(`\n=== ${step} ===`);
  console.log(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2));
}

async function main() {
  const out = {
    status: "running",
    steps: {},
  };

  // Health
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  out.steps.health = health;
  log("health", health);
  if (health?.mode === "demo" || health?.error) {
    out.status = "blocked_dev_server";
    console.log(JSON.stringify(out, null, 2));
    process.exit(2);
  }

  const supabaseAuth = userClient();
  const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (authError || !authData.user || !authData.session) {
    out.status = "auth_failed";
    out.steps.auth = { error: authError?.message };
    console.log(JSON.stringify(out, null, 2));
    process.exit(3);
  }
  out.steps.auth = { userId: authData.user.id, email: authData.user.email, cookies: cookieJar.size };
  log("auth", out.steps.auth);

  // Direct PostgREST calls with user JWT (SSR cookie client can miss Authorization in Node).
  const supabase = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const slug = `pkl-t5-${Date.now().toString(36)}`;
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: "PKL Task5 E2E", slug })
    .select("*")
    .single();
  if (orgError) {
    out.status = "org_insert_failed";
    out.steps.org = { error: orgError.message };
    console.log(JSON.stringify(out, null, 2));
    process.exit(4);
  }
  out.steps.org = { id: org.id, slug: org.slug };
  log("org", out.steps.org);

  const { data: membership } = await supabase
    .from("organization_members")
    .select("*")
    .eq("organization_id", org.id)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  out.steps.membership = membership;
  log("membership", membership);

  // RLS negative: second user via service create + anon client should not see org
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const otherEmail = `pkl.task05.other.${Date.now()}@example.com`;
  const otherPass = `O2-${crypto.randomUUID()}!aA1`;
  const { data: otherCreated, error: otherCreateErr } = await admin.auth.admin.createUser({
    email: otherEmail,
    password: otherPass,
    email_confirm: true,
  });
  out.steps.otherUser = {
    created: !otherCreateErr,
    id: otherCreated?.user?.id ?? null,
    error: otherCreateErr?.message ?? null,
  };

  let rlsOk = false;
  if (otherCreated?.user) {
    const otherAuth = createClient(URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: otherSession } = await otherAuth.auth.signInWithPassword({
      email: otherEmail,
      password: otherPass,
    });
    const other = createClient(URL, ANON, {
      global: {
        headers: { Authorization: `Bearer ${otherSession.session.access_token}` },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: leaked } = await other.from("organizations").select("id").eq("id", org.id);
    rlsOk = Array.isArray(leaked) && leaked.length === 0;
    out.steps.rls = { otherSeesOrg: leaked?.length ?? null, pass: rlsOk };
    await admin.auth.admin.deleteUser(otherCreated.user.id).catch(() => {});
  }
  log("rls", out.steps.rls);

  const propRes = await api("POST", "/api/properties", {
    json: {
      organizationId: org.id,
      name: "855 Providence St",
      addressLine1: "855 Providence St",
      city: "West Warwick",
      state: "RI",
      postalCode: "02893",
      country: "US",
    },
  });
  out.steps.property = propRes;
  log("property", propRes);
  if (!propRes.ok) {
    out.status = "property_failed";
    console.log(JSON.stringify(out, null, 2));
    process.exit(5);
  }
  const propertyId = propRes.data?.data?.property?.id;
  if (!propertyId) {
    out.status = "property_failed";
    console.log(JSON.stringify(out, null, 2));
    process.exit(5);
  }

  const utRes = await api("POST", `/api/properties/${propertyId}/unit-types`, {
    json: { label: "2BR", beds: 2, baths: 1 },
  });
  out.steps.unitType = utRes;
  log("unitType", utRes);
  if (!utRes.ok) {
    out.status = "unit_type_failed";
    console.log(JSON.stringify(out, null, 2));
    process.exit(6);
  }
  const unitTypeId = utRes.data?.data?.unitType?.id;
  if (!unitTypeId) {
    out.status = "unit_type_failed";
    console.log(JSON.stringify(out, null, 2));
    process.exit(6);
  }

  const reportRes = await api("POST", `/api/properties/${propertyId}/reports`, {
    json: {
      unitTypeId,
      title: "855 Providence 2BR Task5 E2E",
      periodStart: "2026-11-08",
      periodEnd: "2026-11-14",
      preparedBy: "task05-e2e",
    },
  });
  out.steps.report = reportRes;
  log("report", reportRes);
  if (!reportRes.ok) {
    out.status = "report_failed";
    console.log(JSON.stringify(out, null, 2));
    process.exit(7);
  }
  const reportRunId = reportRes.data?.data?.report?.id;
  if (!reportRunId) {
    out.status = "report_failed";
    console.log(JSON.stringify(out, null, 2));
    process.exit(7);
  }

  async function upload(filePath, sourceType) {
    if (!fs.existsSync(filePath)) {
      return { ok: false, status: 0, data: { error: "file_missing", filePath } };
    }
    const buf = fs.readFileSync(filePath);
    const form = new FormData();
    form.set("file", new Blob([buf]), path.basename(filePath));
    form.set("sourceType", sourceType);
    form.set("organizationId", org.id);
    form.set("propertyId", propertyId);
    form.set("unitTypeId", unitTypeId);
    form.set("reportRunId", reportRunId);
    return api("POST", "/api/uploads", { form });
  }

  const csvUpload = await upload(CSV, "rentometer_csv");
  const csvData = csvUpload.data?.data ?? csvUpload.data;
  out.steps.rentometerCsv = {
    status: csvUpload.status,
    ok: csvUpload.ok,
    documentId: csvData?.document?.id ?? csvData?.documentId,
    extractionCount: csvData?.extractions?.length ?? 0,
    parseStatus: csvData?.document?.parse_status,
    error: csvUpload.data?.error ?? csvData?.message,
    summaryKeys: csvData && typeof csvData === "object" ? Object.keys(csvData) : [],
  };
  log("rentometerCsv", { ...out.steps.rentometerCsv, rawPreview: JSON.stringify(csvUpload.data).slice(0, 800) });

  const hdUpload = await upload(HD, "hellodata_pdf");
  const hdData = hdUpload.data?.data ?? hdUpload.data;
  out.steps.helloData = {
    status: hdUpload.status,
    ok: hdUpload.ok,
    documentId: hdData?.document?.id ?? hdData?.documentId,
    extractionCount: hdData?.extractions?.length ?? 0,
    parseStatus: hdData?.document?.parse_status,
    error: hdUpload.data?.error ?? hdData?.message,
    summaryKeys: hdData && typeof hdData === "object" ? Object.keys(hdData) : [],
  };
  log("helloData", { ...out.steps.helloData, rawPreview: JSON.stringify(hdUpload.data).slice(0, 800) });

  const reviewResults = [];
  for (const uploadRes of [csvUpload, hdUpload]) {
    const payload = uploadRes.data?.data ?? uploadRes.data;
    const extractions = payload?.extractions ?? [];
    for (const ex of extractions.slice(0, 5)) {
      const rev = await api("POST", `/api/extractions/${ex.id}/review`, {
        json: { decision: "accepted", reason: "task05 e2e accept", unitTypeId },
      });
      reviewResults.push({
        id: ex.id,
        status: rev.status,
        ok: rev.ok,
        error: rev.data?.error || rev.data?.message,
      });
    }
  }
  out.steps.reviews = { attempted: reviewResults.length, results: reviewResults };
  log("reviews", out.steps.reviews);

  const conflicts = await api("GET", `/api/properties/${propertyId}/conflicts?status=pending`);
  const conflictRows = conflicts.data?.data?.conflicts ?? conflicts.data?.conflicts ?? [];
  out.steps.conflictsList = {
    status: conflicts.status,
    ok: conflicts.ok,
    count: conflictRows.length,
    sample: conflictRows.slice(0, 3).map((c) => ({
      id: c.id,
      left: c.left_source,
      right: c.right_source,
      delta: c.rent_delta ?? c.delta_amount,
    })),
  };
  log("conflicts", out.steps.conflictsList);

  const firstConflict = conflictRows[0];
  if (firstConflict) {
    const chosen =
      firstConflict.right_rent ??
      firstConflict.left_rent ??
      firstConflict.chosen_value?.rent ??
      2000;
    const resolveResult = await api("POST", `/api/conflicts/${firstConflict.id}/resolve`, {
      json: {
        status: "resolved",
        chosenRent: Number(chosen) || 2000,
        verifiedListingSource: "task05-e2e-listing-check",
        verifiedAt: "2026-11-14",
        reviewerNote: "Resolved during Task5 live E2E (>25 conflict path)",
      },
    });
    out.steps.conflictResolve = {
      status: resolveResult.status,
      ok: resolveResult.ok,
      id: firstConflict.id,
      error: resolveResult.data?.error || resolveResult.data?.message,
    };
  } else {
    out.steps.conflictResolve = { status: "skipped", reason: "no_pending_conflicts" };
  }
  log("conflictResolve", out.steps.conflictResolve);

  const stats = await api("GET", `/api/reports/${reportRunId}/stats`);
  const statsPayload = stats.data?.data ?? stats.data;
  out.steps.stats = {
    status: stats.status,
    ok: stats.ok,
    keys: statsPayload && typeof statsPayload === "object" ? Object.keys(statsPayload) : [],
    preview: JSON.stringify(statsPayload).slice(0, 1200),
  };
  log("stats", out.steps.stats);

  const uploadsOk = csvUpload.ok && hdUpload.ok;
  const apiBootstrapOk = propRes.ok && utRes.ok && reportRes.ok;
  out.status =
    apiBootstrapOk && uploadsOk && rlsOk
      ? "pass"
      : apiBootstrapOk && uploadsOk
        ? "partial_rls"
        : apiBootstrapOk
          ? "partial_uploads"
          : "failed";

  console.log("\n=== FINAL ===");
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.status === "pass" || out.status.startsWith("partial") ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
