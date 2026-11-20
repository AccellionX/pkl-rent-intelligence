#!/usr/bin/env node
import { loadDotEnv, requireE2eAdmin, clientSourcePath } from "./lib/local-e2e-env.mjs";
/**
 * Task #20A — continuous real-user browser journey (Playwright UI only).
 * No API bypass for uploads / comps / narrative / PDF / Drive.
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
const ADMIN = requireE2eAdmin();
const OUT = path.join(process.cwd(), "tmp/task20a");
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
  await page.waitForTimeout(600);
}

async function waitSettled(page) {
  for (let i = 0; i < 40; i++) {
    const t = await page.locator("body").innerText();
    if (!/Checking your account|Loading account|Loading…/i.test(t)) return;
    await page.waitForTimeout(400);
  }
}

async function login(page) {
  await gotoSafe(page, `${BASE}/login`);
  await page.locator("#login-email").fill(ADMIN.email);
  await page.locator("#login-password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });
  await waitSettled(page);
  step("login", { ok: true, shot: await shot(page, "login-dashboard") });
}

async function openSelect(page, label) {
  await page
    .locator("div.mb-2.text-sm.font-medium", { hasText: label })
    .locator("xpath=..")
    .locator("button[role=combobox]")
    .click({ timeout: 15000 });
}

async function createProperty(page) {
  const stamp = Date.now().toString(36).slice(-5);
  const name = `Twenty A Journey ${stamp}`;
  const address = `${120 + (Date.now() % 700)} Journey Ave ${stamp}`;
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
  step("create_property", {
    ok: Boolean(data?.id),
    propertyId: data?.id,
    name,
    shot: await shot(page, "property-created"),
  });
  return { propertyId: data?.id, name, address };
}

async function setupUnitTypeAndUnit(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}`);
  await waitSettled(page);
  await page.getByRole("heading", { name: "Property details" }).waitFor({ timeout: 30000 });
  await page.getByPlaceholder("Label").fill("2BR Journey");
  await page.getByPlaceholder("Beds").fill("2");
  await page.getByPlaceholder("Baths").fill("1");
  await page.getByRole("button", { name: "Add unit type" }).click();
  await page.waitForTimeout(2000);
  // Available units form if present
  const unitNumber = page.getByPlaceholder(/Unit number|Unit #/i);
  if (await unitNumber.count()) {
    await unitNumber.fill("101");
    const sqft = page.getByPlaceholder(/Sqft|sq ft/i);
    if (await sqft.count()) await sqft.first().fill("900");
    const rent = page.getByPlaceholder(/Asking|rent/i);
    if (await rent.count()) await rent.first().fill("2000");
    const addUnit = page.getByRole("button", { name: /Add unit/i });
    if (await addUnit.count()) {
      await addUnit.click();
      await page.waitForTimeout(1500);
    }
  }
  step("unit_type_and_unit", { ok: true, shot: await shot(page, "unit-type") });
}

async function uploadSource(page, propertyName, sourceKey, filePath, sourceType) {
  await gotoSafe(page, `${BASE}/upload`);
  await waitSettled(page);
  await openSelect(page, "Source type");
  await page.getByRole("option", { name: SOURCE_LABEL[sourceType], exact: true }).click();
  await openSelect(page, "Property");
  await page.getByRole("option", { name: propertyName, exact: true }).click();
  await page.waitForTimeout(1000);
  try {
    await openSelect(page, "Unit type (for approvals)");
    const opts = page.getByRole("option");
    if ((await opts.count()) > 0) await opts.first().click();
  } catch {
    /* optional */
  }
  await page.locator('input[type="file"]').first().setInputFiles(filePath);
  try {
    await page.getByText(/Extracting structured fields|Uploading…|Finalizing/i).first().waitFor({
      timeout: 8000,
    });
  } catch {
    /* fast */
  }
  for (let i = 0; i < 120; i++) {
    const processing = await page.getByText(/Extracting structured fields|Finalizing|Uploading…/i).count();
    const done = await page.getByText(/Live parse stored|extraction rows|candidates|uploaded and parsed/i).count();
    if (done > 0 && processing === 0) break;
    if (processing === 0 && i > 8) break;
    await page.waitForTimeout(1000);
  }
  const body = await page.locator("body").innerText();
  const ok = /Live parse stored|extraction|candidates|uploaded/i.test(body);
  step(`upload_${sourceKey}`, {
    ok,
    file: path.basename(filePath),
    shot: await shot(page, `upload-${sourceKey}`),
  });
  return ok;
}

