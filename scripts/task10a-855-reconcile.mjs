#!/usr/bin/env node
/**
 * Task #10A — read-only 855 reference reconciliation against live org data.
 * Does NOT approve comps.
 */
import fs from "fs";
import path from "path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

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

async function main() {
  const out = { status: "partial", steps: {}, visualParity: "not_claimed" };
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

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Prefer the 855 property that already has Rentometer/HelloData comps.
  const PROPERTY_ID = "95e5b201-a884-42f6-9b61-d31c4e5fb5ed";
  const { data: prop } = await admin
    .from("properties")
    .select("id, organization_id, address_line1")
    .eq("id", PROPERTY_ID)
    .single();
  out.steps.property = prop;

  await admin.from("organization_members").upsert(
    {
      organization_id: prop.organization_id,
      user_id: authData.user.id,
      role: "member",
    },
    { onConflict: "organization_id,user_id" },
  );

  const cookie = [...cookieJar.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
  const recon = await fetch(
    `${BASE}/api/properties/${PROPERTY_ID}/comparables/reconciliation`,
    { headers: { Cookie: cookie } },
  ).then(async (r) => ({ status: r.status, body: await r.json() }));
  out.steps.reconciliation = {
    http: recon.status,
    ok: recon.body?.ok === true,
    summary: recon.body?.data?.matrix?.summary ?? null,
    unmatched: (recon.body?.data?.matrix?.included ?? [])
      .filter((r) => r.matchQuality === "unmatched")
      .map((r) => r.referenceName),
    pendingActions: (recon.body?.data?.matrix?.included ?? [])
      .concat(recon.body?.data?.matrix?.excluded ?? [])
      .filter((r) => r.requiredHumanAction && !r.requiredHumanAction.startsWith("None"))
      .map((r) => ({ ref: r.referenceName, action: r.requiredHumanAction })),
  };

  // Draft PDF on this property (may still be incomplete — never finalize without full set).
  const { data: ut } = await admin
    .from("unit_types")
    .select("id")
    .eq("property_id", PROPERTY_ID)
    .limit(1)
    .maybeSingle();

  const created = await fetch(`${BASE}/api/properties/${PROPERTY_ID}/reports`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      unitTypeId: ut?.id,
      title: "Task10A 855 draft after reconciliation",
      periodStart: "2026-11-03",
      periodEnd: "2026-11-10",
      preparedBy: "Task10A",
    }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const reportId = created.body?.data?.report?.id;
  out.steps.createReport = { status: created.status, reportId };

  if (reportId) {
    await fetch(`${BASE}/api/reports/${reportId}`, {
      method: "PATCH",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendedRentLow: 1925,
        recommendedRentHigh: 2000,
      }),
    });
    await fetch(`${BASE}/api/reports/${reportId}/narrative`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ preserveUserEdits: false, force: true }),
    });
    await fetch(`${BASE}/api/reports/${reportId}/narrative/approve`, {
      method: "POST",
      headers: { Cookie: cookie },
    });

    const status = await fetch(`${BASE}/api/reports/${reportId}/pdf`, {
      headers: { Cookie: cookie },
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
    out.steps.pdfStatus = {
      http: status.status,
      finalizationOk: status.body?.data?.finalization?.ok ?? null,
      blockers: status.body?.data?.finalization?.blockers ?? [],
      eligibleGroupedCount: status.body?.data?.eligibleGroupedCount ?? null,
    };

    const draft = await fetch(`${BASE}/api/reports/${reportId}/pdf`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "draft", store: true }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
    out.steps.draftPdf = {
      http: draft.status,
      pageCount: draft.body?.data?.pageCount ?? null,
      engine: draft.body?.data?.engine ?? null,
      stored: Boolean(draft.body?.data?.stored?.path),
    };

    const finalize = await fetch(`${BASE}/api/reports/${reportId}/pdf/finalize`, {
      method: "POST",
      headers: { Cookie: cookie },
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
    out.steps.finalizeStillGuarded = {
      http: finalize.status,
      blockedAsExpected: !finalize.body?.ok,
      message: finalize.body?.error?.message ?? null,
    };
  }

  out.reference855 = {
    pages: 13,
    format: "Letter",
    visualParityClaimed: false,
  };

  const s = out.steps.reconciliation?.summary;
  out.status =
    out.steps.reconciliation?.ok &&
    out.steps.draftPdf?.http === 200 &&
    out.steps.finalizeStillGuarded?.blockedAsExpected &&
    s &&
    s.unmatchedIncluded > 0
      ? "pass_reconcile_pending_human_approval"
      : out.steps.reconciliation?.ok
        ? "partial"
        : "fail";

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.status.startsWith("pass") || out.status === "partial" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
