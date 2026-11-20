#!/usr/bin/env node
/** Continue Task23D on existing property: create report Nov 3–10 → guided Step 1 + resume. */
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

const prev = fs.existsSync(path.join(OUT, "evidence.json"))
  ? JSON.parse(fs.readFileSync(path.join(OUT, "evidence.json"), "utf8"))
  : {};
const evidence = {
  ...prev,
  finish: {},
  overall: "FAIL",
  propertyId: PROPERTY_ID,
  unitTypeId: UNIT_TYPE_ID,
};

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${BASE}/login`);
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });

    await page.goto(`${BASE}/buildings/${PROPERTY_ID}/reports`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.locator("select").first().selectOption(UNIT_TYPE_ID);
    const dates = page.locator('input[type="date"]');
    await dates.nth(0).fill("2026-11-03");
    await dates.nth(1).fill("2026-11-10");
    await page.screenshot({ path: path.join(SHOTS, "13b-dates-confirmed.png"), fullPage: true });
    const selected = await page.locator("body").innerText();
    evidence.finish.datesVisible = /2026-11-03/.test(selected) && /2026-11-10/.test(selected);

    await page.getByRole("button", { name: /Create report and open Step 1/i }).click();
    await page.waitForURL(/\/upload\?.*reportId=/, { timeout: 45000 });
    evidence.reportId = page.url().match(/reportId=([0-9a-f-]{36})/i)?.[1] ?? null;
    // Wait until guided chrome resolves (not loading placeholders).
    let step1 = "";
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(400);
      step1 = await page.locator("body").innerText();
      if (
        /\bWEEKLY REPORT\b/i.test(step1) &&
        /STEP 1/i.test(step1) &&
        /2026-11-03/.test(step1) &&
        /Task23D|855/i.test(step1) &&
        !/Preparing upload workspace/i.test(step1) &&
        !/Loading report workspace/i.test(step1)
      ) {
        break;
      }
    }
    await page.screenshot({ path: path.join(SHOTS, "14-guided-step1.png"), fullPage: true });
    evidence.finish.guidedStep1 = {
      ok:
        Boolean(evidence.reportId) &&
        /\bWEEKLY REPORT\b/i.test(step1) &&
        /STEP 1/i.test(step1) &&
        /Comparables/i.test(step1) &&
        /2026-11-03/.test(step1) &&
        /2026-11-10/.test(step1) &&
        !/Veterans/i.test(step1) &&
        !/Document library/i.test(step1),
      url: page.url(),
      snippet: step1.slice(0, 600),
    };

    // slow reload
    const client = await page.context().newCDPSession(page);
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: (40 * 1024) / 8,
      uploadThroughput: (20 * 1024) / 8,
      latency: 800,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    const mid = await page.locator("body").innerText();
    evidence.finish.slowLoading = {
      sawSkeleton: /Loading report workspace/i.test(mid),
      stayedGuided: page.url().includes("reportId="),
    };
    await page.waitForTimeout(3000);
    const after = await page.locator("body").innerText();
    evidence.finish.slowLoading.ok =
      evidence.finish.slowLoading.stayedGuided &&
      /\bWEEKLY REPORT\b/i.test(after) &&
      !/Document library/i.test(after);
    await page.screenshot({ path: path.join(SHOTS, "15-after-slow-reload.png"), fullPage: true });
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });

    for (const s of [
      ["comparables", "comparables", "comparables"],
      ["weekly", "leads", "weekly"],
      ["pricing", "pricing", "pricing"],
      ["download", "reports", "download"],
    ]) {
      const [id, route, step] = s;
      await page.goto(
        `${BASE}/buildings/${PROPERTY_ID}/${route}?reportId=${evidence.reportId}&unitTypeId=${UNIT_TYPE_ID}&step=${step}`,
        { waitUntil: "domcontentloaded" },
      );
      await page.waitForTimeout(700);
      const t = await page.locator("body").innerText();
      evidence.finish[`step_${id}`] = {
        ok: page.url().includes(evidence.reportId) && /\bWEEKLY REPORT\b/i.test(t) && !/Veterans/i.test(t),
        url: page.url(),
      };
      await page.screenshot({ path: path.join(SHOTS, `16-step-${id}.png`), fullPage: true });
    }

    await page.goto(`${BASE}/buildings/${PROPERTY_ID}/reports`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const cont = page.getByRole("link", { name: /Continue/i }).first();
    if (await cont.count()) await cont.click();
    await page.waitForTimeout(1200);
    evidence.finish.resume = {
      ok: page.url().includes(evidence.reportId || "x"),
      url: page.url(),
    };
    await page.screenshot({ path: path.join(SHOTS, "17-resume.png"), fullPage: true });

    // DB period check
    const { data: report } = await admin()
      .from("report_runs")
      .select("id, period_start, period_end, title, status")
      .eq("id", evidence.reportId)
      .maybeSingle();
    evidence.finish.dbPeriod = report;
    evidence.finish.dbPeriodOk =
      report?.period_start === "2026-11-03" && report?.period_end === "2026-11-10";

    const failed = Object.entries(evidence.finish).filter(
      ([, v]) => v && typeof v === "object" && "ok" in v && v.ok === false,
    );
    if (!evidence.finish.datesVisible) failed.push(["datesVisible"]);
    if (!evidence.finish.dbPeriodOk) failed.push(["dbPeriodOk"]);
    evidence.overall =
      evidence.finish.guidedStep1?.ok && failed.length === 0 ? "PASS" : "FAIL";
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
