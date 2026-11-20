#!/usr/bin/env node
/**
 * Task #16 — controlled live Claude verification against Dbg Org test property.
 * Never auto-approves comps. Never logs narrative section text or API keys.
 * Live PASS only when usedLiveClaude===true and model is not a deterministic fallback.
 */
import fs from "fs";
import path from "path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

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

async function api(method, pathname, { json, headers: extra } = {}) {
  const headers = { Cookie: cookieHeader(), ...(extra || {}) };
  let body;
  if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  const res = await fetch(`${BASE}${pathname}`, { method, headers, body });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

function moneyPattern(n) {
  // Accept both 2150 and 2,150 style formatting from Claude.
  const raw = String(n);
  const withCommas = raw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return new RegExp(`\\$?\\s?(?:${raw}|${withCommas})\\b`);
}

function sectionHasRent(sections, low, high) {
  const blob = JSON.stringify(sections ?? {});
  const hasLow = moneyPattern(low).test(blob);
  const hasHigh = moneyPattern(high).test(blob);
  // Reject invented round figures that commonly appear when models hallucinate.
  const invented = /\$\s?(9999|1234|5555|7777)\b/.test(blob);
  return { hasLow, hasHigh, invented };
}

async function main() {
  const out = {
    status: "partial_or_fail",
    liveClaude: false,
    modelConfigured: process.env.ANTHROPIC_MODEL || null,
    anthropicKeyPresent: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    steps: {},
  };

  if (!URL || !ANON || !SERVICE) {
    out.error = "Missing Supabase env";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }
  if (!out.anthropicKeyPresent) {
    out.status = "blocked_missing_anthropic_key";
    console.log(JSON.stringify(out, null, 2));
    process.exit(2);
  }

  const health = await fetch(`${BASE}/api/health`)
    .then((r) => r.json())
    .catch((e) => ({ error: String(e) }));
  out.steps.health = { mode: health?.mode ?? null, ok: !health?.error };
  if (health?.mode === "demo" || health?.error) {
    out.status = "blocked_dev_server";
    console.log(JSON.stringify(out, null, 2));
    process.exit(3);
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
    process.exit(4);
  }

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId = authData.user.id;

  const { data: org } = await admin
    .from("organizations")
    .select("id, name")
    .eq("name", "Dbg Org")
    .maybeSingle();
  if (!org) {
    out.error = "Dbg Org not found";
    console.log(JSON.stringify(out, null, 2));
    process.exit(5);
  }

  await admin.from("organization_members").upsert(
    { organization_id: org.id, user_id: userId, role: "member" },
    { onConflict: "organization_id,user_id" },
  );

  const { data: property } = await admin
    .from("properties")
    .select("id, name, organization_id")
    .eq("organization_id", org.id)
    .eq("name", "Fourteen B Test Property")
    .maybeSingle();
  if (!property) {
    out.error = "Fourteen B Test Property not found";
    console.log(JSON.stringify(out, null, 2));
    process.exit(6);
  }

  let { data: unitTypes } = await admin
    .from("unit_types")
    .select("id, label")
    .eq("property_id", property.id)
    .limit(5);
  let unitTypeId = unitTypes?.[0]?.id;
  if (!unitTypeId) {
    const { data: ut } = await admin
      .from("unit_types")
      .insert({
        organization_id: org.id,
        property_id: property.id,
        label: "2BR",
        beds: 2,
        baths: 2,
      })
      .select("*")
      .single();
    unitTypeId = ut.id;
  }

  const created = await api("POST", `/api/properties/${property.id}/reports`, {
    json: {
      unitTypeId,
      title: "Task16 Claude live verification",
      periodStart: "2026-11-03",
      periodEnd: "2026-11-10",
      preparedBy: "Task16",
    },
  });
  out.steps.createReport = { status: created.status, ok: created.ok };
  const reportId = created.data?.data?.report?.id;
  if (!reportId) {
    out.error = "report create failed";
    out.steps.createReport.error = created.data?.error;
    console.log(JSON.stringify(out, null, 2));
    process.exit(7);
  }
  out.reportId = reportId;

  const RENT_LOW = 2150;
  const RENT_HIGH = 2250;
  const rent = await api("PATCH", `/api/reports/${reportId}`, {
    json: { recommendedRentLow: RENT_LOW, recommendedRentHigh: RENT_HIGH },
  });
  out.steps.setRent = { status: rent.status, ok: rent.ok };

  const assemble = await api("GET", `/api/reports/${reportId}/assemble`);
  const payload = assemble.data?.data?.payload;
  const payloadJson = JSON.stringify(payload ?? {});
  out.steps.assemble = {
    status: assemble.status,
    ok: assemble.ok,
    assemblyStatus: payload?.status ?? null,
    recommended: [
      payload?.pricing?.recommendedRentLow,
      payload?.pricing?.recommendedRentHigh,
    ],
    privacyOk: !/@gmail|@yahoo|\(\d{3}\)\s?\d{3}/i.test(payloadJson),
  };

  const narrative = await api("POST", `/api/reports/${reportId}/narrative`, {
    json: { preserveUserEdits: false, force: true },
    headers: { "Idempotency-Key": `task16-narr-${reportId}-1` },
  });
  const narr = narrative.data?.data?.narrative;
  const usedLive = Boolean(narrative.data?.data?.usedLiveClaude);
  const model = narr?.model ?? null;
  const isFallback = typeof model === "string" && model.startsWith("deterministic-");
  const figureCheck = sectionHasRent(narr?.sections, RENT_LOW, RENT_HIGH);
  out.steps.narrative = {
    status: narrative.status,
    ok: narrative.ok,
    usedLiveClaude: usedLive,
    model,
    isFallback,
    claudeUsage: narrative.data?.data?.claudeUsage ?? null,
    figureCheck,
    // length-only — never dump section text
    sectionLengths: narr?.sections
      ? Object.fromEntries(
          Object.entries(narr.sections).map(([k, v]) => [k, String(v ?? "").length]),
        )
      : null,
    error: narrative.data?.error ?? null,
  };
  out.liveClaude = usedLive && !isFallback;

  // Duplicate paid-request guard: same idempotency key must replay, not rebill.
  const replay = await api("POST", `/api/reports/${reportId}/narrative`, {
    json: { preserveUserEdits: false, force: true },
    headers: { "Idempotency-Key": `task16-narr-${reportId}-1` },
  });
  out.steps.idempotentReplay = {
    status: replay.status,
    ok: replay.ok,
    sameModel: replay.data?.data?.narrative?.model === model,
  };

  const edited = await api("PATCH", `/api/reports/${reportId}/narrative`, {
    json: {
      sections: {
        pricingExplanation: "HUMAN_EDIT_MARKER Task16 controlled edit — keep on regenerate.",
      },
    },
  });
  out.steps.edit = { status: edited.status, ok: edited.ok };

  const regen = await api("POST", `/api/reports/${reportId}/narrative`, {
    json: { preserveUserEdits: true, force: true },
    headers: { "Idempotency-Key": `task16-narr-${reportId}-2` },
  });
  const kept = String(
    regen.data?.data?.narrative?.sections?.pricingExplanation ?? "",
  ).includes("HUMAN_EDIT_MARKER");
  out.steps.regeneratePreserve = {
    status: regen.status,
    ok: regen.ok,
    preservedUserEdit: kept,
    usedLiveClaude: Boolean(regen.data?.data?.usedLiveClaude),
  };

  const approve = await api("POST", `/api/reports/${reportId}/narrative/approve`);
  out.steps.approve = {
    status: approve.status,
    ok: approve.ok,
    narrativeStatus: approve.data?.data?.narrative?.status ?? null,
  };

  // Stale: change rent then approve should fail until regenerate
  await api("PATCH", `/api/reports/${reportId}`, {
    json: { recommendedRentLow: 2160, recommendedRentHigh: 2260 },
  });
  // Force fingerprint change by regenerating assemble view; approve without regen
  const staleApprove = await api("POST", `/api/reports/${reportId}/narrative/approve`);
  out.steps.staleApproveBlocked = {
    status: staleApprove.status,
    blocked: !staleApprove.ok,
  };

  out.status =
    out.liveClaude &&
    out.steps.createReport.ok &&
    out.steps.setRent.ok &&
    out.steps.assemble.ok &&
    out.steps.assemble.privacyOk &&
    out.steps.narrative.ok &&
    figureCheck.hasLow &&
    figureCheck.hasHigh &&
    !figureCheck.invented &&
    out.steps.edit.ok &&
    kept &&
    out.steps.approve.ok &&
    out.steps.staleApproveBlocked.blocked
      ? "pass"
      : out.liveClaude
        ? "partial_live_claude"
        : "fail_or_fallback";

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.status === "pass" ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ status: "crash", error: String(e).slice(0, 240) }));
  process.exit(99);
});
