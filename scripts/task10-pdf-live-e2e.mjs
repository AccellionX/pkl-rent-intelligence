#!/usr/bin/env node
import { loadDotEnv, clientSourcePath } from "./lib/local-e2e-env.mjs";
/**
 * Task #10 live E2E — draft PDF + finalization block without approved comps.
 * Does not auto-approve comps. Does not claim visual parity with 855 reference.
 */
import fs from "fs";
import path from "path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";

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
const userJsonPath =
  process.env.PKL_TASK05_USER_JSON;
const creds = JSON.parse(fs.readFileSync(userJsonPath || (() => { throw new Error("Set PKL_TASK05_USER_JSON to a local credentials JSON path"); })(), "utf8"));
const cookieJar = new Map();

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

async function api(method, pathname, { json } = {}) {
  const headers = { Cookie: [...cookieJar.entries()].map(([n, v]) => `${n}=${v}`).join("; ") };
  let body;
  if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  const res = await fetch(`${BASE}${pathname}`, { method, headers, body });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const out = { status: "partial_or_fail", steps: {}, visualParity: "not_claimed" };
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  out.steps.health = health;
  if (health?.mode !== "live") {
    out.status = "blocked_dev_server";
    console.log(JSON.stringify(out, null, 2));
    process.exit(2);
  }

  const auth = userClient();
  const { data: authData, error: authError } = await auth.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (authError || !authData.session) {
    out.status = "auth_failed";
    console.log(JSON.stringify(out, null, 2));
    process.exit(3);
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const userId = authData.user.id;

  const { data: props } = await admin
    .from("properties")
    .select("id, organization_id, address_line1")
    .ilike("address_line1", "%855%Providence%")
    .limit(20);
  let best = props?.[0];
  let bestWeeks = -1;
  for (const p of props ?? []) {
    const { count } = await admin
      .from("weekly_metrics")
      .select("id", { count: "exact", head: true })
      .eq("property_id", p.id);
    if ((count ?? 0) > bestWeeks) {
      bestWeeks = count ?? 0;
      best = p;
    }
  }
  if (!best) {
    out.error = "no 855 property";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }
  await admin.from("organization_members").upsert(
    { organization_id: best.organization_id, user_id: userId, role: "member" },
    { onConflict: "organization_id,user_id" },
  );

  const { data: unitTypes } = await admin
    .from("unit_types")
    .select("id, label")
    .eq("property_id", best.id)
    .limit(5);
  let unitTypeId = unitTypes?.find((u) => /2/.test(u.label))?.id ?? unitTypes?.[0]?.id;
  if (!unitTypeId) {
    const { data: ut } = await admin
      .from("unit_types")
      .insert({
        organization_id: best.organization_id,
        property_id: best.id,
        label: "2BR",
        beds: 2,
        baths: 1,
      })
      .select("*")
      .single();
    unitTypeId = ut.id;
  }

  const created = await api("POST", `/api/properties/${best.id}/reports`, {
    json: {
      unitTypeId,
      title: "Task10 855 PDF draft",
      periodStart: "2026-11-03",
      periodEnd: "2026-11-10",
      preparedBy: "Task10",
    },
  });
  const reportId = created.data?.data?.report?.id;
  out.steps.createReport = { ok: created.ok, status: created.status };
  if (!reportId) {
    out.error = "report create failed";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  await api("PATCH", `/api/reports/${reportId}`, {
    json: { recommendedRentLow: 1925, recommendedRentHigh: 2000 },
  });

  // Deterministic narrative for draft (no live Claude claim)
  await api("POST", `/api/reports/${reportId}/narrative`, {
    json: { preserveUserEdits: false, force: true },
  });
  await api("POST", `/api/reports/${reportId}/narrative/approve`);

  const status = await api("GET", `/api/reports/${reportId}/pdf`);
  out.steps.pdfStatus = {
    ok: status.ok,
    finalizationOk: status.data?.data?.finalization?.ok ?? null,
    blockers: status.data?.data?.finalization?.blockers ?? [],
    eligibleGroupedCount: status.data?.data?.eligibleGroupedCount ?? null,
  };

  const draft = await api("POST", `/api/reports/${reportId}/pdf`, {
    json: { mode: "draft", store: true },
  });
  out.steps.draftPdf = {
    ok: draft.ok,
    status: draft.status,
    pageCount: draft.data?.data?.pageCount ?? null,
    engine: draft.data?.data?.engine ?? null,
    stored: Boolean(draft.data?.data?.stored?.path),
    finalizationOk: draft.data?.data?.finalization?.ok ?? null,
  };

  if (draft.data?.data?.pdfBase64) {
    const bytes = Buffer.from(draft.data.data.pdfBase64, "base64");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const extracted = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(extracted.text)
      ? extracted.text.join("\n")
      : String(extracted.text ?? "");
    out.steps.draftContent = {
      hasDraftLabel: /DRAFT/i.test(text),
      has855: /855 Providence/i.test(text),
      hasWeeklyLeads: /\b10\b/.test(text) || /total leads/i.test(text),
      hasPiiEmail: /@gmail|@yahoo/i.test(text),
      byteLength: bytes.length,
    };
  }

  const finalize = await api("POST", `/api/reports/${reportId}/pdf/finalize`);
  out.steps.finalizeBlocked = {
    status: finalize.status,
    ok: finalize.ok,
    blockedAsExpected: !finalize.ok,
    message: finalize.data?.error?.message ?? null,
    blockers: finalize.data?.error?.details?.blockers ?? null,
  };

  // Cross-tenant
  const otherEmail = `pkl.task10.other.${Date.now()}@example.com`;
  const otherPass = `T10-${crypto.randomUUID()}!aA1`;
  const { data: otherCreated } = await admin.auth.admin.createUser({
    email: otherEmail,
    password: otherPass,
    email_confirm: true,
  });
  let rlsPass = false;
  if (otherCreated?.user) {
    const otherJar = new Map();
    const otherAuth = createServerClient(URL, ANON, {
      cookies: {
        getAll() {
          return [...otherJar.entries()].map(([name, value]) => ({ name, value }));
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            if (!value) otherJar.delete(name);
            else otherJar.set(name, value);
          }
        },
      },
    });
    await otherAuth.auth.signInWithPassword({ email: otherEmail, password: otherPass });
    const leak = await fetch(`${BASE}/api/reports/${reportId}/pdf`, {
      method: "POST",
      headers: {
        Cookie: [...otherJar.entries()].map(([n, v]) => `${n}=${v}`).join("; "),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "draft" }),
    });
    rlsPass = leak.status === 403 || leak.status === 404;
    out.steps.rls = { status: leak.status, pass: rlsPass };
    await admin.auth.admin.deleteUser(otherCreated.user.id).catch(() => {});
  }

  out.reference855 = {
    path: clientSourcePath("855 Providence St - 2BR Report Package", "1 Report", "855 Providence Street - 2 Bedroom Rental Pricing Analysis.pdf"),
    exists: fs.existsSync(
      clientSourcePath("855 Providence St - 2BR Report Package", "1 Report", "855 Providence Street - 2 Bedroom Rental Pricing Analysis.pdf"),
    ),
    pageCount: 13,
    visualParityClaimed: false,
  };

  out.status =
    out.steps.createReport.ok &&
    out.steps.pdfStatus.ok &&
    out.steps.pdfStatus.finalizationOk === false &&
    out.steps.draftPdf.ok &&
    out.steps.draftContent?.hasDraftLabel &&
    out.steps.draftContent?.has855 &&
    !out.steps.draftContent?.hasPiiEmail &&
    out.steps.finalizeBlocked.blockedAsExpected &&
    rlsPass
      ? "pass"
      : "partial_or_fail";

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.status === "pass" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
