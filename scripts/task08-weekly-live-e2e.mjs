import { loadDotEnv, clientSourcePath } from "./lib/local-e2e-env.mjs";
/**
 * Task #8 live E2E — Zillow + Apartments weekly metrics persistence.
 * Requires: npm run dev, .env, task05 user JSON. No new migration apply.
 */
import fs from "fs";
import path from "path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

loadDotEnv();

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
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
const Z855 =
  clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "Zillow__Listing_performance__1_.xlsx");
const A855 =
  clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "Apartment_com-_855_Providence_St.xlsx");
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
          if (!value) cookieJar.delete(name);
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

async function main() {
  const out = { status: "running", steps: {} };
  if (!fs.existsSync(Z855) || !fs.existsSync(A855)) {
    out.status = "blocked_missing_xlsx";
    console.log(JSON.stringify(out, null, 2));
    process.exit(2);
  }
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  out.steps.health = health;
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
  if (authError || !authData.session) {
    out.status = "auth_failed";
    out.steps.auth = { error: authError?.message };
    console.log(JSON.stringify(out, null, 2));
    process.exit(3);
  }
  const supabase = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const slug = `pkl-t8-${Date.now().toString(36)}`;
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: "PKL Task8 Weekly E2E", slug })
    .select("*")
    .single();
  if (orgError) {
    out.status = "org_failed";
    out.steps.org = { error: orgError.message };
    console.log(JSON.stringify(out, null, 2));
    process.exit(4);
  }

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
  const propertyId = propRes.data?.data?.property?.id;
  if (!propRes.ok || !propertyId) {
    out.status = "property_failed";
    out.steps.property = propRes;
    console.log(JSON.stringify(out, null, 2));
    process.exit(5);
  }
  out.steps.property = { id: propertyId };

  async function upload(filePath, sourceType) {
    const buf = fs.readFileSync(filePath);
    const form = new FormData();
    form.set("file", new Blob([buf]), path.basename(filePath));
    form.set("sourceType", sourceType);
    form.set("organizationId", org.id);
    form.set("propertyId", propertyId);
    return api("POST", "/api/uploads", { form });
  }

  const zillow = await upload(Z855, "zillow_xlsx");
  const zPayload = zillow.data?.data ?? zillow.data;
  out.steps.zillow = {
    status: zillow.status,
    ok: zillow.ok,
    documentId: zPayload?.document?.id,
    summary: zPayload?.parseSummary,
    error: zillow.data?.error,
  };

  const apts = await upload(A855, "apartments_xlsx");
  const aPayload = apts.data?.data ?? apts.data;
  out.steps.apartments = {
    status: apts.status,
    ok: apts.ok,
    documentId: aPayload?.document?.id,
    summary: aPayload?.parseSummary,
    error: apts.data?.error,
  };

  const agent = await api("POST", `/api/properties/${propertyId}/weekly-metrics`, {
    json: {
      weekStart: "2026-11-04",
      weekEnd: "2026-11-10",
      toursScheduled: 2,
      toursCompleted: 1,
      applicationsReceived: null,
      weeklyComments: "task08 agent comments",
      prospectFeedbackSummary: "Prospect asked about parking; no PII stored",
      actionsPlannedNextWeek: "Follow up mid-week",
    },
  });
  const agentWeek = agent.data?.data?.week ?? agent.data?.week;
  out.steps.agent = {
    status: agent.status,
    ok: agent.ok,
    error: agent.data?.error,
    dedicatedColumns: {
      tours_scheduled: agentWeek?.tours_scheduled ?? null,
      tours_completed: agentWeek?.tours_completed ?? null,
      applications_received: agentWeek?.applications_received ?? null,
      feedback_summary: agentWeek?.feedback_summary ?? null,
      actions_planned: agentWeek?.actions_planned ?? null,
      staff_notes_has_agent_marker:
        typeof agentWeek?.staff_notes === "string" &&
        agentWeek.staff_notes.includes("---agent---"),
    },
  };

  const list = await api("GET", `/api/properties/${propertyId}/weekly-metrics`);
  const weeks = list.data?.data?.weeks ?? list.data?.weeks ?? [];
  const hasPlatformMetrics = (metrics) =>
    Boolean(
      metrics &&
        Object.values(metrics).some((v) => typeof v === "number" && Number.isFinite(v)),
    );
  out.steps.reload = {
    status: list.status,
    ok: list.ok,
    weekCount: weeks.length,
    sample: weeks.slice(0, 3).map((w) => ({
      weekStart: w.weekStart ?? w.week_start,
      weekEnd: w.weekEnd ?? w.week_end,
      hasZillow: hasPlatformMetrics(w.zillow?.metrics ?? w.zillow_metrics?.metrics),
      hasApts: hasPlatformMetrics(w.apartments?.metrics ?? w.apartments_metrics?.metrics),
      toursScheduled: w.agent?.toursScheduled ?? w.tours_scheduled ?? null,
      agentProvided: w.agent?.provided ?? false,
      conversion: w.derived?.zillowConversionWeek ?? null,
      aptsTours: w.apartments?.metrics?.tours ?? null,
      aptsApps: w.apartments?.metrics?.applications ?? null,
    })),
    privacyNote: list.data?.data?.privacyNote ?? list.data?.privacyNote,
    migrationNote: list.data?.data?.migrationNote ?? list.data?.migrationNote,
  };

  // Cross-tenant
  const otherEmail = `pkl.task08.other.${Date.now()}@example.com`;
  const otherPass = `O8-${crypto.randomUUID()}!aA1`;
  const { data: otherCreated } = await admin.auth.admin.createUser({
    email: otherEmail,
    password: otherPass,
    email_confirm: true,
  });
  let rlsOk = false;
  if (otherCreated?.user) {
    const otherAuth = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: otherSession } = await otherAuth.auth.signInWithPassword({
      email: otherEmail,
      password: otherPass,
    });
    const other = createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${otherSession.session.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: leaked } = await other.from("weekly_metrics").select("id").eq("property_id", propertyId);
    rlsOk = Array.isArray(leaked) && leaked.length === 0;
    out.steps.rls = { otherSeesWeekly: leaked?.length ?? null, pass: rlsOk };
    await admin.auth.admin.deleteUser(otherCreated.user.id).catch(() => {});
  }

  // Re-upload zillow should not wipe apartments/agent on matched week
  const zillow2 = await upload(Z855, "zillow_xlsx");
  const list2 = await api("GET", `/api/properties/${propertyId}/weekly-metrics`);
  const weeks2 = list2.data?.data?.weeks ?? list2.data?.weeks ?? [];
  const weekWithAgent = weeks2.find(
    (w) =>
      (w.agent?.toursScheduled === 2 || w.tours_scheduled === 2) &&
      (w.weekStart === "2026-11-04" || w.week_start === "2026-11-04"),
  );
  const comments =
    weekWithAgent?.agent?.weeklyComments ??
    weekWithAgent?.staffNotesFreeform ??
    weekWithAgent?.staff_notes ??
    "";
  const aptsStillPresent = hasPlatformMetrics(
    weekWithAgent?.apartments?.metrics ?? weekWithAgent?.apartments_metrics?.metrics,
  );
  const storage = weekWithAgent?.storage ?? {};
  out.steps.reuploadPreservesAgent = {
    zillowOk: zillow2.ok,
    agentStillPresent: Boolean(weekWithAgent),
    staffNotes: typeof comments === "string" && comments.includes("task08"),
    apartmentsStillPresent: aptsStillPresent,
    feedback: weekWithAgent?.agent?.prospectFeedbackSummary ?? null,
    dedicatedNullApps: storage.applicationsReceived === null,
    dedicatedFeedback:
      typeof storage.feedbackSummary === "string" &&
      storage.feedbackSummary.includes("parking"),
    dedicatedActions:
      typeof storage.actionsPlanned === "string" &&
      storage.actionsPlanned.includes("Follow up"),
    dedicatedTours: storage.toursScheduled === 2,
  };

  const payloadHasPii = JSON.stringify(weeks2).match(/@gmail|@yahoo|\(\d{3}\)/i);
  out.steps.privacyScan = { pass: !payloadHasPii };

  const reloadLooksLive =
    Array.isArray(weeks) &&
    weeks.some((w) => hasPlatformMetrics(w.zillow?.metrics)) &&
    weeks.some((w) => hasPlatformMetrics(w.apartments?.metrics));

  const dedicatedOk =
    out.steps.agent.dedicatedColumns?.tours_scheduled === 2 &&
    out.steps.agent.dedicatedColumns?.applications_received === null &&
    typeof out.steps.agent.dedicatedColumns?.feedback_summary === "string" &&
    out.steps.agent.dedicatedColumns?.staff_notes_has_agent_marker === false &&
    out.steps.reuploadPreservesAgent.dedicatedNullApps &&
    out.steps.reuploadPreservesAgent.dedicatedFeedback &&
    out.steps.reuploadPreservesAgent.dedicatedActions &&
    out.steps.reuploadPreservesAgent.dedicatedTours;

  out.status =
    out.steps.zillow.ok &&
    out.steps.apartments.ok &&
    out.steps.agent.ok &&
    out.steps.reload.ok &&
    reloadLooksLive &&
    out.steps.reuploadPreservesAgent.agentStillPresent &&
    out.steps.reuploadPreservesAgent.staffNotes &&
    out.steps.reuploadPreservesAgent.apartmentsStillPresent &&
    dedicatedOk &&
    rlsOk &&
    out.steps.privacyScan.pass
      ? "pass"
      : "partial_or_fail";
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.status === "pass" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
