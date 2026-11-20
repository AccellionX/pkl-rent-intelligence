#!/usr/bin/env node
/** Task23D — fast UI verification of upload workspace separation. */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { loadDotEnv, requireE2eAdmin } from "./lib/local-e2e-env.mjs";

loadDotEnv();
const { email, password } = requireE2eAdmin();
const BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const OUT = path.join(process.cwd(), "tmp/task23d");
const SHOTS = path.join(OUT, "screenshots");
const PROPERTY_ID = "83763169-f65d-4b66-96f6-ef330580750b";
const UNIT_TYPE_ID = "5925df55-cb16-4774-bbce-70a0e9217300";
const REPORT_ID = "22043ee9-ee52-429d-a806-eb38df4c0a29";

const evidence = {
  overall: "FAIL",
  propertyId: PROPERTY_ID,
  propertyName: "Task23D 855 Prov mcrvm",
  unitTypeId: UNIT_TYPE_ID,
  reportId: REPORT_ID,
  checks: {},
};

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });
}

async function waitText(page, re, ms = 20000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const t = await page.locator("body").innerText();
    if (re.test(t)) return t;
    await page.waitForTimeout(400);
  }
  return page.locator("body").innerText();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(20000);
  try {
    await login(page);

    await page.goto(`${BASE}/upload`, { waitUntil: "domcontentloaded" });
    let t = await waitText(page, /Document library|Choose a property/i);
    evidence.checks.generalUploads = {
      ok: /Document library/i.test(t) && !/\bWEEKLY REPORT\b/i.test(t) && !/Progress 0%/i.test(t),
    };
    await page.screenshot({ path: path.join(SHOTS, "20-general.png"), fullPage: true });

    await page.goto(
      `${BASE}/upload?buildingId=${PROPERTY_ID}&reportId=${REPORT_ID}&unitTypeId=${UNIT_TYPE_ID}&step=upload`,
      { waitUntil: "domcontentloaded" },
    );
    t = await waitText(page, /\bWEEKLY REPORT\b[\s\S]*STEP 1/i, 30000);
    evidence.checks.guidedStep1 = {
      ok:
        /\bWEEKLY REPORT\b/i.test(t) &&
        /STEP 1/i.test(t) &&
        /2026-11-03/.test(t) &&
        /Task23D/i.test(t) &&
        !/Veterans/i.test(t) &&
        !/Document library/i.test(t),
      hasVeterans: /Veterans/i.test(t),
    };
    await page.screenshot({ path: path.join(SHOTS, "21-guided-step1.png"), fullPage: true });

    for (const [id, rel] of [
      ["comparables", `/buildings/${PROPERTY_ID}/comparables?reportId=${REPORT_ID}&unitTypeId=${UNIT_TYPE_ID}&step=comparables`],
      ["weekly", `/buildings/${PROPERTY_ID}/leads?reportId=${REPORT_ID}&unitTypeId=${UNIT_TYPE_ID}&step=weekly`],
      ["pricing", `/buildings/${PROPERTY_ID}/pricing?reportId=${REPORT_ID}&unitTypeId=${UNIT_TYPE_ID}&step=pricing`],
      ["download", `/buildings/${PROPERTY_ID}/reports?reportId=${REPORT_ID}&unitTypeId=${UNIT_TYPE_ID}&step=download`],
    ]) {
      await page.goto(`${BASE}${rel}`, { waitUntil: "domcontentloaded" });
      t = await waitText(page, /\bWEEKLY REPORT\b/i, 25000);
      evidence.checks[`step_${id}`] = {
        ok: page.url().includes(REPORT_ID) && /\bWEEKLY REPORT\b/i.test(t) && !/Veterans/i.test(t),
        url: page.url(),
      };
      await page.screenshot({ path: path.join(SHOTS, `22-step-${id}.png`), fullPage: true });
    }

    await page.goto(`${BASE}/buildings/${PROPERTY_ID}/reports`, { waitUntil: "domcontentloaded" });
    t = await waitText(page, /Continue a draft|Continue report|Start a report/i, 25000);
    const cont = page.getByRole("button", { name: /Continue report/i }).first();
    evidence.checks.hubHasContinue = { ok: (await cont.count()) > 0 };
    if (await cont.count()) {
      await cont.click();
      await page.waitForURL(/reportId=/, { timeout: 20000 });
    }
    evidence.checks.resume = { ok: page.url().includes(REPORT_ID), url: page.url() };
    await page.screenshot({ path: path.join(SHOTS, "23-resume.png"), fullPage: true });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    evidence.checks.refresh = { ok: page.url().includes(REPORT_ID), url: page.url() };

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    );
    const { data: report } = await admin
      .from("report_runs")
      .select("period_start, period_end, title, status")
      .eq("id", REPORT_ID)
      .maybeSingle();
    evidence.dbPeriod = report;
    evidence.checks.dbPeriod = {
      ok: report?.period_start === "2026-11-03" && report?.period_end === "2026-11-10",
    };

    // Property Documents path (general + buildingId)
    await page.goto(`${BASE}/upload?buildingId=${PROPERTY_ID}`, { waitUntil: "domcontentloaded" });
    t = await waitText(page, /Document library/i, 20000);
    evidence.checks.propertyDocuments = {
      ok: /Document library/i.test(t) && !/\bWEEKLY REPORT\b/i.test(t) && !/Veterans/i.test(t),
    };
    await page.screenshot({ path: path.join(SHOTS, "25-property-documents.png"), fullPage: true });

    const failed = Object.entries(evidence.checks).filter(([, v]) => v && v.ok === false);
    evidence.overall = failed.length === 0 ? "PASS" : "FAIL";
    evidence.failed = failed.map(([k]) => k);
  } catch (e) {
    evidence.error = String(e?.stack || e);
    evidence.overall = "FAIL";
  } finally {
    fs.writeFileSync(path.join(OUT, "evidence.json"), JSON.stringify(evidence, null, 2));
    await browser.close();
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(evidence.overall === "PASS" ? 0 : 1);
  }
}

main();
