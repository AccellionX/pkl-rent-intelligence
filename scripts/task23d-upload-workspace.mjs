#!/usr/bin/env node
/**
 * Task #23D — upload workspace separation browser verification.
 * Fresh 855-based property via UI → Start new report (Nov 3–10) → guided Step 1.
 * Verifies general Data Uploads never paints weekly chrome without reportId.
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { loadDotEnv, requireE2eAdmin } from "./lib/local-e2e-env.mjs";

loadDotEnv();
const { email, password } = requireE2eAdmin();

const BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const ORG = "b4cd06aa-c1f2-4170-ae1f-ad53d88d9c3a";
const OUT = path.join(process.cwd(), "tmp/task23d");
const SHOTS = path.join(OUT, "screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

const stamp = Date.now().toString(36).slice(-5);
const PROPERTY_NAME = `Task23D 855 Prov ${stamp}`;

const evidence = {
  overall: "FAIL",
  propertyId: null,
  propertyName: PROPERTY_NAME,
  unitTypeId: null,
  reportId: null,
  checks: {},
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase admin env for evidence lookup");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function shot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#login-email, input[type='email'], input[name='email']").first().fill(email);
  await page.locator("#login-password, input[type='password'][name='password']").first().fill(password);
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });
  await page.waitForTimeout(800);
}

async function createProperty(page) {
  page.on("dialog", async (d) => {
    await d.accept().catch(() => {});
  });
  await page.goto(`${BASE}/buildings`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "New property" }).click();
  await page.getByRole("heading", { name: /Create property|Add a building/i }).waitFor();
  await page.getByText("Name", { exact: true }).locator("xpath=..").locator("input").fill(PROPERTY_NAME);
  await page
    .getByText("Address", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("855 Providence Street");
  await page.getByText("City", { exact: true }).locator("xpath=..").locator("input").fill("West Warwick");
  await page.getByText("State", { exact: true }).locator("xpath=..").locator("input").fill("RI");
  await page
    .getByText("Postal code", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("02893");
  await page.getByRole("button", { name: "Save property" }).click();
  // Wait until the new name appears in the list (or detail URL).
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    const body = await page.locator("body").innerText();
    if (body.includes(PROPERTY_NAME) && !/Save property/i.test(body)) break;
    const m = page.url().match(/\/buildings\/([0-9a-f-]{36})/i);
    if (m) break;
  }
  await shot(page, "11-fresh-property");
  const admin = adminClient();
  const { data } = await admin
    .from("properties")
    .select("id, name")
    .eq("organization_id", ORG)
    .eq("name", PROPERTY_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  evidence.propertyId = data?.id ?? null;
  evidence.checks.propertyCreated = { ok: Boolean(data?.id), propertyId: data?.id };
  return data?.id;
}

async function setupUnits(page, propertyId) {
  await page.goto(`${BASE}/buildings/${propertyId}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Unit types/i }).waitFor({ timeout: 60000 });
  const nameInput = page
    .locator("label", { hasText: /^Unit type name$/i })
    .locator("xpath=..")
    .locator("input");
  await nameInput.waitFor({ timeout: 30000 });
  await nameInput.fill("2 Bedroom");
  await page
    .locator("label", { hasText: /^Bedrooms$/i })
    .locator("xpath=..")
    .locator("input")
    .fill("2");
  await page
    .locator("label", { hasText: /^Bathrooms$/i })
    .locator("xpath=..")
    .locator("input")
    .fill("1");
  await page.getByRole("button", { name: "Add unit type" }).click();
  await page.waitForTimeout(3000);

  const unitNumber = page
    .locator("label", { hasText: /Unit number/i })
    .locator("xpath=..")
    .locator("input");
  if (await unitNumber.count()) await unitNumber.first().fill("7");
  const sqft = page
    .locator("label", { hasText: /Sq\.? ?ft|Square/i })
    .locator("xpath=..")
    .locator("input");
  if (await sqft.count()) await sqft.first().fill("900");
  const rentInput = page
    .locator("label", { hasText: /Asking rent/i })
    .locator("xpath=..")
    .locator("input")
    .first();
  if (await rentInput.count()) await rentInput.fill("2000");
  const add = page.getByRole("button", { name: "Add unit", exact: true });
  if (await add.count()) {
    await add.click();
    await page.waitForTimeout(2000);
  }

  const admin = adminClient();
  const { data: uts } = await admin
    .from("unit_types")
    .select("id, label")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });
  evidence.unitTypeId = uts?.find((u) => /2/.test(u.label))?.id ?? uts?.[0]?.id ?? null;
  evidence.checks.unitSetup = { ok: Boolean(evidence.unitTypeId), unitTypeId: evidence.unitTypeId };
  await shot(page, "11b-units");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await login(page);

    // Global uploads — no silent property / no weekly chrome
    await page.goto(`${BASE}/upload`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    await shot(page, "10-playwright-general");
    const general = await page.locator("body").innerText();
    const hasPartialWeeklyHeader =
      /\bWEEKLY REPORT\b/.test(general) ||
      (/\nWeekly report\n/i.test(general) && /Progress \d+%/i.test(general));
    evidence.checks.generalUploads = {
      ok:
        /Document library/i.test(general) &&
        /Choose a property to continue|Select a property below/i.test(general) &&
        !hasPartialWeeklyHeader &&
        /Upload your documents\. We'll extract the available information/i.test(general),
      hasWeeklyChrome: hasPartialWeeklyHeader,
      hasProgress0: /Progress 0%/i.test(general),
      hasStepper: /STEP 1[\s\S]*Comparables/i.test(general),
    };

    const propertyId = await createProperty(page);
    if (!propertyId) throw new Error("Property create failed");
    await setupUnits(page, propertyId);

    // Property Documents entry
    await page.goto(`${BASE}/upload?buildingId=${propertyId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, "12-property-documents");
    const propDocs = await page.locator("body").innerText();
    evidence.checks.propertyDocuments = {
      ok:
        /Document library/i.test(propDocs) &&
        propDocs.includes(PROPERTY_NAME) &&
        !(/Weekly report/i.test(propDocs) && /Progress 0%/i.test(propDocs)) &&
        !/Veterans/i.test(propDocs),
      hasVeterans: /Veterans/i.test(propDocs),
      hasWeeklyPartial: /Weekly report/i.test(propDocs) && /Progress 0%/i.test(propDocs),
    };

    // Explicit switch: Veterans general uploads should not leak into later 855 guided
    await page.goto(`${BASE}/upload`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.getByRole("combobox").filter({ hasText: /Select a property|Veterans|855|Task/i }).first().click();
    await page.getByRole("option", { name: /30 Veterans Memorial Parkway/i }).click();
    await page.waitForTimeout(1200);
    const vetText = await page.locator("body").innerText();
    evidence.checks.veteransGeneral = {
      ok: /30 Veterans Memorial Parkway/i.test(vetText) && !(/Weekly report/i.test(vetText) && /Progress 0%/i.test(vetText)),
      hasWeeklyPartial: /Weekly report/i.test(vetText) && /Progress 0%/i.test(vetText),
    };
    await shot(page, "12b-veterans-general");

    // Start new report
    await page.goto(`${BASE}/buildings/${propertyId}/reports`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await shot(page, "13-start-report-form");

    // Unit type — native <select> (create form already prefers first unit type)
    const nativeUnit = page.locator("select").first();
    if ((await nativeUnit.count()) && evidence.unitTypeId) {
      await nativeUnit.selectOption(evidence.unitTypeId);
    }

    const dates = page.locator('input[type="date"]');
    if ((await dates.count()) >= 2) {
      await dates.nth(0).fill("2026-11-03");
      await dates.nth(1).fill("2026-11-10");
    }
    await shot(page, "13b-dates-confirmed");

    const createBtn = page.getByRole("button", {
      name: /Create report and open Step 1/i,
    });
    await createBtn.click();
    await page.waitForURL(/\/upload\?.*reportId=/, { timeout: 45000 });
    await page.waitForTimeout(1500);
    const step1Url = page.url();
    evidence.reportId = step1Url.match(/reportId=([0-9a-f-]{36})/i)?.[1] ?? null;
    await shot(page, "14-guided-step1");
    const step1 = await page.locator("body").innerText();
    const guidedHeader = /\bWEEKLY REPORT\b/i.test(step1) || /\nWeekly report\n/i.test(step1);
    evidence.checks.guidedStep1 = {
      ok:
        Boolean(evidence.reportId) &&
        guidedHeader &&
        /STEP 1/i.test(step1) &&
        /Comparables/i.test(step1) &&
        /2026-11-03/.test(step1) &&
        /2026-11-10/.test(step1) &&
        !/Veterans/i.test(step1) &&
        !/Document library/i.test(step1),
      url: step1Url,
      hasVeterans: /Veterans/i.test(step1),
      lockedProperty: /Task23D 855|855 Providence/i.test(step1),
    };

    // Slow reload — must stay guided, not fall back to general/legacy
    const client = await page.context().newCDPSession(page);
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: (40 * 1024) / 8,
      uploadThroughput: (20 * 1024) / 8,
      latency: 900,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    const mid = await page.locator("body").innerText();
    evidence.checks.slowLoading = {
      sawSkeleton: /Loading report workspace/i.test(mid),
      didNotFallToGeneral:
        page.url().includes("reportId=") && !(/Document library/i.test(mid) && !/Weekly report/i.test(mid)),
    };
    await page.waitForTimeout(3500);
    await shot(page, "15-after-slow-reload");
    const afterSlow = await page.locator("body").innerText();
    evidence.checks.slowLoading.ok =
      evidence.checks.slowLoading.didNotFallToGeneral &&
      /Weekly report/i.test(afterSlow) &&
      page.url().includes(evidence.reportId);
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });

    // Preserve context across guided steps
    const stepPaths = [
      {
        id: "comparables",
        path: `/buildings/${propertyId}/comparables?reportId=${evidence.reportId}&unitTypeId=${evidence.unitTypeId}&step=comparables`,
      },
      {
        id: "weekly",
        path: `/buildings/${propertyId}/leads?reportId=${evidence.reportId}&unitTypeId=${evidence.unitTypeId}&step=weekly`,
      },
      {
        id: "pricing",
        path: `/buildings/${propertyId}/pricing?reportId=${evidence.reportId}&unitTypeId=${evidence.unitTypeId}&step=pricing`,
      },
      {
        id: "download",
        path: `/buildings/${propertyId}/reports?reportId=${evidence.reportId}&unitTypeId=${evidence.unitTypeId}&step=download`,
      },
    ];
    for (const s of stepPaths) {
      await page.goto(`${BASE}${s.path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      const t = await page.locator("body").innerText();
      evidence.checks[`step_${s.id}`] = {
        ok: page.url().includes(evidence.reportId) && /Weekly report/i.test(t) && !/Veterans/i.test(t),
        url: page.url(),
      };
      await shot(page, `16-step-${s.id}`);
    }

    // Save & return → continue
    await page.goto(`${BASE}/buildings/${propertyId}/reports`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const cont = page.getByRole("link", { name: /Continue/i }).first();
    if (await cont.count()) await cont.click();
    await page.waitForTimeout(1200);
    evidence.checks.resume = {
      ok: page.url().includes(evidence.reportId || "x"),
      url: page.url(),
    };
    await shot(page, "17-resume");

    // Sign out / in resume
    await page.getByRole("button", { name: /Sign out/i }).click();
    await page.waitForTimeout(1500);
    await login(page);
    await page.goto(
      `${BASE}/upload?buildingId=${propertyId}&reportId=${evidence.reportId}&unitTypeId=${evidence.unitTypeId}&step=upload`,
      { waitUntil: "networkidle" },
    );
    await page.waitForTimeout(1000);
    const relogin = await page.locator("body").innerText();
    evidence.checks.relogin = {
      ok: /Weekly report/i.test(relogin) && page.url().includes(evidence.reportId) && !/Veterans/i.test(relogin),
      url: page.url(),
    };
    await shot(page, "18-relogin-guided");

    const failed = Object.entries(evidence.checks).filter(([, v]) => v && v.ok === false);
    evidence.overall = failed.length === 0 ? "PASS" : "FAIL";
    evidence.failed = failed.map(([k]) => k);
  } catch (err) {
    evidence.error = String(err?.stack || err?.message || err);
    evidence.overall = "FAIL";
    await shot(page, "99-error").catch(() => null);
  } finally {
    fs.writeFileSync(path.join(OUT, "evidence.json"), JSON.stringify(evidence, null, 2));
    await browser.close();
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(evidence.overall === "PASS" ? 0 : 1);
  }
}

main();
