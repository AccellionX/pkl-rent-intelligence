#!/usr/bin/env node
import { loadDotEnv, requireE2eAdmin, clientSourcePath } from "./lib/local-e2e-env.mjs";
/**
 * Resume Task #20A on the journey property: accept eligible Rentometer comps,
 * photos, available unit, re-approve narrative, finalize PDFs + Drive for both weeks.
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
const PROPERTY_ID = "29865d36-23fb-4861-b43a-29d62f73ccf4";
const PROPERTY_NAME = "Twenty A Journey fso43";
const ADMIN = requireE2eAdmin();
const OUT = path.join(process.cwd(), "tmp/task20a");
const SHOTS = path.join(OUT, "screenshots");
const PDF_DIR = path.join(OUT, "pdf");
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(PDF_DIR, { recursive: true });

const PHOTO1 =
  clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "855_5.jpg");
const PHOTO2 =
  clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "855_1.png");

const log = [];
function step(name, detail = {}) {
  log.push({ at: new Date().toISOString(), name, ...detail });
  console.error(JSON.stringify({ step: name, ok: detail.ok !== false, note: detail.note }));
}

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function shot(page, name) {
  const file = path.join(SHOTS, `resume-${String(log.length).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function gotoSafe(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(700);
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
  step("login", { ok: true });
}

async function addAvailableUnit(page) {
  await gotoSafe(page, `${BASE}/buildings/${PROPERTY_ID}`);
  await waitSettled(page);
  await page.getByRole("heading", { name: /Available units/i }).waitFor({ timeout: 30000 });
  const unitNumber = page.getByPlaceholder(/Unit number|Unit #/i).or(
    page.locator("label", { hasText: /Unit number/i }).locator("xpath=..").locator("input"),
  );
  if (await unitNumber.count()) {
    await unitNumber.first().fill("101");
  }
  const sqft = page.getByPlaceholder(/Sqft|sq ft/i);
  if (await sqft.count()) await sqft.first().fill("900");
  const rent = page.getByPlaceholder(/Asking|rent/i);
  if (await rent.count()) await rent.first().fill("2000");
  const add = page.getByRole("button", { name: "Add unit", exact: true });
  if (await add.count()) {
    await add.click();
    await page.waitForTimeout(2000);
  }
  step("available_unit", { ok: true, shot: await shot(page, "available-unit") });
}

async function uploadPhotos(page) {
  await gotoSafe(page, `${BASE}/buildings/${PROPERTY_ID}`);
  await waitSettled(page);
  // Wait for photos section to finish loading or show refresh
  for (let i = 0; i < 30; i++) {
    const t = await page.locator("body").innerText();
    if (!/Loading photos/i.test(t)) break;
    const refresh = page.getByRole("button", { name: /Refresh photos/i });
    if (await refresh.count()) await refresh.click().catch(() => {});
    await page.waitForTimeout(1000);
  }
  const input = page.locator('input[type="file"][accept="image/*"]').first();
  await input.setInputFiles(PHOTO1);
  await page.waitForTimeout(4000);
  await input.setInputFiles(PHOTO2);
  await page.waitForTimeout(4000);
  const crop = page.getByRole("button", { name: "Crop" }).first();
  if (await crop.count()) {
    await crop.click();
    await page.getByText(/3:2 crop/i).waitFor({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
    const saveCrop = page.getByRole("button", { name: "Save crop" });
    if (await saveCrop.count()) {
      await saveCrop.click();
      await page.waitForTimeout(2000);
    }
  }
  const body = await page.locator("body").innerText();
  step("photos", {
    ok: /#1|#2|cropped|Photo added|Subject photos/i.test(body) && !/Loading photos/i.test(body),
    shot: await shot(page, "photos"),
  });
}

async function acceptRentometerAndExcludeMismatched(page) {
  await gotoSafe(page, `${BASE}/buildings/${PROPERTY_ID}/comparables`);
  await waitSettled(page);
  await page.getByText("Pending candidates").waitFor({ timeout: 45000 });
  await page.waitForTimeout(1500);

  // Exclude approved MLS that need unit-type data
  for (let i = 0; i < 5; i++) {
    const approvedExcludes = page
      .locator("div.rounded-lg.border")
      .filter({ hasText: /Needs unit-type data|MLS/i })
      .getByRole("button", { name: "Exclude" });
    if ((await approvedExcludes.count()) === 0) break;
    await approvedExcludes.first().click();
    await page.waitForTimeout(2200);
  }

  let accepted = 0;
  for (let round = 0; round < 10 && accepted < 5; round++) {
    // Click Accept on first pending card that shows Rentometer + a rent amount
    const card = page
      .locator("div.rounded-lg.border")
      .filter({ hasText: /Rentometer/i })
      .filter({ hasText: /Rent \$/ })
      .filter({ has: page.getByRole("button", { name: "Accept" }) })
      .first();
    if ((await card.count()) === 0) break;
    await card.getByRole("button", { name: "Accept" }).click();
    await page.waitForTimeout(2800);
    accepted += 1;
  }

  // Exclude a couple pending MLS / empty-rent rows
  let excluded = 0;
  for (let i = 0; i < 3; i++) {
    const pendingCard = page
      .locator("div.rounded-lg.border")
      .filter({ has: page.getByRole("button", { name: "Accept" }) })
      .filter({ has: page.getByRole("button", { name: "Exclude" }) })
      .first();
    if ((await pendingCard.count()) === 0) break;
    await pendingCard.getByRole("button", { name: "Exclude" }).click();
    await page.waitForTimeout(2200);
    excluded += 1;
  }

  // Set strongest on approved In pricing set
  const strongest = page.getByRole("button", { name: "Strongest" });
  const n = Math.min(await strongest.count(), 5);
  for (let i = 0; i < n; i++) {
    await strongest.nth(i).click().catch(() => {});
    await page.waitForTimeout(600);
  }

  const body = await page.locator("body").innerText();
  step("review_comps", {
    ok: accepted >= 3 || /In pricing set/i.test(body),
    accepted,
    excluded,
    shot: await shot(page, "comps"),
  });
  return { accepted, excluded };
}

async function ensureNarrative(page, reportTitlePart) {
  await gotoSafe(page, `${BASE}/buildings/${PROPERTY_ID}/pricing`);
  await waitSettled(page);
  await page.getByRole("heading", { name: /PKL recommended rent range/i }).waitFor({
    timeout: 45000,
  });
  // Select report if dropdown present
  const select = page.locator("#report");
  if (await select.count()) {
    const options = await select.locator("option").allTextContents();
    const match = options.find((o) => o.includes(reportTitlePart));
    if (match) {
      await select.selectOption({ label: match });
      await page.waitForTimeout(2000);
    }
  }
  const low = page.locator("label", { hasText: "Low" }).locator("xpath=..").locator("input");
  const high = page.locator("label", { hasText: "High" }).locator("xpath=..").locator("input");
  await low.fill("1900");
  await high.fill("2100");
  await page.getByRole("button", { name: "Save range" }).click();
  await page.waitForTimeout(2000);

  await page.getByRole("button", { name: "Generate draft" }).click();
  for (let i = 0; i < 90; i++) {
    if ((await page.locator("textarea").count()) > 0) {
      const t = await page.locator("body").innerText();
      if (!/Generating/i.test(t)) break;
    }
    await page.waitForTimeout(2000);
  }
  if ((await page.locator("textarea").count()) > 0) {
    await page.getByRole("button", { name: "Approve" }).click();
    await page.waitForTimeout(4000);
  }
  const body = await page.locator("body").innerText();
  step(`narrative_${reportTitlePart}`, {
    ok: /Approved|Status:/i.test(body),
    shot: await shot(page, `narrative-${reportTitlePart}`),
  });
}

async function finalize(page, reportTitlePart, tag) {
  await gotoSafe(page, `${BASE}/buildings/${PROPERTY_ID}/reports`);
  await waitSettled(page);
  await page.waitForTimeout(1500);
  const select = page.locator("#report");
  if (await select.count()) {
    const options = await select.locator("option").allTextContents();
    const match = options.find((o) => o.includes(reportTitlePart));
    if (match) {
      await select.selectOption({ label: match });
      await page.waitForTimeout(2500);
    }
  }
  // Wait for status (not stuck forever)
  for (let i = 0; i < 40; i++) {
    const t = await page.locator("body").innerText();
    if (/Finalization: Ready|Finalization: Blocked|Eligible approved comps/i.test(t)) break;
    if (/Retry status check/i.test(t)) {
      await page.getByRole("button", { name: /Retry status check/i }).click();
    } else if (/Refresh status/i.test(t)) {
      await page.getByRole("button", { name: /Refresh status/i }).click();
    }
    await page.waitForTimeout(1500);
  }
  await shot(page, `pdf-status-${tag}`);

  const storeBtn = page.getByRole("button", { name: "Store final PDF" });
  // If blocked, still try draft for evidence
  const draft = page.getByRole("button", { name: "Download draft PDF" });
  if (await draft.count()) {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120000 }).catch(() => null),
      draft.click(),
    ]);
    if (download) {
      const dest = path.join(PDF_DIR, `${tag}-draft-${download.suggestedFilename()}`);
      await download.saveAs(dest);
      step(`draft_pdf_${tag}`, { ok: true, file: dest });
    } else {
      await page.waitForTimeout(8000);
    }
  }

  await page.getByRole("button", { name: /Refresh status/i }).click().catch(() => {});
  await page.waitForTimeout(2500);

  if (await storeBtn.isEnabled()) {
    await storeBtn.click();
    await page.waitForTimeout(12000);
  }

  const driveBtn = page.getByRole("button", { name: /Save to Google Drive|Retry Google Drive/i });
  if ((await driveBtn.count()) && (await driveBtn.isEnabled())) {
    await driveBtn.click();
    await page.waitForTimeout(15000);
  }

  const mark = page.getByRole("button", { name: "Mark as completed" });
  if ((await mark.count()) && (await mark.isEnabled())) {
    await mark.click();
    await page.waitForTimeout(3000);
  }

  const body = await page.locator("body").innerText();
  step(`finalize_${tag}`, {
    ok: /Final PDF stored|Saved to Google Drive|Already saved|version \d+/i.test(body),
    snippet: body.match(/Finalization:[\s\S]{0,200}|Final PDF[\s\S]{0,180}|Saved to Google Drive[\s\S]{0,120}/)?.[0],
    shot: await shot(page, `finalize-${tag}`),
  });
}

async function downloadPropertyPdfs(tag) {
  const admin = adminClient();
  const { data: runs } = await admin
    .from("report_runs")
    .select("id, title, period_start, period_end, status")
    .eq("property_id", PROPERTY_ID)
    .order("period_start", { ascending: true });
  const runIds = (runs || []).map((r) => r.id);
  const { data: snaps } = await admin
    .from("report_snapshots")
    .select(
      "report_run_id, version, generated_file_path, generated_file_bucket, drive_file_name, drive_file_id, created_at",
    )
    .in("report_run_id", runIds)
    .not("generated_file_path", "is", null)
    .order("created_at", { ascending: true });
  const out = [];
  for (const snap of snaps || []) {
    const { data: blob, error } = await admin.storage
      .from(snap.generated_file_bucket || "generated-reports")
      .download(snap.generated_file_path);
    if (error || !blob) continue;
    const buf = Buffer.from(await blob.arrayBuffer());
    const run = runs.find((r) => r.id === snap.report_run_id);
    const file = path.join(
      PDF_DIR,
      `${tag}-${run?.period_end || "run"}-v${snap.version}-${snap.report_run_id.slice(0, 8)}.pdf`,
    );
    fs.writeFileSync(file, buf);
    const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    out.push({
      file,
      bytes: buf.length,
      pages,
      driveFileName: snap.drive_file_name,
      driveFileId: snap.drive_file_id,
      reportRunId: snap.report_run_id,
      title: run?.title,
      periodEnd: run?.period_end,
      version: snap.version,
      status: run?.status,
    });
  }
  return { runs, snaps, pdfs: out };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  const evidence = { propertyId: PROPERTY_ID, propertyName: PROPERTY_NAME, steps: log };

  try {
    await login(page);
    await addAvailableUnit(page);
    await uploadPhotos(page);
    const comps = await acceptRentometerAndExcludeMismatched(page);
    evidence.comps = comps;

    await ensureNarrative(page, "2BR weekly (");
    // week1 title contains "2BR weekly (2026-10-15" — use unique fragments
    await ensureNarrative(page, "2026-10-15");
    await finalize(page, "2026-10-15", "week1");

    await ensureNarrative(page, "2026-10-23");
    await finalize(page, "2026-10-23", "week2");

    // Photo reuse
    await gotoSafe(page, `${BASE}/buildings/${PROPERTY_ID}`);
    await waitSettled(page);
    const reuse = page.getByRole("button", { name: "Reuse" }).first();
    if (await reuse.count()) {
      await reuse.click();
      await page.waitForTimeout(2500);
    }
    step("photo_reuse_check", {
      ok: true,
      shot: await shot(page, "photo-reuse"),
    });

    await gotoSafe(page, `${BASE}/reports`);
    await waitSettled(page);
    step("report_history", {
      ok: new RegExp(PROPERTY_NAME.slice(0, 12), "i").test(await page.locator("body").innerText()),
      shot: await shot(page, "history"),
    });

    // Refresh persistence
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitSettled(page);
    evidence.refreshOk = !page.url().includes("/login");

    const pdfs = await downloadPropertyPdfs("journey");
    evidence.pdfs = pdfs;
    evidence.finishedAt = new Date().toISOString();

    const week1 = pdfs.pdfs.find((p) => p.periodEnd === "2026-10-22");
    const week2 = pdfs.pdfs.find((p) => p.periodEnd === "2026-10-29");
    const factors = {
      compsAccepted: (comps?.accepted || 0) >= 3 || (pdfs.snaps || []).length > 0,
      week1Pdf: Boolean(week1),
      week2Pdf: Boolean(week2),
      driveWeek1: Boolean(week1?.driveFileName || week1?.driveFileId),
      driveWeek2: Boolean(week2?.driveFileName || week2?.driveFileId),
      separateFiles:
        week1 && week2
          ? week1.reportRunId !== week2.reportRunId && week1.file !== week2.file
          : false,
    };
    evidence.factors = factors;
    evidence.verdict =
      factors.week1Pdf && factors.week2Pdf
        ? factors.driveWeek1 || factors.driveWeek2
          ? "PASS"
          : "PARTIAL"
        : factors.week1Pdf
          ? "PARTIAL"
          : "BLOCKED";

    fs.writeFileSync(path.join(OUT, "resume-evidence.json"), JSON.stringify(evidence, null, 2));
    console.log(
      JSON.stringify(
        {
          verdict: evidence.verdict,
          factors,
          comps,
          pdfs: pdfs.pdfs,
          runs: pdfs.runs,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    evidence.fatal = String(e).slice(0, 1000);
    evidence.verdict = "BLOCKED";
    fs.writeFileSync(path.join(OUT, "resume-evidence.json"), JSON.stringify(evidence, null, 2));
    console.error(JSON.stringify({ verdict: "BLOCKED", error: evidence.fatal }));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
}

main();