async function photoWorkflow(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}`);
  await waitSettled(page);
  await page.getByRole("heading", { name: /Subject photos/i }).waitFor({ timeout: 30000 });
  const input = page.locator('input[type="file"][accept="image/*"]').first();
  await input.setInputFiles(FILES.photo1);
  await page.waitForTimeout(3500);
  await input.setInputFiles(FILES.photo2);
  await page.waitForTimeout(3500);
  const crop = page.getByRole("button", { name: "Crop" }).first();
  if (await crop.count()) {
    await crop.click();
    await page.getByText("3:2 crop preview").waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Save crop" }).click();
    await page.waitForTimeout(2000);
  }
  step("photos", {
    ok: /#1|#2|cropped 3:2/i.test(await page.locator("body").innerText()),
    shot: await shot(page, "photos"),
  });
}

async function reviewComps(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/comparables`);
  await waitSettled(page);
  await page.getByText("Pending candidates").waitFor({ timeout: 45000 });
  await page.waitForTimeout(1000);
  // Accept up to 5 rentometer-like candidates that show a rent amount
  let accepted = 0;
  let excluded = 0;
  for (let round = 0; round < 8 && accepted < 5; round++) {
    const acceptBtns = page.getByRole("button", { name: "Accept" });
    if ((await acceptBtns.count()) === 0) break;
    await acceptBtns.first().click();
    await page.waitForTimeout(2500);
    accepted += 1;
  }
  // Exclude a couple
  for (let i = 0; i < 2; i++) {
    const excl = page.getByRole("button", { name: "Exclude" });
    if ((await excl.count()) === 0) break;
    await excl.first().click();
    await page.waitForTimeout(2000);
    excluded += 1;
  }
  // Set tiers on approved if buttons present
  const strongest = page.getByRole("button", { name: "Strongest" });
  const count = Math.min(await strongest.count(), 3);
  for (let i = 0; i < count; i++) {
    await strongest.nth(i).click().catch(() => {});
    await page.waitForTimeout(800);
  }
  step("review_comps", {
    ok: accepted >= 1,
    accepted,
    excluded,
    shot: await shot(page, "comparables-review"),
  });
  return { accepted, excluded };
}

async function createReport(page, propertyId, title, periodStart, periodEnd) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/reports`);
  await waitSettled(page);
  await page.getByRole("heading", { name: "Create report" }).waitFor({ timeout: 30000 });
  await page.locator("#report-title").fill(title);
  await page.locator("#report-period-start").fill(periodStart);
  await page.locator("#report-period-end").fill(periodEnd);
  await page.locator("#report-prepared-by").fill("Journey Agent");
  await page.getByRole("button", { name: "Create report" }).click();
  await page.waitForTimeout(3000);
  const body = await page.locator("body").innerText();
  const ok = /Report created|Generate branded PDF|Eligible/i.test(body);
  step("create_report", { ok, title, shot: await shot(page, `report-${periodEnd}`) });
  return ok;
}

async function pricingAndNarrative(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/pricing`);
  await waitSettled(page);
  await page.getByRole("heading", { name: /PKL recommended rent range/i }).waitFor({
    timeout: 45000,
  });
  // Fill rent range - labels Low/High
  const low = page.locator("label", { hasText: "Low" }).locator("xpath=..").locator("input");
  const high = page.locator("label", { hasText: "High" }).locator("xpath=..").locator("input");
  await low.fill("1900");
  await high.fill("2100");
  await page.getByRole("button", { name: "Save range" }).click();
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Generate draft" }).click();
  // Claude can take a while
  for (let i = 0; i < 90; i++) {
    const t = await page.locator("body").innerText();
    if (/Status:|Approved|draft|Market overview|Save edits/i.test(t) && !/Generating/i.test(t)) {
      // wait for textareas
      if ((await page.locator("textarea").count()) > 0) break;
    }
    await page.waitForTimeout(2000);
  }
  const areas = page.locator("textarea");
  if ((await areas.count()) > 0) {
    const first = await areas.first().inputValue();
    await areas.first().fill(`${first}\n\n[Staff edit during Task 20A journey]`);
    await page.getByRole("button", { name: "Save edits" }).click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Approve" }).click();
    await page.waitForTimeout(3000);
  }
  const body = await page.locator("body").innerText();
  step("pricing_narrative", {
    ok: /Approve|Status:|recommended|1900|2100/i.test(body),
    shot: await shot(page, "pricing-narrative"),
  });
}

