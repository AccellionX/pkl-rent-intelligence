#!/usr/bin/env node
import { loadDotEnv, clientSourcePath } from "./lib/local-e2e-env.mjs";
/**
 * Task #17A — controlled full report on isolated Dbg Org property.
 * Does NOT approve 855 client comps. Uses authorized local source files only.
 */
import fs from "fs";
import path from "path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

loadDotEnv();

function loadEnv() {
  for (const line of fs.readFileSync(path.join(process.cwd(), ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userJsonPath =
  process.env.PKL_TASK05_USER_JSON;
const creds = JSON.parse(fs.readFileSync(userJsonPath || (() => { throw new Error("Set PKL_TASK05_USER_JSON to a local credentials JSON path"); })(), "utf8"));
const jar = new Map();

const RI_MLS =
  clientSourcePath("30 Veterans 1BR report - source files", "05 RI MLS CMA report 11-01-2026.pdf");
const RENTO_CSV =
  path.join(process.cwd(), "tests/fixtures/rentometer/synthetic-2bed.csv");
const PHOTO =
  clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "855_5.jpg");
const ZILLOW =
  clientSourcePath("30 Veterans 1BR report - source files", "03 Zillow listing performance 10-22-2026.xlsx");
const APTS =
  clientSourcePath("30 Veterans 1BR report - source files", "04 Apartments.com report 10-22-2026.xlsx");

function cookie() {
  return [...jar.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
}
function userClient() {
  return createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return [...jar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(a) {
        for (const { name, value } of a) {
          if (!value) jar.delete(name);
          else jar.set(name, value);
        }
      },
    },
  });
}
async function api(method, pathname, { json, form, headers: extra } = {}) {
  const headers = { Cookie: cookie(), ...(extra || {}) };
  let body;
  if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  if (form) body = form;
  const res = await fetch(`${BASE}${pathname}`, { method, headers, body });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function upload(propertyId, sourceType, filePath, unitTypeId) {
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("organizationId", ORG);
  form.append("propertyId", propertyId);
  form.append("sourceType", sourceType);
  if (unitTypeId) form.append("unitTypeId", unitTypeId);
  form.append("file", new Blob([buf]), path.basename(filePath));
  return api("POST", "/api/uploads", { form });
}

let ORG = "522e05ac-8889-4840-bf5b-a74ec4223e4c"; // Dbg Org

async function main() {
  const out = { status: "partial", steps: {}, note: "controlled_dbg_org_only" };
  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = userClient();
  let { error } = await auth.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error) {
    await admin.auth.admin.updateUserById(creds.userId, {
      password: creds.password,
      email_confirm: true,
    });
    ({ error } = await auth.auth.signInWithPassword({
      email: creds.email,
      password: creds.password,
    }));
  }
  if (error) {
    out.status = "auth_failed";
    console.log(JSON.stringify(out, null, 2));
    process.exit(3);
  }

  await admin.from("organization_members").upsert(
    { organization_id: ORG, user_id: creds.userId, role: "admin" },
    { onConflict: "organization_id,user_id" },
  );

  const stamp = Date.now().toString(36).slice(-6); // short alphanumeric — avoids phone-like digit runs
  const created = await api("POST", "/api/properties", {
    json: {
      organizationId: ORG,
      name: `Seventeen A Controlled ${stamp}`,
      addressLine1: `${120 + (Date.now() % 50)} Controlled Ave`,
      city: "Providence",
      state: "RI",
      postalCode: "02903",
      confirmDuplicateAddress: true,
    },
  });
  out.steps.createProperty = { ok: created.ok, status: created.status };
  const propertyId = created.data?.data?.property?.id;
  if (!propertyId) {
    out.error = created.data?.error || "property create failed";
    console.log(JSON.stringify(out, null, 2));
    process.exit(4);
  }
  out.propertyId = propertyId;

  const ut = await api("POST", `/api/properties/${propertyId}/unit-types`, {
    json: { label: "2BR Controlled", beds: 2, baths: 1 },
  });
  const unitTypeId = ut.data?.data?.unitType?.id || ut.data?.data?.id;
  out.steps.unitType = { ok: ut.ok, unitTypeId };

  // Uploads (authorized local files)
  const upRento = await upload(propertyId, "rentometer_csv", RENTO_CSV, unitTypeId);
  out.steps.uploadRentometer = {
    ok: upRento.ok,
    status: upRento.status,
    extractions: upRento.data?.data?.extractions?.length ?? upRento.data?.extractions?.length,
    parse: upRento.data?.data?.parseSummary ?? upRento.data?.parseSummary ?? null,
    error: upRento.data?.error,
  };
  const upMls = await upload(propertyId, "mls_ri_pdf", RI_MLS, unitTypeId);
  out.steps.uploadMlsRi = {
    ok: upMls.ok,
    status: upMls.status,
    extractions: upMls.data?.data?.extractions?.length ?? upMls.data?.extractions?.length,
    parse: upMls.data?.data?.parseSummary ?? upMls.data?.parseSummary ?? null,
    error: upMls.data?.error,
  };
  out.steps.uploadZillow = await upload(propertyId, "zillow_xlsx", ZILLOW, null).then((r) => ({
    ok: r.ok,
    status: r.status,
  }));
  out.steps.uploadApts = await upload(propertyId, "apartments_xlsx", APTS, null).then((r) => ({
    ok: r.ok,
    status: r.status,
  }));

  // List extractions / comps for controlled accept
  await new Promise((r) => setTimeout(r, 1500));
  const { data: docs } = await admin
    .from("source_documents")
    .select("id")
    .eq("property_id", propertyId);
  const docIds = (docs || []).map((d) => d.id);
  const { data: extractions, error: extErr } = docIds.length
    ? await admin
        .from("extracted_values")
        .select("id, field_key, review_status, raw_value, normalized_value, source_document_id, comparable_property_id")
        .in("source_document_id", docIds)
        .limit(200)
    : { data: [], error: null };

  // Prefer rentometer candidate.row.* and mls.listing.* pending rows
  const pending = (extractions || []).filter(
    (e) =>
      e.review_status === "pending" &&
      (/^candidate\.row\.|^mls\.listing\.|^hellodata\.comp\./i.test(
        e.field_key || "",
      ) ||
        e.comparable_property_id),
  );
  out.steps.extractionPending = pending.length;
  out.steps.extractionDiag = {
    docs: docIds.length,
    total: (extractions || []).length,
    err: extErr?.message?.slice(0, 120) || null,
    fieldKeys: [...new Set((extractions || []).map((e) => e.field_key))].slice(0, 12),
  };
  let accepted = 0;
  const acceptErrors = [];
  // Prefer rentometer candidate.row.* (synthetic fixtures) over Veterans MLS listings
  const ordered = [
    ...pending.filter((e) => String(e.field_key).startsWith("candidate.row.")),
    ...pending.filter((e) => !String(e.field_key).startsWith("candidate.row.")),
  ];
  for (const row of ordered.slice(0, 6)) {
    const rev = await api("POST", `/api/extractions/${row.id}/review`, {
      json: {
        decision: "accepted",
        matchTier: accepted < 3 ? "strongest" : "moderate",
        reason: "Task17A controlled accept on Dbg Org synthetic property",
        unitTypeId,
      },
    });
    if (rev.ok) accepted += 1;
    else acceptErrors.push({ id: row.id, status: rev.status, err: rev.data?.error });
  }
  // Exclude one controlled candidate (UI parity: Accept + Exclude)
  let excluded = 0;
  const toExclude = ordered.find(
    (e) =>
      String(e.field_key).startsWith("candidate.row.") &&
      !acceptErrors.some((x) => x.id === e.id),
  );
  // pick a high-index row that we did not just accept
  const excludeTarget = ordered
    .filter((e) => String(e.field_key).startsWith("candidate.row."))
    .slice(6, 8)[0];
  if (excludeTarget) {
    const ex = await api("POST", `/api/extractions/${excludeTarget.id}/review`, {
      json: {
        decision: "rejected",
        reason: "Task17A controlled exclude — synthetic outlier",
        unitTypeId,
      },
    });
    if (ex.ok) excluded = 1;
  }
  out.steps.controlledAccepts = {
    attempted: Math.min(6, ordered.length),
    accepted,
    excluded,
    errors: acceptErrors.slice(0, 3),
  };
  void toExclude;

  // Approve unit rows created from accepted reviews (API only — no direct DB writes)
  const { data: comps } = await admin
    .from("comparable_properties")
    .select("id")
    .eq("subject_property_id", propertyId);
  const compIds = (comps || []).map((c) => c.id);
  let approvedUnits = 0;
  if (compIds.length) {
    const { data: cud } = await admin
      .from("comparable_unit_data")
      .select("id, status")
      .in("comparable_property_id", compIds)
      .limit(20);
    for (const u of cud || []) {
      if (u.status === "approved") {
        approvedUnits += 1;
        continue;
      }
      const patch = await api("PATCH", `/api/comparable-unit-data/${u.id}`, {
        json: { status: "approved", matchTier: "strongest" },
      });
      if (patch.ok) approvedUnits += 1;
    }
  }
  out.steps.approveUnits = { approvedUnits, comps: compIds.length };

  // Photo upload via API (browser verifies UI separately)
  if (fs.existsSync(PHOTO)) {
    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(PHOTO)]), "controlled-subject.jpg");
    const photo = await api("POST", `/api/properties/${propertyId}/photos`, { form });
    out.steps.photo = { ok: photo.ok, status: photo.status };
  }

  const report = await api("POST", `/api/properties/${propertyId}/reports`, {
    json: {
      unitTypeId,
      title: "Task17A Controlled Full Report",
      periodStart: "2026-10-15",
      periodEnd: "2026-10-22",
      preparedBy: "Task17A",
    },
  });
  const reportId = report.data?.data?.report?.id;
  out.steps.report = { ok: report.ok, reportId };
  if (!reportId) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(5);
  }

  await api("PATCH", `/api/reports/${reportId}`, {
    json: { recommendedRentLow: 1900, recommendedRentHigh: 2050 },
  });

  const assemble = await api("GET", `/api/reports/${reportId}/assemble`);
  const payload = assemble.data?.data?.payload;
  out.steps.assemble = {
    ok: assemble.ok,
    status: payload?.status,
    eligible: payload?.pricing?.stats?.eligibleGroupedCount ?? null,
    blended: payload?.pricing?.stats?.blendedAverageRent ?? null,
  };

  const narr = await api("POST", `/api/reports/${reportId}/narrative`, {
    json: { force: true },
    headers: { "Idempotency-Key": `t17a-narr-${reportId}` },
  });
  out.steps.narrative = {
    ok: narr.ok,
    usedLiveClaude: Boolean(narr.data?.data?.usedLiveClaude),
    model: narr.data?.data?.narrative?.model ?? null,
  };

  const approve = await api("POST", `/api/reports/${reportId}/narrative/approve`);
  out.steps.approveNarrative = { ok: approve.ok };

  const snap = await api("POST", `/api/reports/${reportId}/snapshot`);
  out.steps.snapshot = {
    ok: snap.ok,
    version: snap.data?.data?.snapshot?.version,
    error: snap.data?.error,
  };

  const draftPdf = await api("POST", `/api/reports/${reportId}/pdf`, {
    json: { mode: "draft" },
  });
  out.steps.draftPdf = {
    ok: draftPdf.ok,
    pages: draftPdf.data?.data?.pageCount ?? draftPdf.data?.data?.pages ?? null,
    engine: draftPdf.data?.data?.engine ?? null,
    path: draftPdf.data?.data?.storagePath ?? draftPdf.data?.data?.path ?? null,
  };

  // Drive root + property folder if configured
  const root = await api("POST", "/api/drive/root", {
    json: { organizationId: ORG, create: true, folderName: "PKL DEV Reports" },
  });
  out.steps.driveRoot = {
    ok: root.ok,
    hasRoot: Boolean(root.data?.data?.drive?.hasRootFolder),
  };
  await api("POST", `/api/properties/${propertyId}/drive/create`, {
    headers: { "Idempotency-Key": `t17a-folder-${propertyId}` },
  });

  let finalized = false;
  if (snap.ok) {
    const fin = await api("POST", `/api/reports/${reportId}/pdf/finalize`, {
      headers: { "Idempotency-Key": `t17a-final-${reportId}` },
    });
    out.steps.finalize = {
      ok: fin.ok,
      status: fin.status,
      bytes: fin.data?.data?.byteLength ?? fin.data?.data?.pdfByteLength,
      error: fin.data?.error,
    };
    finalized = fin.ok;
  }

  if (finalized) {
    await api("POST", `/api/reports/${reportId}/transition`, {
      json: { toStatus: "waiting_on_review" },
    });
    const sent = await api("POST", `/api/reports/${reportId}/transition`, {
      json: { toStatus: "sent" },
    });
    out.steps.sent = {
      ok: sent.ok,
      driveBackup: sent.data?.data?.driveBackup ?? null,
    };
  }

  const driveStatus = await api("GET", `/api/reports/${reportId}/drive`);
  out.steps.driveStatus = {
    ok: driveStatus.ok,
    reportStatus: driveStatus.data?.data?.drive?.reportStatus,
    savedToDriveAt: Boolean(driveStatus.data?.data?.drive?.savedToDriveAt),
    fileName: driveStatus.data?.data?.drive?.driveFileName,
  };

  out.pdfDownloadPath = `/api/reports/${reportId}/pdf/download`;
  out.status =
    out.steps.draftPdf.ok && out.steps.narrative.ok && out.steps.assemble.ok
      ? finalized && out.steps.driveStatus.reportStatus === "saved_to_drive"
        ? "pass"
        : "partial_report_ready"
      : "partial_or_fail";

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.status.startsWith("pass") || out.status === "partial_report_ready" ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ status: "crash", error: String(e).slice(0, 300) }));
  process.exit(99);
});
