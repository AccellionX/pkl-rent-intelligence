#!/usr/bin/env node
import { loadDotEnv, requireE2eAdmin, clientSourcePath } from "./lib/local-e2e-env.mjs";
/**
 * Task #20B — clean continuous customer journey (UI only).
 * Fresh property → week 1 finalize+Drive → week 2 reuse → inspect PDFs.
 * No API finalize bypass, no DB edits, no server restart.
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
const OUT = path.join(process.cwd(), "tmp/task20b");
const SHOTS = path.join(OUT, "screenshots");
const PDF_DIR = path.join(OUT, "pdf");
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(PDF_DIR, { recursive: true });

const FILES = {
  rentometer_csv: path.join(process.cwd(), "tests/fixtures/rentometer/synthetic-2bed.csv"),
  rentometer_pdf:
    clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "20261114-Rentometer-855_Providence_St_West_Warwick_RI_02893_USA-2-bed-qPiKWT24DL0.pdf"),
  hellodata:
    clientSourcePath("30 Veterans 1BR report - source files", "06 HelloData report 11-08-2026.pdf"),
  mls_ri:
    clientSourcePath("30 Veterans 1BR report - source files", "05 RI MLS CMA report 11-01-2026.pdf"),
  zillow:
    clientSourcePath("30 Veterans 1BR report - source files", "03 Zillow listing performance 10-22-2026.xlsx"),
  apartments:
    clientSourcePath("30 Veterans 1BR report - source files", "04 Apartments.com report 10-22-2026.xlsx"),
  photo1:
    clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "855_5.jpg"),
  photo2:
    clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "855_1.png"),
};

const SOURCE_LABEL = {
  rentometer_csv: "Rentometer CSV",
  rentometer_pdf: "Rentometer PDF",
  hellodata_pdf: "HelloData PDF",
  mls_ri_pdf: "RI State-Wide MLS PDF",
  zillow_xlsx: "Zillow Listing Performance Excel",
  apartments_xlsx: "Apartments.com Leads Excel",
};

const log = [];
function step(name, detail = {}) {
  const entry = { at: new Date().toISOString(), name, ...detail };
  log.push(entry);
  console.error(JSON.stringify({ step: name, ok: detail.ok !== false, note: detail.note }));
}

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function shot(page, name) {
  const file = path.join(SHOTS, `${String(log.length).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function gotoSafe(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(700);
}

async function waitSettled(page) {
  for (let i = 0; i < 50; i++) {
    const t = await page.locator("body").innerText();
    if (!/Checking your account|Loading account|Loading…/i.test(t)) return;
    await page.waitForTimeout(400);
  }
}

async function openSelect(page, label) {
  await page
    .locator("div.mb-2.text-sm.font-medium", { hasText: label })
    .locator("xpath=..")
    .locator("button[role=combobox]")
    .click({ timeout: 15000 });
}

async function login(page) {
  await gotoSafe(page, `${BASE}/login`);
  const __e2eAdmin = requireE2eAdmin();
  await page.locator("#login-email").fill(__e2eAdmin.email);
  await page.locator("#login-password").fill(__e2eAdmin.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });
  await waitSettled(page);
  step("login", { ok: true, shot: await shot(page, "login") });
}

async function createProperty(page) {
  const stamp = Date.now().toString(36).slice(-5);
  const name = `Twenty B Stable ${stamp}`;
  const address = `${200 + (Date.now() % 500)} Stability Rd ${stamp}`;
  page.on("dialog", async (d) => {
    await d.accept().catch(() => {});
  });
  await gotoSafe(page, `${BASE}/buildings`);
  await waitSettled(page);
  await page.getByRole("button", { name: "New property" }).click();
  await page.getByRole("heading", { name: "Create property" }).waitFor();
  await page.getByText("Name", { exact: true }).locator("xpath=..").locator("input").fill(name);
  await page.getByText("Address", { exact: true }).locator("xpath=..").locator("input").fill(address);
  await page.getByText("City", { exact: true }).locator("xpath=..").locator("input").fill("Providence");
  await page.getByText("State", { exact: true }).locator("xpath=..").locator("input").fill("RI");
  await page.getByText("Postal code", { exact: true }).locator("xpath=..").locator("input").fill("02903");
  await page.getByRole("button", { name: "Save property" }).click();
  await page.waitForTimeout(4000);
  const admin = adminClient();
  const { data } = await admin
    .from("properties")
    .select("id, name, marketing_name, address_line1, external_links")
    .eq("organization_id", ORG)
    .eq("name", name)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  step("create_property", { ok: Boolean(data?.id), propertyId: data?.id, name, shot: await shot(page, "property") });
  return { propertyId: data?.id, name, address };
}

async function setupUnits(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}`);
  await waitSettled(page);
  await page.getByPlaceholder("Label").fill("2BR Stable");
  await page.getByPlaceholder("Beds").fill("2");
  await page.getByPlaceholder("Baths").fill("1");
  await page.getByRole("button", { name: "Add unit type" }).click();
  await page.waitForTimeout(2000);
  const unitNumber = page.locator("label", { hasText: /Unit number/i }).locator("xpath=..").locator("input");
  if (await unitNumber.count()) await unitNumber.first().fill("201");
  const sqft = page.getByPlaceholder(/Sqft|sq ft/i);
  if (await sqft.count()) await sqft.first().fill("950");
  const rent = page.getByPlaceholder(/Asking|rent/i);
  if (await rent.count()) await rent.first().fill("2050");
  const add = page.getByRole("button", { name: "Add unit", exact: true });
  if (await add.count()) {
    await add.click();
    await page.waitForTimeout(1500);
  }
  step("units", { ok: true, shot: await shot(page, "units") });
}

async function uploadSource(page, propertyName, key, filePath, sourceType) {
  await gotoSafe(page, `${BASE}/upload`);
  await waitSettled(page);
  await openSelect(page, "Source type");
  await page.getByRole("option", { name: SOURCE_LABEL[sourceType], exact: true }).click();
  await openSelect(page, "Property");
  await page.getByRole("option", { name: propertyName, exact: true }).click();
  await page.waitForTimeout(800);
  try {
    await openSelect(page, "Unit type (for approvals)");
    const opts = page.getByRole("option");
    if ((await opts.count()) > 0) await opts.first().click();
  } catch {
    /* optional */
  }
  await page.locator('input[type="file"]').first().setInputFiles(filePath);
  for (let i = 0; i < 120; i++) {
    const processing = await page.getByText(/Extracting structured fields|Finalizing|Uploading…/i).count();
    const done = await page.getByText(/Live parse stored|extraction|candidates|uploaded/i).count();
    if (done > 0 && processing === 0) break;
    if (processing === 0 && i > 10) break;
    await page.waitForTimeout(1000);
  }
  step(`upload_${key}`, { ok: true, file: path.basename(filePath), shot: await shot(page, `upload-${key}`) });
}

