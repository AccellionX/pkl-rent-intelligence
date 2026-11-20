#!/usr/bin/env node
import { loadDotEnv, requireE2eAdmin } from "./lib/local-e2e-env.mjs";
/**
 * Task #20B — photo gallery root-cause measurement + 10× open/refresh stress.
 * Seeds temporary MLS orphan rows (then deletes them) to prove subject gallery
 * does not sign MLS floods.
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

loadDotEnv();

function loadEnv() {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const ORG = "b4cd06aa-c1f2-4170-ae1f-ad53d88d9c3a";
const OUT = path.join(process.cwd(), "tmp/task20b");
fs.mkdirSync(OUT, { recursive: true });

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function cookieJar() {
  const jar = new Map();
  const auth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
        setAll: (a) => {
          for (const { name, value } of a) {
            if (!value) jar.delete(name);
            else jar.set(name, value);
          }
        },
      },
    },
  );
  await auth.auth.signInWithPassword(requireE2eAdmin());
  return [...jar.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
}

async function main() {
  const admin = adminClient();
  // Use Twenty A Journey property which already has subject photos + MLS docs.
  const propertyId = "29865d36-23fb-4861-b43a-29d62f73ccf4";
  const cookie = await cookieJar();

  // Seed 80 MLS orphan rows pointing at an existing subject photo path (no new public URLs).
  const { data: subject } = await admin
    .from("report_photos")
    .select("storage_bucket,storage_path,organization_id")
    .eq("property_id", propertyId)
    .is("comparable_property_id", null)
    .neq("source", "mls")
    .limit(1)
    .maybeSingle();

  const seededIds = [];
  if (subject?.organization_id || true) {
    const rows = Array.from({ length: 80 }, (_, i) => ({
      organization_id: subject?.organization_id || ORG,
      property_id: propertyId,
      comparable_property_id: null,
      source: "mls",
      storage_bucket: subject?.storage_bucket || "report-photos",
      // Unique paths so constraint allows orphans; subject gallery must never sign them.
      storage_path: `${ORG}/properties/${propertyId}/mls-orphan/task20b-${Date.now()}-${i}.jpg`,
      sort_order: 1000 + i,
      alt_text: `task20b-mls-orphan-${i}`,
      content_sha256: `task20b${String(i).padStart(56, "0")}`,
    }));
    const { data: inserted, error } = await admin.from("report_photos").insert(rows).select("id");
    if (error) console.error("seed error", error.message);
    else seededIds.push(...(inserted || []).map((r) => r.id));
  }

  const timings = [];
  for (let i = 0; i < 10; i++) {
    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/properties/${propertyId}/photos`, {
      headers: { Cookie: cookie },
    });
    const json = await res.json();
    const ms = Date.now() - t0;
    timings.push({
      i: i + 1,
      ms,
      status: res.status,
      photoCount: json?.data?.photos?.length ?? null,
      totalMatching: json?.data?.totalMatching ?? null,
      truncated: json?.data?.truncated ?? null,
      hasMlsInResponse: (json?.data?.photos || []).some((p) => p.source === "mls"),
    });
  }

  // Browser: open property gallery 10 times with refresh
  const browser = await chromium.launch({ headless: true });
  const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 900 } })
  ).newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const __e2eAdmin = requireE2eAdmin();
  await page.locator("#login-email").fill(__e2eAdmin.email);
  await page.locator("#login-password").fill(__e2eAdmin.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));

  const uiTimings = [];
  for (let i = 0; i < 10; i++) {
    const t0 = Date.now();
    await page.goto(`${BASE}/buildings/${propertyId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Subject photos/i }).waitFor({ timeout: 30000 });
    // Wait until loading clears or photos/empty appear
    for (let w = 0; w < 40; w++) {
      const t = await page.locator("body").innerText();
      if (!/Loading photos/i.test(t)) break;
      await page.waitForTimeout(250);
    }
    const refresh = page.getByRole("button", { name: /Refresh photos/i });
    if (await refresh.count()) {
      await refresh.click();
      await page.waitForTimeout(800);
    }
    const body = await page.locator("body").innerText();
    const stuck = /Loading photos/i.test(body);
    uiTimings.push({
      i: i + 1,
      ms: Date.now() - t0,
      stuck,
      hasGallery: /Subject photos/i.test(body),
      hasPhotosOrEmpty: /Photo to be added|#\d+|cropped 3:2|Upload photo/i.test(body),
    });
  }
  await page.screenshot({ path: path.join(OUT, "gallery-stress.png"), fullPage: true });
  await browser.close();

  if (seededIds.length) {
    await admin.from("report_photos").delete().in("id", seededIds);
  }

  const summary = {
    seededMlsOrphans: seededIds.length,
    apiTimings: timings,
    apiP50: [...timings].sort((a, b) => a.ms - b.ms)[Math.floor(timings.length / 2)]?.ms,
    apiMax: Math.max(...timings.map((t) => t.ms)),
    apiNeverSignedMls: timings.every((t) => t.hasMlsInResponse === false),
    uiTimings,
    uiMax: Math.max(...uiTimings.map((t) => t.ms)),
    uiNeverStuck: uiTimings.every((t) => !t.stuck),
  };
  fs.writeFileSync(path.join(OUT, "photo-stress.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
