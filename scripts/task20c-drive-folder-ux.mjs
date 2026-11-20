#!/usr/bin/env node
import { loadDotEnv, requireE2eAdmin, optionalClientSourcePath } from "./lib/local-e2e-env.mjs";
/**
 * Task #20C — browser verify Drive folder UX (configured + unconfigured).
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

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
const OUT = path.join(process.cwd(), "tmp/task20c");
fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });

const REAL_CSV = optionalClientSourcePath(
  "855 Providence St - 2BR Report Package",
  "3 Source files",
  "20261114-Rentometer-855_Providence_St_West_Warwick_RI_02893_USA-2-bed-qPiKWT24DL0.csv",
);
const FILES = {
  rentometer:
    REAL_CSV && fs.existsSync(REAL_CSV)
      ? REAL_CSV
      : path.join(process.cwd(), "tests/fixtures/rentometer/synthetic-2bed.csv"),
};

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function settleApp(page, { timeoutMs = 90000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await page.locator("body").innerText();
    const blocked =
      /Checking your account|Loading account|Sign in to your account/i.test(t) ||
      page.url().includes("/login");
    if (!blocked) return;
    await page.waitForTimeout(500);
  }
  throw new Error(`App did not settle: ${page.url()}`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  if (!page.url().includes("/login")) {
    await settleApp(page);
    return;
  }
  await page.locator("#login-email").waitFor({ timeout: 30000 });
  const __e2eAdmin = requireE2eAdmin();
  await page.locator("#login-email").fill(__e2eAdmin.email);
  await page.locator("#login-password").fill(__e2eAdmin.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForFunction(() => !window.location.pathname.includes("/login"), null, {
    timeout: 90000,
  });
  await settleApp(page);
}

async function waitDriveCard(page) {
  await page.getByRole("heading", { name: /Google Drive backup/i }).waitFor({
    timeout: 90000,
  });
  await page.getByText(/Backup folder:/i).waitFor({ timeout: 90000 });
  await page
    .getByText(/Checking backup folder/i)
    .waitFor({ state: "hidden", timeout: 90000 })
    .catch(() => {});
  await page.waitForTimeout(400);
}

async function openSelect(page, label) {
  await page
    .locator("div.mb-2.text-sm.font-medium", { hasText: label })
    .locator("xpath=..")
    .locator("button[role=combobox]")
    .click({ timeout: 15000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) =>
    c.newPage(),
  );
  page.on("dialog", async (d) => {
    await d.accept();
  });
  const evidence = { steps: [] };

  try {
    await login(page);

    // --- Configured property (Twenty B Stable has folder) ---
    const configuredId = "902a46b2-3ec5-40cc-aa1b-8fd7737743cb";
    await page.goto(`${BASE}/buildings/${configuredId}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await settleApp(page);
    await waitDriveCard(page);
    await page.locator("#property-drive-folder").scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    let body = await page.locator("body").innerText();
    evidence.configuredProperty = {
      showsFolderReady: /Backup folder:/i.test(body) && !/Not set up yet/i.test(
        body.match(/Backup folder:[\s\S]{0,80}/)?.[0] ?? "",
      ),
      showsVerified: /Folder access verified|Open folder/i.test(body),
    };
    await page.screenshot({
      path: path.join(OUT, "screenshots/configured-property-drive.png"),
      fullPage: true,
    });

    await page.goto(`${BASE}/buildings/${configuredId}/reports`, { waitUntil: "domcontentloaded" });
    await settleApp(page);
    await page.getByText(/PDF Report|Create report|Report status/i).first().waitFor({
      timeout: 90000,
    });
    await page.waitForTimeout(1500);
    body = await page.locator("body").innerText();
    evidence.configuredReports = {
      noAmberWarning: !/Google Drive backup is not set up/i.test(body),
      showsSavedOrFolder: /Saved to Google Drive|Backup folder:/i.test(body),
    };
    await page.screenshot({
      path: path.join(OUT, "screenshots/configured-reports-drive.png"),
      fullPage: true,
    });

    // --- Unconfigured: fresh property, no folder ---
    const stamp = Date.now().toString(36).slice(-5);
    const name = `Twenty C Drive UX ${stamp}`;
    await page.goto(`${BASE}/buildings`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await settleApp(page);
    await page.getByRole("button", { name: "New property" }).waitFor({ timeout: 90000 });
    await page.getByRole("button", { name: "New property" }).click();
    await page.getByRole("heading", { name: "Create property" }).waitFor();
    await page.getByText("Name", { exact: true }).locator("xpath=..").locator("input").fill(name);
    await page
      .getByText("Address", { exact: true })
      .locator("xpath=..")
      .locator("input")
      .fill(`${300 + (Date.now() % 200)} Drive UX Ave ${stamp}`);
    await page.getByText("City", { exact: true }).locator("xpath=..").locator("input").fill("Providence");
    await page.getByText("State", { exact: true }).locator("xpath=..").locator("input").fill("RI");
    await page.getByText("Postal code", { exact: true }).locator("xpath=..").locator("input").fill("02903");
    await page.getByRole("button", { name: "Save property" }).click();
    await page.waitForTimeout(4000);

    const { data: prop } = await admin()
      .from("properties")
      .select("id, drive_folder_id")
      .eq("organization_id", ORG)
      .eq("name", name)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!prop?.id) throw new Error("property create failed");
    evidence.unconfiguredPropertyId = prop.id;
    evidence.folderNull = prop.drive_folder_id == null;

    await page.goto(`${BASE}/buildings/${prop.id}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await settleApp(page);
    await page.getByPlaceholder("Label").waitFor({ timeout: 60000 });
    await page.getByPlaceholder("Label").fill("2BR UX");
    await page.getByPlaceholder("Beds").fill("2");
    await page.getByPlaceholder("Baths").fill("1");
    await page.getByRole("button", { name: "Add unit type" }).click();
    await page.waitForTimeout(1500);

    await waitDriveCard(page);
    await page.locator("#property-drive-folder").scrollIntoViewIfNeeded().catch(() => {});
    body = await page.locator("body").innerText();
    evidence.unconfiguredProperty = {
      notSetUp: /Not set up yet/i.test(body),
      createCta: /Create property folder/i.test(body),
      stillFinalizeCopy: /still be finalized|download reports without/i.test(body),
    };
    await page.screenshot({
      path: path.join(OUT, "screenshots/unconfigured-property-drive.png"),
      fullPage: true,
    });

    // Minimal path to final PDF without Drive folder
    await page.goto(`${BASE}/upload`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await settleApp(page);
    await openSelect(page, "Source type");
    await page.getByRole("option", { name: "Rentometer CSV", exact: true }).click();
    await openSelect(page, "Property");
    await page.getByRole("option", { name, exact: true }).click();
    await page.waitForTimeout(800);
    try {
      await openSelect(page, "Unit type (for approvals)");
      const opts = page.getByRole("option");
      if ((await opts.count()) > 0) await opts.first().click();
    } catch {
      /* optional */
    }
    await page.locator('input[type="file"]').first().setInputFiles(FILES.rentometer);
    for (let i = 0; i < 120; i++) {
      const processing = await page.getByText(/Extracting structured fields|Finalizing|Uploading…/i).count();
      const done = await page.getByText(/Live parse stored|candidates|uploaded|extraction/i).count();
      if (done > 0 && processing === 0) break;
      if (processing === 0 && i > 15) break;
      await page.waitForTimeout(1000);
    }
    evidence.uploadFile = path.basename(FILES.rentometer);
    await page.screenshot({
      path: path.join(OUT, "screenshots/upload-rentometer.png"),
      fullPage: true,
    });

    await page.goto(`${BASE}/buildings/${prop.id}/comparables`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await settleApp(page);
    await page.getByText("Pending candidates").waitFor({ timeout: 60000 });
    await page.waitForTimeout(1200);
    let accepted = 0;
    for (let round = 0; round < 12 && accepted < 5; round++) {
      const card = page
        .locator("div.rounded-lg.border")
        .filter({ hasText: /Rentometer/i })
        .filter({ hasText: /Rent \$/ })
        .filter({ has: page.getByRole("button", { name: "Accept" }) })
        .first();
      if ((await card.count()) === 0) break;
      await card.getByRole("button", { name: "Accept" }).click();
      await page.waitForTimeout(2500);
      accepted += 1;
    }
    evidence.compsAccepted = accepted;
    await page.screenshot({
      path: path.join(OUT, "screenshots/comps-accepted.png"),
      fullPage: true,
    });
    if (accepted < 3) throw new Error(`Need ≥3 accepted comps, got ${accepted}`);

    await page.goto(`${BASE}/buildings/${prop.id}/reports`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await settleApp(page);
    await page.locator("#report-title").waitFor({ timeout: 60000 });
    await page.locator("#report-title").fill(`${name} — 2BR weekly`);
    await page.locator("#report-period-start").fill("2026-11-15");
    await page.locator("#report-period-end").fill("2026-11-21");
    const prepared = page.locator("#report-prepared-by");
    if (await prepared.count()) await prepared.fill("Drive UX Agent");
    await page.getByRole("button", { name: "Create report" }).click();
    await page.waitForTimeout(3000);

    await page.goto(`${BASE}/buildings/${prop.id}/pricing`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await settleApp(page);
    await page
      .getByRole("heading", { name: /PKL recommended rent range/i })
      .waitFor({ timeout: 45000 });
    await page.locator("label", { hasText: "Low" }).locator("xpath=..").locator("input").fill("1900");
    await page.locator("label", { hasText: "High" }).locator("xpath=..").locator("input").fill("2100");
    await page.getByRole("button", { name: "Save range" }).click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Generate draft" }).click();
    for (let i = 0; i < 90; i++) {
      if ((await page.locator("textarea").count()) > 0) {
        const t = await page.locator("body").innerText();
        if (!/Generating/i.test(t)) break;
      }
      await page.waitForTimeout(2000);
    }
    if ((await page.locator("textarea").count()) === 0) {
      throw new Error("Narrative draft did not appear");
    }
    await page.getByRole("button", { name: "Approve" }).click();
    await page.waitForTimeout(8000);

    await page.goto(`${BASE}/buildings/${prop.id}/reports`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await settleApp(page);
    await page.waitForTimeout(2000);
    for (let i = 0; i < 40; i++) {
      const t = await page.locator("body").innerText();
      if (/Finalization: Ready/i.test(t)) break;
      await page.getByRole("button", { name: /Refresh status/i }).click().catch(() => {});
      await page.waitForTimeout(1500);
    }
    body = await page.locator("body").innerText();
    evidence.beforeStore = {
      warningVisible: /Google Drive backup is not set up/i.test(body),
      setupCta: /Set up backup folder/i.test(body),
      storeEnabled: await page.getByRole("button", { name: "Store final PDF" }).isEnabled(),
      finalizationReady: /Finalization: Ready/i.test(body),
      eligibleComps: (body.match(/Eligible approved comps:\s*(\d+)/i) || [])[1] ?? null,
    };
    if (!evidence.beforeStore.storeEnabled) {
      throw new Error(
        `Store final PDF disabled (eligible=${evidence.beforeStore.eligibleComps}, body snippet)`,
      );
    }
    await page.screenshot({
      path: path.join(OUT, "screenshots/unconfigured-before-store.png"),
      fullPage: true,
    });

    if (evidence.beforeStore.storeEnabled) {
      await page.getByRole("button", { name: "Store final PDF" }).click();
      await page.waitForTimeout(18000);
    }

    const mark = page.getByRole("button", { name: "Mark as completed" });
    evidence.markEnabled = (await mark.count()) > 0 && (await mark.isEnabled());
    if (evidence.markEnabled) {
      await mark.click();
      await page.waitForTimeout(5000);
    }
    body = await page.locator("body").innerText();
    evidence.afterCompleteNoFolder = {
      statusCompleted: /Report status:\s*Completed/i.test(body),
      notClaimingSaved:
        !/Saved to Google Drive:/i.test(body) &&
        !/Report status:\s*Saved to Google Drive/i.test(body),
      warningStill: /Google Drive backup is not set up|Choose a Google Drive folder/i.test(body),
      noSavingSpinnerLeft: !/Saving to Google Drive…/i.test(body),
    };
    await page.screenshot({
      path: path.join(OUT, "screenshots/unconfigured-after-complete.png"),
      fullPage: true,
    });

    // Later: set up folder and retry backup without regenerating PDF
    await page.goto(`${BASE}/buildings/${prop.id}#property-drive-folder`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await settleApp(page);
    await waitDriveCard(page);
    const createFolder = page.getByRole("button", { name: "Create property folder" });
    if ((await createFolder.count()) === 0) {
      throw new Error("Create property folder CTA missing after completion");
    }
    await createFolder.click();
    for (let i = 0; i < 45; i++) {
      const t = await page.locator("body").innerText();
      if (/Folder access verified|Open folder/i.test(t) && !/Not set up yet/i.test(t)) break;
      await page.waitForTimeout(1000);
    }
    body = await page.locator("body").innerText();
    evidence.folderCreatedLater = {
      ready: /Folder access verified|Open folder/i.test(body) && !/Not set up yet/i.test(
        body.match(/Backup folder:[\s\S]{0,100}/)?.[0] ?? "",
      ),
    };
    await page.screenshot({
      path: path.join(OUT, "screenshots/folder-created-later.png"),
      fullPage: true,
    });
    if (!evidence.folderCreatedLater.ready) throw new Error("Folder was not created later");

    await page.goto(`${BASE}/buildings/${prop.id}/reports`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await settleApp(page);
    await page.getByRole("heading", { name: /Save to Google Drive/i }).waitFor({ timeout: 60000 });
    for (let i = 0; i < 40; i++) {
      const t = await page.locator("body").innerText();
      if (!/Checking backup status/i.test(t) && /Report status:/i.test(t)) break;
      await page.waitForTimeout(1000);
    }
    // Folder was assigned after completion — refresh drive status if Save still disabled.
    const save = page.getByRole("button", { name: /Save to Google Drive|Retry Google Drive/i });
    for (let i = 0; i < 15; i++) {
      if ((await save.count()) > 0 && (await save.isEnabled())) break;
      await page.getByRole("button", { name: /Refresh status/i }).click().catch(() => {});
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await settleApp(page);
      await page.waitForTimeout(2000);
    }
    evidence.retryEnabled = (await save.count()) > 0 && (await save.isEnabled());
    if (!evidence.retryEnabled) {
      body = await page.locator("body").innerText();
      throw new Error(
        `Save to Google Drive still disabled after folder. Snippet: ${body.slice(0, 600)}`,
      );
    }
    await save.click();
    for (let i = 0; i < 50; i++) {
      const t = await page.locator("body").innerText();
      if (/Saved to Google Drive|Already saved/i.test(t) && !/Saving to Google Drive/i.test(t)) break;
      await page.waitForTimeout(1000);
    }
    body = await page.locator("body").innerText();
    evidence.afterRetry = {
      saved: /Saved to Google Drive|Report status:\s*Saved to Google Drive/i.test(body),
    };
    await page.screenshot({
      path: path.join(OUT, "screenshots/after-retry-backup.png"),
      fullPage: true,
    });

    const { data: run } = await admin()
      .from("report_runs")
      .select("id, status, saved_to_drive_at, drive_web_view_link")
      .eq("property_id", prop.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    evidence.db = run;

    const ok =
      evidence.configuredProperty?.showsFolderReady &&
      evidence.configuredReports?.noAmberWarning &&
      evidence.unconfiguredProperty?.notSetUp &&
      evidence.unconfiguredProperty?.createCta &&
      evidence.unconfiguredProperty?.stillFinalizeCopy &&
      evidence.compsAccepted >= 3 &&
      evidence.beforeStore?.warningVisible &&
      evidence.beforeStore?.setupCta &&
      evidence.beforeStore?.storeEnabled &&
      evidence.afterCompleteNoFolder?.statusCompleted &&
      evidence.afterCompleteNoFolder?.notClaimingSaved &&
      evidence.folderCreatedLater?.ready &&
      evidence.retryEnabled &&
      evidence.afterRetry?.saved &&
      (evidence.db?.status === "saved_to_drive" || evidence.db?.saved_to_drive_at != null);

    evidence.verdict = ok ? "PASS" : "PARTIAL";
    fs.writeFileSync(path.join(OUT, "evidence.json"), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } catch (e) {
    evidence.fatal = String(e).slice(0, 800);
    evidence.verdict = "FAIL";
    fs.writeFileSync(path.join(OUT, "evidence.json"), JSON.stringify(evidence, null, 2));
    console.error(JSON.stringify(evidence, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
}

main();