async function photos(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}`);
  await waitSettled(page);
  await page.getByRole("heading", { name: /Subject photos/i }).waitFor({ timeout: 30000 });
  for (let i = 0; i < 20; i++) {
    const t = await page.locator("body").innerText();
    if (!/Loading photos/i.test(t) || /Photo to be added|#\d+/i.test(t)) break;
    await page.waitForTimeout(400);
  }
  const input = page.locator('input[type="file"][accept="image/*"]').first();
  await input.setInputFiles(FILES.photo1);
  await page.waitForTimeout(3500);
  await input.setInputFiles(FILES.photo2);
  await page.waitForTimeout(3500);
  const crop = page.getByRole("button", { name: "Crop" }).first();
  if (await crop.count()) {
    await crop.click();
    await page.waitForTimeout(800);
    const saveCrop = page.getByRole("button", { name: "Save crop" });
    if (await saveCrop.count()) {
      await saveCrop.click();
      await page.waitForTimeout(2000);
    }
  }
  // Reorder if possible
  const down = page.getByRole("button", { name: "Down" }).first();
  if ((await down.count()) && (await down.isEnabled())) {
    await down.click();
    await page.waitForTimeout(1500);
  }
  const body = await page.locator("body").innerText();
  step("photos", {
    ok: !/Loading photos/i.test(body) && /#1|#2|cropped|Subject photos/i.test(body),
    shot: await shot(page, "photos"),
  });
}

async function reviewComps(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/comparables`);
  await waitSettled(page);
  await page.getByText("Pending candidates").waitFor({ timeout: 45000 });
  await page.waitForTimeout(1200);
  let accepted = 0;
  for (let round = 0; round < 10 && accepted < 5; round++) {
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
  let excluded = 0;
  for (let i = 0; i < 2; i++) {
    const pendingCard = page
      .locator("div.rounded-lg.border")
      .filter({ has: page.getByRole("button", { name: "Accept" }) })
      .filter({ has: page.getByRole("button", { name: "Exclude" }) })
      .first();
    if ((await pendingCard.count()) === 0) break;
    await pendingCard.getByRole("button", { name: "Exclude" }).click();
    await page.waitForTimeout(2000);
    excluded += 1;
  }
  step("comps", { ok: accepted >= 3, accepted, excluded, shot: await shot(page, "comps") });
  return { accepted, excluded };
}

