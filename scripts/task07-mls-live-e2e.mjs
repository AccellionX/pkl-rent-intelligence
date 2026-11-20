import { loadDotEnv, clientSourcePath } from "./lib/local-e2e-env.mjs";
/**
 * Task #7 MLS live E2E — RI + CT uploads, review, matching, RLS, photos, synthetic conflict.
 * Usage: npm run task07:e2e  (requires npm run dev + .env + task05 user JSON)
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

const RI_PDF =
  process.env.PKL_MLS_RI_PDF ||
  clientSourcePath("30 Veterans 1BR report - source files", "05 RI MLS CMA report 11-01-2026.pdf");
const CT_PDF = process.env.PKL_MLS_CT_PDF?.trim() || clientSourcePath("Report (1).pdf");

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
  const out = { status: "running", steps: {}, geocodeKeyPresent: Boolean(process.env.GOOGLE_GEOCODING_API_KEY) };

  if (!fs.existsSync(RI_PDF) || !fs.existsSync(CT_PDF)) {
    out.status = "blocked_missing_pdfs";
    out.steps.files = { ri: fs.existsSync(RI_PDF), ct: fs.existsSync(CT_PDF) };
    console.log(JSON.stringify(out, null, 2));
    process.exit(2);
  }

  const health = await fetch(`${BASE}/api/health`)
    .then((r) => r.json())
    .catch((e) => ({ error: String(e) }));
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
  out.steps.auth = { userId: authData.user.id, email: authData.user.email };

  const supabase = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const slug = `pkl-t7-${Date.now().toString(36)}`;
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: "PKL Task7 MLS E2E", slug })
    .select("*")
    .single();
  if (orgError) {
    out.status = "org_insert_failed";
    out.steps.org = { error: orgError.message };
    console.log(JSON.stringify(out, null, 2));
    process.exit(4);
  }
  out.steps.org = { id: org.id, slug };

  // Tenant isolation
  const otherEmail = `pkl.task07.other.${Date.now()}@example.com`;
  const otherPass = `O7-${crypto.randomUUID()}!aA1`;
  const { data: otherCreated } = await admin.auth.admin.createUser({
    email: otherEmail,
    password: otherPass,
    email_confirm: true,
  });
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
      global: { headers: { Authorization: `Bearer ${otherSession.session.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: leaked } = await other.from("organizations").select("id").eq("id", org.id);
    rlsOk = Array.isArray(leaked) && leaked.length === 0;
    out.steps.rls = { otherSeesOrg: leaked?.length ?? null, pass: rlsOk };
    await admin.auth.admin.deleteUser(otherCreated.user.id).catch(() => {});
  }

  const propRes = await api("POST", "/api/properties", {
    json: {
      organizationId: org.id,
      name: "Task7 MLS Subject",
      addressLine1: "30 Veterans Memorial Parkway",
      city: "East Providence",
      state: "RI",
      postalCode: "02914",
      country: "US",
    },
  });
  if (!propRes.ok) {
    out.status = "property_failed";
    out.steps.property = propRes;
    console.log(JSON.stringify(out, null, 2));
    process.exit(5);
  }
  const propertyId = propRes.data?.data?.property?.id;
  out.steps.property = { id: propertyId, status: propRes.status };

  const utRes = await api("POST", `/api/properties/${propertyId}/unit-types`, {
    json: { label: "2BR", beds: 2, baths: 1 },
  });
  const unitTypeId = utRes.data?.data?.unitType?.id;
  if (!utRes.ok || !unitTypeId) {
    out.status = "unit_type_failed";
    out.steps.unitType = utRes;
    console.log(JSON.stringify(out, null, 2));
    process.exit(6);
  }
  out.steps.unitType = { id: unitTypeId };

  const reportRes = await api("POST", `/api/properties/${propertyId}/reports`, {
    json: {
      unitTypeId,
      title: "Task7 MLS E2E",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-14",
      preparedBy: "task07-e2e",
    },
  });
  const reportRunId = reportRes.data?.data?.report?.id;
  if (!reportRes.ok || !reportRunId) {
    out.status = "report_failed";
    out.steps.report = reportRes;
    console.log(JSON.stringify(out, null, 2));
    process.exit(7);
  }
  out.steps.report = { id: reportRunId };

  async function upload(filePath, sourceType) {
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

  function summarizeUpload(res) {
    const payload = res.data?.data ?? res.data;
    const summary = payload?.parseSummary ?? payload ?? {};
    return {
      status: res.status,
      ok: res.ok,
      documentId: payload?.document?.id ?? summary.documentId,
      listingCount: summary.listingCount,
      extractionCount: summary.extractionCount,
      photoStoredCount: summary.photoStoredCount,
      geocodeAttempted: summary.geocodeAttempted,
      geocodeOk: summary.geocodeOk,
      conflictCount: summary.conflictCount,
      matchSummary: summary.matchSummary,
      dialect: summary.dialect,
      parseStatus: payload?.document?.parse_status,
      error: res.data?.error,
    };
  }

  const ctUpload = await upload(CT_PDF, "mls_ct_pdf");
  out.steps.ctUpload = summarizeUpload(ctUpload);
  log("ctUpload", out.steps.ctUpload);

  const riUpload = await upload(RI_PDF, "mls_ri_pdf");
  out.steps.riUpload = summarizeUpload(riUpload);
  log("riUpload", out.steps.riUpload);

  // Persist reload
  const ctDocId = out.steps.ctUpload.documentId;
  const { data: ctExtractions } = await supabase
    .from("extracted_values")
    .select("id, field_key, review_status, normalized_value, row_ref")
    .eq("source_document_id", ctDocId)
    .like("field_key", "mls.listing.%");
  out.steps.ctReload = {
    count: ctExtractions?.length ?? 0,
    refs: (ctExtractions ?? []).map((e) => ({
      mls: e.row_ref,
      rent: e.normalized_value?.rent,
      sqft: e.normalized_value?.sqft,
      unit: e.normalized_value?.address?.unit,
      review: e.review_status,
    })),
  };

  const thirdAve = (ctExtractions ?? []).find((e) => e.row_ref === "24221286");
  if (thirdAve) {
    const accept = await api("POST", `/api/extractions/${thirdAve.id}/review`, {
      json: {
        decision: "accepted",
        reason: "task07 mls-only approve",
        unitTypeId,
        matchTier: "strongest",
      },
    });
    const acceptPayload = accept.data?.data ?? accept.data;
    out.steps.acceptCt = {
      status: accept.status,
      ok: accept.ok,
      comparableId:
        acceptPayload?.comparablePropertyId ??
        acceptPayload?.comparable_property_id ??
        acceptPayload?.extraction?.comparable_property_id ??
        null,
      error: accept.data?.error,
      keys: acceptPayload && typeof acceptPayload === "object" ? Object.keys(acceptPayload) : [],
    };
    log("acceptCt", out.steps.acceptCt);
  } else {
    out.steps.acceptCt = { ok: false, error: "listing_24221286_missing" };
  }

  // Duplicate prevention: re-upload CT should match existing MLS#
  const ctRe = await upload(CT_PDF, "mls_ct_pdf");
  out.steps.ctReuploadMatch = summarizeUpload(ctRe);

  // Synthetic >$25 conflict: seed approved rentometer peer on same comparable, then resolve
  let conflictResolve = { skipped: true };
  const comparableId = out.steps.acceptCt?.comparableId;
  if (comparableId) {
    const { data: peer, error: peerErr } = await admin
      .from("comparable_unit_data")
      .insert({
        organization_id: org.id,
        comparable_property_id: comparableId,
        unit_type_id: unitTypeId,
        source_type: "rentometer",
        status: "approved",
        rent_min: 1500,
        rent_max: 1500,
      })
      .select("id")
      .single();
    out.steps.syntheticPeer = { ok: !peerErr, id: peer?.id, error: peerErr?.message };

    const { data: conflict, error: cErr } = await admin
      .from("source_value_conflicts")
      .insert({
        organization_id: org.id,
        property_id: propertyId,
        unit_type_id: unitTypeId,
        comparable_property_id: comparableId,
        field_key: "rent",
        left_source: "rentometer",
        right_source: "mls",
        left_value: { rent: 1500 },
        right_value: { rent: 1400, mlsNumber: "24221286" },
        absolute_delta: 100,
        status: "pending",
      })
      .select("id")
      .single();
    out.steps.syntheticConflict = { ok: !cErr, id: conflict?.id, error: cErr?.message };

    if (conflict?.id) {
      const resolve = await api("POST", `/api/conflicts/${conflict.id}/resolve`, {
        json: {
          status: "resolved",
          chosenRent: 1400,
          verifiedListingSource: "mls",
          reviewerNote: "task07 synthetic >$25 resolve prefer MLS",
        },
      });
      conflictResolve = {
        skipped: false,
        status: resolve.status,
        ok: resolve.ok,
        error: resolve.data?.error,
        bodyKeys: resolve.data && typeof resolve.data === "object" ? Object.keys(resolve.data) : [],
      };
    }
  }
  out.steps.conflictResolve = conflictResolve;
  log("conflictResolve", conflictResolve);

  // Photos privacy
  const { data: photos } = await supabase
    .from("report_photos")
    .select("id, storage_bucket, storage_path, source, width, height")
    .eq("property_id", propertyId)
    .eq("source", "mls")
    .limit(20);
  out.steps.photos = {
    count: photos?.length ?? 0,
    sample: (photos ?? []).slice(0, 3),
  };
  let privateOk = true;
  if (photos?.[0]) {
    const pub = await fetch(
      `${URL}/storage/v1/object/public/${photos[0].storage_bucket}/${photos[0].storage_path}`,
    );
    privateOk = pub.status !== 200;
    out.steps.privatePhotoProbe = { status: pub.status, pass: privateOk };
  }

  // Manual photo + crop metadata
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const photoForm = new FormData();
  photoForm.set("file", new Blob([tinyPng], { type: "image/png" }), "placeholder.png");
  photoForm.set("source", "placeholder");
  photoForm.set(
    "cropMetadata",
    JSON.stringify({ aspect: "3:2", x: 0, y: 0, width: 300, height: 200 }),
  );
  if (comparableId) photoForm.set("comparablePropertyId", comparableId);
  const manualPhoto = await api("POST", `/api/properties/${propertyId}/photos`, {
    form: photoForm,
  });
  out.steps.manualPhoto = {
    status: manualPhoto.status,
    ok: manualPhoto.ok,
    crop: manualPhoto.data?.data?.photo?.crop_metadata ?? manualPhoto.data?.photo?.crop_metadata,
    error: manualPhoto.data?.error,
  };

  // Reload accepted comparable
  const { data: comps } = await supabase
    .from("comparable_properties")
    .select("id, mls_number, address_line1, is_active")
    .eq("subject_property_id", propertyId);
  const { data: units } = await supabase
    .from("comparable_unit_data")
    .select("id, source_type, status, rent_min")
    .eq("organization_id", org.id);

  out.steps.comps = comps;
  out.steps.unitData = units;

  const ctOk =
    out.steps.ctUpload.ok &&
    out.steps.ctUpload.listingCount === 3 &&
    out.steps.ctReload.count === 3 &&
    out.steps.acceptCt?.ok;
  const riOk =
    out.steps.riUpload.ok &&
    out.steps.riUpload.listingCount >= 4 &&
    out.steps.riUpload.listingCount <= 5 &&
    (out.steps.riUpload.photoStoredCount ?? 0) <= 5 * 4;
  const refsOk =
    out.steps.ctReload.refs?.find((r) => r.mls === "24221286")?.rent === 1400 &&
    out.steps.ctReload.refs?.find((r) => r.mls === "24221286")?.sqft === 700 &&
    out.steps.ctReload.refs?.find((r) => r.mls === "24215401")?.rent === 1850 &&
    out.steps.ctReload.refs?.find((r) => r.mls === "24216692")?.rent === 1900;

  out.status =
    ctOk && riOk && refsOk && rlsOk && privateOk
      ? out.geocodeKeyPresent
        ? "pass"
        : "pass_geocode_skipped"
      : "partial_or_fail";
  out.summary = { ctOk, riOk, refsOk, rlsOk, privateOk, geocodeKeyPresent: out.geocodeKeyPresent };
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.status.startsWith("pass") ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