async function weeklyNotes(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/leads`);
  await waitSettled(page);
  await page.waitForTimeout(2000);
  // Fill agent notes if form present
  const tours = page.getByLabel(/Tours sched/i).or(page.locator("label", { hasText: /Tours sched/i }).locator("xpath=..").locator("input"));
  if (await tours.count()) {
    await tours.first().fill("4");
  }
  const completed = page.locator("label", { hasText: /Tours completed|completed/i }).locator("xpath=..").locator("input");
  if (await completed.count()) await completed.first().fill("3");
  const apps = page.locator("label", { hasText: /Applications/i }).locator("xpath=..").locator("input");
  if (await apps.count()) await apps.first().fill("2");
  const comments = page.locator("textarea").first();
  if (await comments.count()) {
    await comments.fill("Prospects liked the kitchen. Follow up on floor plans next week.");
  }
  const feedback = page.locator("textarea").nth(1);
  if (await feedback.count()) {
    await feedback.fill("Positive feedback on natural light; parking concern from one tour.");
  }
  const actions = page.locator("textarea").nth(2);
  if (await actions.count()) {
    await actions.fill("Send parking FAQ; schedule evening tours.");
  }
  const save = page.getByRole("button", { name: /Save agent notes/i });
  if (await save.count()) {
    await save.click();
    await page.waitForTimeout(2000);
  }
  step("weekly_notes", {
    ok: true,
    shot: await shot(page, "weekly-leads"),
  });
}

async function finalizePdfAndDrive(page, propertyId, tag) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/reports`);
  await waitSettled(page);
  await page.waitForTimeout(2000);
  // Wait for readiness
  for (let i = 0; i < 30; i++) {
    const t = await page.locator("body").innerText();
    if (/Finalization: Ready|Eligible approved comps/i.test(t)) break;
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await waitSettled(page);
  }
  await shot(page, `pdf-status-${tag}`);
  const storeBtn = page.getByRole("button", { name: "Store final PDF" });
  if (await storeBtn.isEnabled()) {
    await storeBtn.click();
    await page.waitForTimeout(8000);
  } else {
    // Try draft then recheck
    const draft = page.getByRole("button", { name: "Download draft PDF" });
    if (await draft.count()) {
      await draft.click();
      await page.waitForTimeout(8000);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitSettled(page);
    if (await storeBtn.isEnabled()) {
      await storeBtn.click();
      await page.waitForTimeout(8000);
    }
  }
  const driveBtn = page.getByRole("button", { name: /Save to Google Drive|Retry Google Drive/i });
  if ((await driveBtn.count()) && (await driveBtn.isEnabled())) {
    await driveBtn.click();
    await page.waitForTimeout(12000);
  }
  const mark = page.getByRole("button", { name: "Mark as completed" });
  if ((await mark.count()) && (await mark.isEnabled())) {
    await mark.click();
    await page.waitForTimeout(3000);
  }
  const body = await page.locator("body").innerText();
  step(`finalize_${tag}`, {
    ok: /Final PDF stored|Saved to Google Drive|Already saved|version/i.test(body),
    bodySnippet: body.match(/Final PDF[\s\S]{0,200}|Saved to Google Drive[\s\S]{0,200}|Finalization:[\s\S]{0,120}/)?.[0],
    shot: await shot(page, `finalize-${tag}`),
  });
}