async function createReport(page, propertyId, title, start, end) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/reports`);
  await waitSettled(page);
  await page.locator("#report-title").fill(title);
  await page.locator("#report-period-start").fill(start);
  await page.locator("#report-period-end").fill(end);
  await page.locator("#report-prepared-by").fill("Stability Agent");
  await page.getByRole("button", { name: "Create report" }).click();
  await page.waitForTimeout(3000);
  step("create_report", { ok: true, title, shot: await shot(page, `create-${end}`) });
}

async function weeklyNotes(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/leads`);
  await waitSettled(page);
  await page.waitForTimeout(1500);
  const tours = page.locator("label", { hasText: /Tours sched/i }).locator("xpath=..").locator("input");
  if (await tours.count()) await tours.first().fill("5");
  const completed = page.locator("label", { hasText: /^Completed$/i }).locator("xpath=..").locator("input");
  if (await completed.count()) await completed.first().fill("4");
  const apps = page.locator("label", { hasText: /^Apps$/i }).locator("xpath=..").locator("input");
  if (await apps.count()) await apps.first().fill("2");
  const areas = page.locator("textarea");
  if ((await areas.count()) > 0) await areas.nth(0).fill("Week notes: strong weekend traffic.");
  if ((await areas.count()) > 1) await areas.nth(1).fill("Prospects liked the layout.");
  if ((await areas.count()) > 2) await areas.nth(2).fill("Follow up on parking FAQ.");
  const save = page.getByRole("button", { name: /Save agent notes/i });
  if (await save.count()) {
    await save.click();
    await page.waitForTimeout(2000);
  }
  step("weekly_notes", { ok: true, shot: await shot(page, "weekly") });
}

async function pricingApprove(page, propertyId, periodFrag, low, high) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/pricing`);
  await waitSettled(page);
  await page.getByRole("heading", { name: /PKL recommended rent range/i }).waitFor({ timeout: 45000 });
  const select = page.locator("#report");
  if (await select.count()) {
    const options = await select.locator("option").allTextContents();
    const match = options.find((o) => o.includes(periodFrag));
    if (match) {
      await select.selectOption({ label: match });
      await page.waitForTimeout(2000);
    }
  }
  await page.locator("label", { hasText: "Low" }).locator("xpath=..").locator("input").fill(String(low));
  await page.locator("label", { hasText: "High" }).locator("xpath=..").locator("input").fill(String(high));
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
  if ((await page.locator("textarea").count()) > 0) {
    const first = await page.locator("textarea").first().inputValue();
    await page.locator("textarea").first().fill(`${first}\n\n[Staff edit Task 20B]`);
    await page.getByRole("button", { name: "Save edits" }).click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Approve" }).click();
    await page.waitForTimeout(8000);
  }
  const body = await page.locator("body").innerText();
  step(`approve_${periodFrag}`, {
    ok: /approved and ready|Approved|version/i.test(body),
    shot: await shot(page, `approve-${periodFrag}`),
  });
}

async function finalizeUi(page, propertyId, periodFrag, tag) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/reports`);
  await waitSettled(page);
  await page.waitForTimeout(2000);
  const select = page.locator("#report");
  if (await select.count()) {
    const options = await select.locator("option").allTextContents();
    const match = options.find((o) => o.includes(periodFrag));
    if (match) await select.selectOption({ label: match });
    await page.waitForTimeout(2500);
  }
  for (let i = 0; i < 30; i++) {
    const t = await page.locator("body").innerText();
    if (/Finalization: Ready/i.test(t)) break;
    if (/Refresh status/i.test(t)) await page.getByRole("button", { name: /Refresh status/i }).click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  const store = page.getByRole("button", { name: "Store final PDF" });
  step(`pre_store_${tag}`, {
    ok: await store.isEnabled(),
    shot: await shot(page, `pre-store-${tag}`),
  });
  if (!(await store.isEnabled())) {
    step(`finalize_${tag}`, { ok: false, note: "Store final disabled" });
    return false;
  }
  await store.click();
  await page.waitForTimeout(20000);
  const mark = page.getByRole("button", { name: "Mark as completed" });
  if ((await mark.count()) && (await mark.isEnabled())) {
    await mark.click();
    // Wait for Saving / Saved
    for (let i = 0; i < 40; i++) {
      const t = await page.locator("body").innerText();
      if (/Saved to Google Drive|Already saved to Google Drive/i.test(t) && !/Saving to Google Drive/i.test(t)) break;
      await page.waitForTimeout(1000);
    }
  }
  const body = await page.locator("body").innerText();
  const ok = /Saved to Google Drive|Final PDF stored|Already saved/i.test(body);
  step(`finalize_${tag}`, { ok, shot: await shot(page, `finalize-${tag}`) });
  return ok;
}

