#!/usr/bin/env node
/**
 * Task #9 live E2E: assemble report payload + narrative workflow.
 * Live Claude is only claimed when ANTHROPIC_API_KEY is present and usedLiveClaude=true.
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

async function api(method, pathname, { json } = {}) {
  const headers = { Cookie: cookieHeader() };
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
  const out = { status: "partial_or_fail", steps: {}, liveClaude: false };
  if (!URL || !ANON || !SERVICE) {
    out.error = "Missing Supabase env";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
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

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId = authData.user.id;

  let propertyId = null;
  let unitTypeId = null;
  let organizationId = null;

  const { data: props } = await admin
    .from("properties")
    .select("id, organization_id, name, address_line1")
    .ilike("address_line1", "%855%Providence%")
    .limit(20);
  if (props?.length) {
    // Prefer a property that already has weekly_metrics from Task #8 uploads.
    let best = props[0];
    let bestWeeks = -1;
    for (const p of props) {
      const { count } = await admin
        .from("weekly_metrics")
        .select("id", { count: "exact", head: true })
        .eq("property_id", p.id);
      if ((count ?? 0) > bestWeeks) {
        bestWeeks = count ?? 0;
        best = p;
      }
    }
    propertyId = best.id;
    organizationId = best.organization_id;
    await admin.from("organization_members").upsert(
      { organization_id: organizationId, user_id: userId, role: "member" },
      { onConflict: "organization_id,user_id" },
    );
  } else {
    const { data: org } = await admin
      .from("organizations")
      .insert({ name: `Task09 Org ${Date.now()}`, slug: `task09-${Date.now()}` })
      .select("*")
      .single();
    organizationId = org.id;
    await admin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: userId,
      role: "owner",
    });
    const { data: property } = await admin
      .from("properties")
      .insert({
        organization_id: organizationId,
        name: "855 Providence St",
        address_line1: "855 Providence St",
        city: "West Warwick",
        state: "RI",
        postal_code: "02893",
        amenities: ["Fitness"],
        external_links: {},
      })
      .select("*")
      .single();
    propertyId = property.id;
  }

  const { data: unitTypes } = await admin
    .from("unit_types")
    .select("id, label")
    .eq("property_id", propertyId)
    .limit(5);
  unitTypeId = unitTypes?.find((u) => /2/.test(u.label))?.id ?? unitTypes?.[0]?.id;
  if (!unitTypeId) {
    const { data: ut } = await admin
      .from("unit_types")
      .insert({
        organization_id: organizationId,
        property_id: propertyId,
        label: "2BR",
        beds: 2,
        baths: 2,
      })
      .select("*")
      .single();
    unitTypeId = ut.id;
  }

  const created = await api("POST", `/api/properties/${propertyId}/reports`, {
    json: {
      unitTypeId,
      title: "Task09 855 Providence 2BR narrative",
      periodStart: "2026-11-03",
      periodEnd: "2026-11-10",
      preparedBy: "Task09",
    },
  });
  out.steps.createReport = { status: created.status, ok: created.ok, error: created.data?.error };
  const reportId = created.data?.data?.report?.id;
  if (!reportId) {
    out.error = "report create failed";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const rent = await api("PATCH", `/api/reports/${reportId}`, {
    json: { recommendedRentLow: 2150, recommendedRentHigh: 2250 },
  });
  out.steps.setRent = { status: rent.status, ok: rent.ok };

  const assemble = await api("GET", `/api/reports/${reportId}/assemble`);
  const payload = assemble.data?.data?.payload;
  out.steps.assemble = {
    status: assemble.status,
    ok: assemble.ok,
    assemblyStatus: payload?.status ?? null,
    propertyName: payload?.property?.name ?? null,
    recommended: [payload?.pricing?.recommendedRentLow, payload?.pricing?.recommendedRentHigh],
    weeklyCount: payload?.weekly?.weeks?.length ?? 0,
    zillowLatestLeads: payload?.weekly?.latestWeek?.zillow?.weekly?.totalLeads ?? null,
    omittedUnreviewed: payload?.comparables?.rejectedOrUnreviewedOmittedCount ?? null,
    privacyOk: !JSON.stringify(payload ?? {}).match(/@gmail|@yahoo|\(\d{3}\)/i),
  };

  const narrative = await api("POST", `/api/reports/${reportId}/narrative`, {
    json: { preserveUserEdits: false, force: true },
  });
  out.steps.narrative = {
    status: narrative.status,
    ok: narrative.ok,
    usedLiveClaude: Boolean(narrative.data?.data?.usedLiveClaude),
    model: narrative.data?.data?.narrative?.model ?? null,
    error: narrative.data?.error,
  };
  out.liveClaude = Boolean(narrative.data?.data?.usedLiveClaude);

  const edited = await api("PATCH", `/api/reports/${reportId}/narrative`, {
    json: {
      sections: {
        pricingExplanation: "Human-edited PKL explanation for 855 Providence.",
      },
    },
  });
  out.steps.edit = { status: edited.status, ok: edited.ok };

  const regen = await api("POST", `/api/reports/${reportId}/narrative`, {
    json: { preserveUserEdits: true, force: true },
  });
  const kept =
    regen.data?.data?.narrative?.sections?.pricingExplanation?.includes("Human-edited");
  out.steps.regeneratePreserve = {
    status: regen.status,
    ok: regen.ok,
    preservedUserEdit: Boolean(kept),
  };

  const approve = await api("POST", `/api/reports/${reportId}/narrative/approve`);
  out.steps.approve = {
    status: approve.status,
    ok: approve.ok,
    narrativeStatus: approve.data?.data?.narrative?.status ?? null,
  };

  const snap = await api("POST", `/api/reports/${reportId}/snapshot`);
  out.steps.snapshot = {
    status: snap.status,
    ok: snap.ok,
    version: snap.data?.data?.snapshot?.version ?? null,
    error: snap.data?.error,
  };

  // Attempt mutate snapshot payload (should fail immutability)
  let immutabilityPass = false;
  if (snap.data?.data?.snapshot?.id) {
    const { error: mutErr } = await admin
      .from("report_snapshots")
      .update({ payload: { tampered: true } })
      .eq("id", snap.data.data.snapshot.id);
    immutabilityPass = Boolean(mutErr);
    out.steps.snapshotImmutable = { pass: immutabilityPass, error: mutErr?.message ?? null };
  }

  const otherEmail = `pkl.task09.other.${Date.now()}@example.com`;
  const otherPass = `O9-${crypto.randomUUID()}!aA1`;
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
    const leak = await fetch(`${BASE}/api/reports/${reportId}/assemble`, {
      headers: {
        Cookie: [...otherJar.entries()].map(([n, v]) => `${n}=${v}`).join("; "),
      },
    });
    rlsPass = leak.status === 403 || leak.status === 404;
    out.steps.rls = { status: leak.status, pass: rlsPass };
    await admin.auth.admin.deleteUser(otherCreated.user.id).catch(() => {});
  }

  out.status =
    out.steps.createReport.ok &&
    out.steps.setRent.ok &&
    out.steps.assemble.ok &&
    out.steps.narrative.ok &&
    out.steps.edit.ok &&
    out.steps.regeneratePreserve.preservedUserEdit &&
    out.steps.approve.ok &&
    out.steps.snapshot.ok &&
    immutabilityPass &&
    rlsPass &&
    out.steps.assemble.privacyOk
      ? "pass"
      : "partial_or_fail";

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.status === "pass" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