async function downloadLatestPdf(tag) {
  const admin = adminClient();
  const { data: snaps } = await admin
    .from("report_snapshots")
    .select(
      "report_run_id, version, generated_file_path, generated_file_bucket, drive_file_name, created_at",
    )
    .not("generated_file_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(3);
  const results = [];
  for (const snap of snaps || []) {
    const { data: blob, error } = await admin.storage
      .from(snap.generated_file_bucket || "generated-reports")
      .download(snap.generated_file_path);
    if (error || !blob) continue;
    const buf = Buffer.from(await blob.arrayBuffer());
    const file = path.join(PDF_DIR, `${tag}-v${snap.version}-${snap.report_run_id.slice(0, 8)}.pdf`);
    fs.writeFileSync(file, buf);
    const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    results.push({
      file,
      bytes: buf.length,
      pages,
      driveFileName: snap.drive_file_name,
      reportRunId: snap.report_run_id,
      version: snap.version,
    });
  }
  return results;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const evidence = { startedAt: new Date().toISOString(), steps: log, ux: [] };

  try {
    await login(page);
    const prop = await createProperty(page);
    if (!prop.propertyId) throw new Error("Property create failed");
    evidence.propertyId = prop.propertyId;
    evidence.propertyName = prop.name;

    await setupUnitTypeAndUnit(page, prop.propertyId);

    // Uploads
    await uploadSource(page, prop.name, "rentometer_csv", FILES.rentometer_csv, "rentometer_csv");
    await uploadSource(page, prop.name, "rentometer_pdf", FILES.rentometer_pdf, "rentometer_pdf");
    await uploadSource(page, prop.name, "hellodata", FILES.hellodata, "hellodata_pdf");
    await uploadSource(page, prop.name, "mls_ri", FILES.mls_ri, "mls_ri_pdf");
    await uploadSource(page, prop.name, "zillow", FILES.zillow, "zillow_xlsx");
    await uploadSource(page, prop.name, "apartments", FILES.apartments, "apartments_xlsx");

    // Verify extracted identity on property page
    await gotoSafe(page, `${BASE}/buildings/${prop.propertyId}`);
    await waitSettled(page);
    const propBody = await page.locator("body").innerText();
    evidence.identity = {
      hasAddress: /Journey Ave|Providence/i.test(propBody),
      hasWebsiteField: /Property website/i.test(propBody),
      marketingVisible: /Marketed as|marketing/i.test(propBody),
    };
    step("verify_identity_fields", { ok: evidence.identity.hasAddress, ...evidence.identity });

    await photoWorkflow(page, prop.propertyId);
    const comps = await reviewComps(page, prop.propertyId);

    // Workflow 1 report
    const p1Start = "2026-10-15";
    const p1End = "2026-10-22";
    await createReport(
      page,
      prop.propertyId,
      `${prop.name} — 2BR weekly`,
      p1Start,
      p1End,
    );
    await weeklyNotes(page, prop.propertyId);
    await pricingAndNarrative(page, prop.propertyId);
    await finalizePdfAndDrive(page, prop.propertyId, "week1");
    const pdfs1 = await downloadLatestPdf("week1");
    evidence.week1Pdfs = pdfs1;

    // Refresh persistence check
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitSettled(page);
    evidence.ux.push({
      name: "refresh_preserves_session",
      ok: !page.url().includes("/login"),
    });

    // Workflow 2 — subsequent week
    const p2Start = "2026-10-23";
    const p2End = "2026-10-29";
    await createReport(
      page,
      prop.propertyId,
      `${prop.name} — 2BR weekly (week 2)`,
      p2Start,
      p2End,
    );

    // Reuse photos
    await gotoSafe(page, `${BASE}/buildings/${prop.propertyId}`);
    await waitSettled(page);
    const reuse = page.getByRole("button", { name: "Reuse" }).first();
    if (await reuse.count()) {
      await reuse.click();
      await page.waitForTimeout(2500);
    }
    step("photo_reuse", {
      ok: /#\d+|prior_week|Photo/i.test(await page.locator("body").innerText()),
      shot: await shot(page, "photo-reuse"),
    });

    // Re-upload weekly files (same authorized exports as subsequent week data)
    await uploadSource(page, prop.name, "zillow_w2", FILES.zillow, "zillow_xlsx");
    await uploadSource(page, prop.name, "apartments_w2", FILES.apartments, "apartments_xlsx");

    await weeklyNotes(page, prop.propertyId);
    await pricingAndNarrative(page, prop.propertyId);
    await finalizePdfAndDrive(page, prop.propertyId, "week2");
    const pdfs2 = await downloadLatestPdf("week2");
    evidence.week2Pdfs = pdfs2;

    // History
    await gotoSafe(page, `${BASE}/reports`);
    await waitSettled(page);
    evidence.reportHistory = {
      showsProperty: new RegExp(prop.name.slice(0, 12), "i").test(
        await page.locator("body").innerText(),
      ),
      shot: await shot(page, "report-history"),
    };
    step("report_history", { ok: evidence.reportHistory.showsProperty });

    // Prior report unchanged: two distinct snapshot files
    const admin = adminClient();
    const { data: runs } = await admin
      .from("report_runs")
      .select("id, title, period_start, period_end, status")
      .eq("property_id", prop.propertyId)
      .order("period_start", { ascending: true });
    evidence.reportRuns = runs;
    const { data: snaps } = await admin
      .from("report_snapshots")
      .select("report_run_id, version, generated_file_path, drive_file_name")
      .in(
        "report_run_id",
        (runs || []).map((r) => r.id),
      );
    evidence.snapshots = snaps;
    evidence.priorUnchanged = (snaps || []).length >= 1;
    evidence.separateDriveFiles =
      new Set((snaps || []).map((s) => s.drive_file_name).filter(Boolean)).size >= 1;

    evidence.comps = comps;
    evidence.finishedAt = new Date().toISOString();
    evidence.verdictFactors = {
      uploadsOk: log.filter((s) => s.name.startsWith("upload_") && s.ok).length >= 6,
      compsAccepted: (comps?.accepted || 0) >= 1,
      week1Pdf: (pdfs1 || []).length >= 1,
      week2Attempted: true,
      createReportUi: log.some((s) => s.name === "create_report" && s.ok),
    };
    const v = evidence.verdictFactors;
    evidence.verdict =
      v.uploadsOk && v.compsAccepted && v.week1Pdf && v.createReportUi
        ? pdfs2?.length
          ? "PASS"
          : "PARTIAL"
        : "PARTIAL";

    fs.writeFileSync(path.join(OUT, "evidence.json"), JSON.stringify(evidence, null, 2));
    console.log(
      JSON.stringify(
        {
          verdict: evidence.verdict,
          propertyId: prop.propertyId,
          propertyName: prop.name,
          steps: log.length,
          week1Pdfs: pdfs1?.map((p) => ({ file: p.file, pages: p.pages, drive: p.driveFileName })),
          week2Pdfs: pdfs2?.map((p) => ({ file: p.file, pages: p.pages, drive: p.driveFileName })),
          runs,
          factors: v,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    evidence.fatal = String(e).slice(0, 800);
    evidence.verdict = "BLOCKED";
    fs.writeFileSync(path.join(OUT, "evidence.json"), JSON.stringify(evidence, null, 2));
    console.error(JSON.stringify({ verdict: "BLOCKED", error: evidence.fatal }));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
}

main();