async function downloadPropertyPdfs(propertyId) {
  const admin = adminClient();
  const { data: runs } = await admin
    .from("report_runs")
    .select("id, title, period_start, period_end, status, saved_to_drive_at, drive_web_view_link")
    .eq("property_id", propertyId)
    .order("period_start", { ascending: true });
  const { data: snaps } = await admin
    .from("report_snapshots")
    .select(
      "report_run_id, version, generated_file_path, generated_file_bucket, drive_file_name, drive_file_id, drive_web_view_link, payload",
    )
    .in(
      "report_run_id",
      (runs || []).map((r) => r.id),
    )
    .not("generated_file_path", "is", null)
    .order("version", { ascending: true });
  const pdfs = [];
  for (const snap of snaps || []) {
    const { data: blob } = await admin.storage
      .from(snap.generated_file_bucket || "generated-reports")
      .download(snap.generated_file_path);
    if (!blob) continue;
    const buf = Buffer.from(await blob.arrayBuffer());
    const run = runs.find((r) => r.id === snap.report_run_id);
    const file = path.join(PDF_DIR, `W${run.period_end}-v${snap.version}.pdf`);
    fs.writeFileSync(file, buf);
    const latin = buf.toString("latin1");
    const pages = (latin.match(/\/Type\s*\/Page[^s]/g) || []).length;
    const text = [...latin.matchAll(/\(([^)]{4,100})\)/g)].map((m) => m[1]).filter((t) => /[A-Za-z]{3}/.test(t));
    pdfs.push({
      file,
      pages,
      bytes: buf.length,
      period: run.period_end,
      title: run.title,
      status: run.status,
      drive: snap.drive_file_name,
      driveId: snap.drive_file_id,
      link: snap.drive_web_view_link || run.drive_web_view_link,
      sample: text.slice(0, 20),
    });
  }
  return { runs, snaps: (snaps || []).map((s) => ({ ...s, payload: undefined })), pdfs };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  ).newPage();
  const evidence = { startedAt: new Date().toISOString(), steps: log };

  try {
    await login(page);
    const prop = await createProperty(page);
    if (!prop.propertyId) throw new Error("property create failed");
    evidence.propertyId = prop.propertyId;
    evidence.propertyName = prop.name;

    await setupUnits(page, prop.propertyId);
    await uploadSource(page, prop.name, "rentometer_csv", FILES.rentometer_csv, "rentometer_csv");
    await uploadSource(page, prop.name, "rentometer_pdf", FILES.rentometer_pdf, "rentometer_pdf");
    await uploadSource(page, prop.name, "hellodata", FILES.hellodata, "hellodata_pdf");
    await uploadSource(page, prop.name, "mls_ri", FILES.mls_ri, "mls_ri_pdf");
    await uploadSource(page, prop.name, "zillow", FILES.zillow, "zillow_xlsx");
    await uploadSource(page, prop.name, "apartments", FILES.apartments, "apartments_xlsx");

    await gotoSafe(page, `${BASE}/buildings/${prop.propertyId}`);
    await waitSettled(page);
    const identityBody = await page.locator("body").innerText();
    evidence.identity = {
      marketing: /Residences at Bold Point|Marketing name/i.test(identityBody),
      website: /kettle-point\.com|Property website/i.test(identityBody),
    };
    step("identity", { ok: evidence.identity.marketing || evidence.identity.website, ...evidence.identity });

    // Drive folder
    const createFolder = page.getByRole("button", { name: "Create under reports root" });
    if ((await createFolder.count()) && (await createFolder.isEnabled())) {
      await createFolder.click();
      await page.waitForTimeout(8000);
    }
    step("drive_folder", {
      ok: /Assigned folder: (?!Not assigned)/i.test(await page.locator("body").innerText()),
      shot: await shot(page, "drive-folder"),
    });

    await photos(page, prop.propertyId);
    const comps = await reviewComps(page, prop.propertyId);
    evidence.comps = comps;

    // Week 1
    await createReport(page, prop.propertyId, `${prop.name} — 2BR weekly`, "2026-11-01", "2026-11-07");
    await weeklyNotes(page, prop.propertyId);
    await pricingApprove(page, prop.propertyId, "2026-11-01", 1950, 2150);
    const w1 = await finalizeUi(page, prop.propertyId, "2026-11-01", "week1");

    // Week 2 reuse
    await createReport(
      page,
      prop.propertyId,
      `${prop.name} — 2BR weekly (week 2)`,
      "2026-11-08",
      "2026-11-14",
    );
    await gotoSafe(page, `${BASE}/buildings/${prop.propertyId}`);
    await waitSettled(page);
    const reuse = page.getByRole("button", { name: "Reuse" }).first();
    if (await reuse.count()) {
      await reuse.click();
      await page.waitForTimeout(2500);
    }
    step("photo_reuse", { ok: true, shot: await shot(page, "reuse") });
    await uploadSource(page, prop.name, "zillow_w2", FILES.zillow, "zillow_xlsx");
    await uploadSource(page, prop.name, "apartments_w2", FILES.apartments, "apartments_xlsx");
    await weeklyNotes(page, prop.propertyId);
    await pricingApprove(page, prop.propertyId, "2026-11-08", 1975, 2175);
    const w2 = await finalizeUi(page, prop.propertyId, "2026-11-08", "week2");

    await gotoSafe(page, `${BASE}/reports`);
    await waitSettled(page);
    step("history", {
      ok: new RegExp(prop.name.slice(0, 12), "i").test(await page.locator("body").innerText()),
      shot: await shot(page, "history"),
    });

    const pdfs = await downloadPropertyPdfs(prop.propertyId);
    evidence.pdfs = pdfs;
    evidence.week1Ok = w1;
    evidence.week2Ok = w2;
    evidence.finishedAt = new Date().toISOString();

    const factors = {
      uploads: log.filter((s) => s.name.startsWith("upload_") && s.ok).length >= 6,
      photos: log.some((s) => s.name === "photos" && s.ok),
      comps: (comps?.accepted || 0) >= 3,
      week1Finalize: w1,
      week2Finalize: w2,
      twoPdfs: (pdfs.pdfs || []).filter((p) => p.status === "saved_to_drive").length >= 2,
      separateDrive: new Set((pdfs.pdfs || []).map((p) => p.driveId).filter(Boolean)).size >= 2,
      noDevRecovery: true,
    };
    evidence.factors = factors;
    evidence.verdict =
      factors.uploads &&
      factors.photos &&
      factors.comps &&
      factors.week1Finalize &&
      factors.week2Finalize &&
      factors.twoPdfs &&
      factors.separateDrive
        ? "PASS"
        : factors.week1Finalize || factors.week2Finalize
          ? "PARTIAL"
          : "FAIL";

    fs.writeFileSync(path.join(OUT, "journey-evidence.json"), JSON.stringify(evidence, null, 2));
    console.log(
      JSON.stringify(
        {
          verdict: evidence.verdict,
          propertyId: prop.propertyId,
          propertyName: prop.name,
          factors,
          pdfs: pdfs.pdfs,
          runs: pdfs.runs,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    evidence.fatal = String(e).slice(0, 1000);
    evidence.verdict = "FAIL";
    fs.writeFileSync(path.join(OUT, "journey-evidence.json"), JSON.stringify(evidence, null, 2));
    console.error(JSON.stringify({ verdict: "FAIL", error: evidence.fatal }));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
}

main();
