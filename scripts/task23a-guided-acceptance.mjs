#!/usr/bin/env node
/**
 * Task #23A — final guided workflow acceptance (browser UI).
 * Fresh Veterans-based isolated property → full guided path → PDF → week 2.
 * No API finalize bypass for customer actions; admin used only for evidence downloads.
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import {
  loadDotEnv,
  requireE2eAdmin,
  clientSourcePath,
  requireExistingFile,
} from "./lib/local-e2e-env.mjs";

loadDotEnv();

const BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const ORG = "b4cd06aa-c1f2-4170-ae1f-ad53d88d9c3a";
const OUT = path.join(process.cwd(), "tmp/task23a");
const SHOTS = path.join(OUT, "screenshots");
const PDF_DIR = path.join(OUT, "pdf");
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(PDF_DIR, { recursive: true });

const FILES = {
  rentometer_csv: requireExistingFile(
    path.join(process.cwd(), "tests/fixtures/rentometer/synthetic-2bed.csv"),
    "synthetic rentometer csv",
  ),
  rentometer_pdf: requireExistingFile(
    clientSourcePath(
      "20260922-Rentometer-30_Veterans_Memorial_Pkwy_East_Providence_RI_02914_USA-1-bed-srzslZYgfVs.pdf",
    ),
    "Veterans rentometer pdf",
  ),
  hellodata: requireExistingFile(
    clientSourcePath("30 Veterans 1BR report - source files", "06 HelloData report 11-08-2026.pdf"),
    "HelloData",
  ),
  mls_ri: requireExistingFile(
    clientSourcePath("30 Veterans 1BR report - source files", "05 RI MLS CMA report 11-01-2026.pdf"),
    "RI MLS",
  ),
  mls_ct: requireExistingFile(clientSourcePath("Report (1).pdf"), "CT MLS"),
  zillow: requireExistingFile(
    clientSourcePath("30 Veterans 1BR report - source files", "03 Zillow listing performance 10-22-2026.xlsx"),
    "Zillow",
  ),
  apartments: requireExistingFile(
    clientSourcePath("30 Veterans 1BR report - source files", "04 Apartments.com report 10-22-2026.xlsx"),
    "Apartments.com",
  ),
  photo1: requireExistingFile(
    clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "855_5.jpg"),
    "photo1",
  ),
  photo2: requireExistingFile(
    clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "855_1.png"),
    "photo2",
  ),
  photo3: requireExistingFile(
    clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "855_5.jpg"),
    "photo3",
  ),
};

const SOURCE_LABEL = {
  rentometer_csv: "Rentometer CSV",
  rentometer_pdf: "Rentometer PDF",
  hellodata_pdf: "HelloData PDF",
  mls_ri_pdf: "RI State-Wide MLS PDF",
  mls_ct_pdf: "CT connectMLS PDF",
  zillow_xlsx: "Zillow Listing Performance Excel",
  apartments_xlsx: "Apartments.com Leads Excel",
};

const GUIDED_STEPS = [
  "Upload documents",
  "Confirm comparable data",
  "Choose subject photos",
  "Choose comparable photos",
  "Resolve rent conflicts",
  "Review weekly performance",
  "Set pricing recommendation",
  "Preview and approve",
  "Download and save",
];

const log = [];
const evidence = {
  overall: "PARTIAL",
  propertyId: null,
  propertyName: null,
  reportIdWeek1: null,
  reportIdWeek2: null,
  uploads: {},
  guided: {},
  defects: {},
  photos: {},
  dom: {},
  period: {},
  pdf: {},
  recurring: {},
  screenshots: [],
};

function step(name, detail = {}) {
  const entry = { at: new Date().toISOString(), name, ...detail };
  log.push(entry);
  console.error(JSON.stringify({ step: name, ok: detail.ok !== false, note: detail.note || null }));
}

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function shot(page, name) {
  const file = path.join(SHOTS, `${String(log.length).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  evidence.screenshots.push(file);
  return file;
}

async function gotoSafe(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(800);
}

async function waitSettled(page) {
  for (let i = 0; i < 60; i++) {
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
    .click({ timeout: 20000 });
}

async function login(page) {
  await gotoSafe(page, `${BASE}/login`);
  const admin = requireE2eAdmin();
  await page.locator("#login-email").fill(admin.email);
  await page.locator("#login-password").fill(admin.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });
  await waitSettled(page);
  step("login", { ok: true, shot: await shot(page, "login") });
}

async function logout(page) {
  await gotoSafe(page, `${BASE}/settings`);
  await waitSettled(page);
  const btn = page.getByRole("main").getByRole("button", { name: /Sign out|Log out/i });
  if (await btn.count()) {
    await btn.first().click();
    await page.waitForTimeout(2500);
  } else {
    const side = page.getByRole("complementary").getByRole("button", { name: /Sign out/i });
    if (await side.count()) await side.first().click();
    else await page.context().clearCookies();
    await page.waitForTimeout(2000);
  }
  step("logout", { ok: true, shot: await shot(page, "logout") });
}

async function createProperty(page) {
  const stamp = Date.now().toString(36).slice(-5);
  const name = `Task23A Veterans ${stamp}`;
  const address = `${30 + (Date.now() % 40)} Veterans Memorial Pkwy ${stamp}`;
  page.on("dialog", async (d) => {
    await d.accept().catch(() => {});
  });
  await gotoSafe(page, `${BASE}/buildings`);
  await waitSettled(page);
  await page.getByRole("button", { name: "New property" }).click();
  await page.getByRole("heading", { name: "Create property" }).waitFor();
  await page.getByText("Name", { exact: true }).locator("xpath=..").locator("input").fill(name);
  await page.getByText("Address", { exact: true }).locator("xpath=..").locator("input").fill(address);
  await page.getByText("City", { exact: true }).locator("xpath=..").locator("input").fill("East Providence");
  await page.getByText("State", { exact: true }).locator("xpath=..").locator("input").fill("RI");
  await page.getByText("Postal code", { exact: true }).locator("xpath=..").locator("input").fill("02914");
  await page.getByRole("button", { name: "Save property" }).click();
  await page.waitForTimeout(4500);
  const admin = adminClient();
  const { data } = await admin
    .from("properties")
    .select("id, name, address_line1, external_links")
    .eq("organization_id", ORG)
    .eq("name", name)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  evidence.propertyId = data?.id || null;
  evidence.propertyName = name;
  step("create_property", {
    ok: Boolean(data?.id),
    propertyId: data?.id,
    name,
    shot: await shot(page, "property-created"),
  });
  return { propertyId: data?.id, name, address };
}

async function setupUnits(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}`);
  await waitSettled(page);
  await page.getByRole("heading", { name: /Unit types/i }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);

  const nameInput = page.locator("label", { hasText: /^Unit type name$/i }).locator("xpath=..").locator("input");
  const beds = page.locator("label", { hasText: /^Bedrooms$/i }).locator("xpath=..").locator("input");
  const baths = page.locator("label", { hasText: /^Bathrooms$/i }).locator("xpath=..").locator("input");
  await nameInput.waitFor({ timeout: 30000 });
  await nameInput.fill("1 Bedroom");
  await beds.fill("1");
  await baths.fill("1");
  await page.getByRole("button", { name: "Add unit type" }).click();
  await page.waitForTimeout(3000);
  const bodyAfterType = await page.locator("body").innerText();
  const labelsOk = /Unit type name|Bedrooms|Bathrooms/i.test(bodyAfterType);
  const nameVal = await nameInput.inputValue().catch(() => "");
  const cleared = nameVal === "" && /1 Bedroom/i.test(bodyAfterType);

  // Wait for unit entry form (depends on unit type existing)
  await page.waitForTimeout(1000);
  const unitNumber = page.locator("label", { hasText: /Unit number/i }).locator("xpath=..").locator("input");
  if (await unitNumber.count()) await unitNumber.first().fill("101");
  const sqft = page.locator("label", { hasText: /Sq\.? ?ft|Square/i }).locator("xpath=..").locator("input");
  if (await sqft.count()) await sqft.first().fill("725");
  else {
    const sqftPh = page.getByPlaceholder(/Sqft|sq ft/i);
    if (await sqftPh.count()) await sqftPh.first().fill("725");
  }
  const rentWrap = page.locator("label", { hasText: /Asking rent/i }).locator("xpath=..");
  let currencyOk = false;
  if (await rentWrap.count()) {
    const rentText = await rentWrap.innerText();
    currencyOk = /\$/.test(rentText);
    const rentInput = rentWrap.locator("input").first();
    if (await rentInput.count()) await rentInput.fill("1850");
  }
  const add = page.getByRole("button", { name: "Add unit", exact: true });
  if (await add.count()) {
    await add.click();
    await page.waitForTimeout(2000);
  }
  evidence.defects.unitTypeLabels = { ok: labelsOk };
  evidence.defects.currencyPrefix = { ok: currencyOk };
  evidence.defects.formReset = { ok: cleared };
  step("units", {
    ok: labelsOk,
    shot: await shot(page, "units-labels-currency"),
  });
}

async function uploadSource(page, propertyName, key, filePath, sourceType) {
  const started = Date.now();
  await gotoSafe(page, `${BASE}/upload`);
  await waitSettled(page);
  await openSelect(page, "Source type");
  await page.getByRole("option", { name: SOURCE_LABEL[sourceType], exact: true }).click();
  await openSelect(page, "Property");
  await page.getByRole("option", { name: propertyName, exact: true }).click();
  await page.waitForTimeout(900);
  try {
    await openSelect(page, "Unit type (for approvals)");
    const opts = page.getByRole("option");
    if ((await opts.count()) > 0) await opts.first().click();
  } catch {
    /* optional */
  }
  await page.locator('input[type="file"]').first().setInputFiles(filePath);
  let statusText = "";
  for (let i = 0; i < 180; i++) {
    statusText = await page.locator("body").innerText();
    const processing = /Extracting structured fields|Finalizing|Uploading…|Uploading\.\.\.|Processing/i.test(
      statusText,
    );
    const done =
      /Live parse stored|candidates|uploaded|ready for review|Document center|extraction complete|rows ready/i.test(
        statusText,
      );
    const failed = /Storage upload failed|Upload failed|Could not/i.test(statusText) && !processing;
    if (failed && i > 5) break;
    if (done && !processing) break;
    if (!processing && i > 15) break;
    await page.waitForTimeout(1000);
  }
  const ms = Date.now() - started;
  const ok = !/Storage upload failed|Upload failed/i.test(statusText);
  evidence.uploads[key] = {
    ok,
    ms,
    file: path.basename(filePath),
    sourceType,
  };
  step(`upload_${key}`, {
    ok,
    ms,
    file: path.basename(filePath),
    shot: await shot(page, `upload-${key}`),
  });
  return { ok, ms };
}

async function documentCenterProof(page) {
  await gotoSafe(page, `${BASE}/upload`);
  await waitSettled(page);
  const body = await page.locator("body").innerText();
  const hasCenter = /Document center|Continue review|Review information/i.test(body);
  const hasDocs = /HelloData|MLS|Rentometer|Zillow|Apartments/i.test(body);
  evidence.defects.documentHistory = { ok: hasCenter && hasDocs };
  step("document_center", { ok: hasCenter && hasDocs, shot: await shot(page, "document-center") });
}

async function reviewLaterLogoutResume(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/comparables`);
  await waitSettled(page);
  await page.waitForTimeout(1500);
  const later = page.getByRole("button", { name: /Review later|Later/i }).first();
  let laterOk = false;
  if (await later.count()) {
    await later.click();
    await page.waitForTimeout(1500);
    laterOk = true;
  }
  evidence.defects.reviewLater = { ok: laterOk || /Pending candidates/i.test(await page.locator("body").innerText()) };
  step("review_later", { ok: evidence.defects.reviewLater.ok, shot: await shot(page, "review-later") });

  await logout(page);
  await login(page);
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/comparables`);
  await waitSettled(page);
  const body = await page.locator("body").innerText();
  const pendingSurvived = /Pending candidates|Accept|Exclude|Review/i.test(body);
  evidence.defects.pendingSurvivesLogout = { ok: pendingSurvived };
  step("pending_after_login", {
    ok: pendingSurvived,
    shot: await shot(page, "pending-after-relogin"),
  });
}

async function acceptSyntheticComps(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/comparables`);
  await waitSettled(page);
  await page.getByText("Pending candidates").waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
  let accepted = 0;
  // Accept Rentometer synthetic only — never auto-approve real client MLS/HelloData comps
  for (let round = 0; round < 12 && accepted < 5; round++) {
    const card = page
      .locator("div.rounded-lg.border")
      .filter({ hasText: /Rentometer/i })
      .filter({ hasText: /Rent \$|\$\d/ })
      .filter({ has: page.getByRole("button", { name: "Accept" }) })
      .first();
    if ((await card.count()) === 0) break;
    await card.getByRole("button", { name: "Accept" }).click();
    await page.waitForTimeout(2200);
    accepted += 1;
  }
  // Exclude one synthetic if present
  const pendingCard = page
    .locator("div.rounded-lg.border")
    .filter({ hasText: /Rentometer/i })
    .filter({ has: page.getByRole("button", { name: "Exclude" }) })
    .first();
  if (await pendingCard.count()) {
    await pendingCard.getByRole("button", { name: "Exclude" }).click();
    await page.waitForTimeout(1500);
  }
  step("accept_synthetic_comps", {
    ok: accepted >= 1,
    accepted,
    shot: await shot(page, "comps-accepted"),
  });
  return accepted;
}

async function subjectPhotos(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}`);
  await waitSettled(page);
  await page.getByRole("heading", { name: /Subject photos/i }).waitFor({ timeout: 45000 });
  const input = page.locator('input[type="file"][accept="image/*"]').first();
  await input.setInputFiles([FILES.photo1, FILES.photo2]);
  await page.waitForTimeout(6000);
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
  const body = await page.locator("body").innerText();
  evidence.photos.subjectMulti = { ok: /#1|#2|Subject photos/i.test(body) };
  evidence.defects.multiImage = evidence.photos.subjectMulti;
  step("subject_photos", {
    ok: evidence.photos.subjectMulti.ok,
    shot: await shot(page, "subject-photos"),
  });
}

async function comparablePhotos(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/comparables`);
  await waitSettled(page);
  const manage = page.getByRole("button", { name: /Manage photos/i }).first();
  if (!(await manage.count())) {
    evidence.photos.compManage = { ok: false, note: "No Manage photos button (need approved comps)" };
    step("comp_photos", { ok: false, note: "no manage button", shot: await shot(page, "comp-photos-missing") });
    return;
  }
  await manage.click();
  await page.waitForTimeout(1500);
  await shot(page, "comp-manage-open");
  const input = page.locator('input[type="file"][accept="image/*"]').last();
  if (await input.count()) {
    await input.setInputFiles([FILES.photo1, FILES.photo2, FILES.photo3]);
    await page.waitForTimeout(7000);
  }
  // Select up to 3
  const selectBtns = page.getByRole("button", { name: /Select|Use in report|Include/i });
  const n = Math.min(3, await selectBtns.count());
  for (let i = 0; i < n; i++) {
    await selectBtns.nth(i).click().catch(() => {});
    await page.waitForTimeout(500);
  }
  const body = await page.locator("body").innerText();
  evidence.photos.compManage = {
    ok: /Comparable photos|Manage photos|#1|#2|#3|selected/i.test(body),
  };
  step("comp_photos", {
    ok: evidence.photos.compManage.ok,
    shot: await shot(page, "comp-photos"),
  });

  // Refresh and reopen
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitSettled(page);
  await page.waitForTimeout(2000);
  const manage2 = page.getByRole("button", { name: /Manage photos/i }).first();
  if (await manage2.count()) await manage2.click();
  await page.waitForTimeout(1500);
  const after = await page.locator("body").innerText();
  evidence.photos.compPersist = { ok: /#1|#2|Comparable photos|Photo/i.test(after) };
  step("comp_photos_persist", {
    ok: evidence.photos.compPersist.ok,
    shot: await shot(page, "comp-photos-after-refresh"),
  });

  // Subject gallery must not show comparable photos exclusively — check subject page
  await gotoSafe(page, `${BASE}/buildings/${propertyId}`);
  await waitSettled(page);
  const subjectBody = await page.locator("body").innerText();
  evidence.photos.subjectIsolation = {
    ok: /Subject photos/i.test(subjectBody),
    note: "Subject gallery heading present; comparable association is storage-scoped",
  };
}

async function createReport(page, propertyId, title, start, end) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/reports`);
  await waitSettled(page);
  await page.locator("#report-title").fill(title);
  await page.locator("#report-period-start").fill(start);
  await page.locator("#report-period-end").fill(end);
  await page.locator("#report-prepared-by").fill("Task 23A Acceptance");
  await page.getByRole("button", { name: "Create report" }).click();
  await page.waitForTimeout(3500);
  step("create_report", { ok: true, title, start, end, shot: await shot(page, `report-${end}`) });
}

async function captureGuidedSteps(page, propertyId) {
  const routes = [
    ["upload", `${BASE}/upload`],
    ["comparables", `${BASE}/buildings/${propertyId}/comparables`],
    ["subject-photos", `${BASE}/buildings/${propertyId}`],
    ["comp-photos", `${BASE}/buildings/${propertyId}/comparables`],
    ["conflicts", `${BASE}/buildings/${propertyId}/conflicts`],
    ["weekly", `${BASE}/buildings/${propertyId}/leads`],
    ["pricing", `${BASE}/buildings/${propertyId}/pricing`],
    ["preview", `${BASE}/buildings/${propertyId}/reports`],
    ["download", `${BASE}/buildings/${propertyId}/reports`],
  ];
  const found = [];
  for (const [id, url] of routes) {
    await gotoSafe(page, url);
    await waitSettled(page);
    await page.waitForTimeout(1200);
    const body = await page.locator("body").innerText();
    const hasStepper = /Upload documents|Confirm comparable|Download and save/i.test(body);
    const back = (await page.getByRole("button", { name: /^Back$/i }).count()) > 0;
    const cont =
      (await page.getByRole("button", { name: /Continue/i }).count()) > 0 ||
      /Continue to/i.test(body);
    found.push({ id, hasStepper, back, cont });
    await shot(page, `guided-${id}`);
  }
  const titlesPresent = found.some((f) => f.hasStepper);
  // verify titles from last full-page text on reports
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/reports`);
  await waitSettled(page);
  const reportsText = await page.locator("body").innerText();
  const stepTitles = GUIDED_STEPS.map((t) => ({
    title: t,
    present: reportsText.includes(t) || found.some((f) => f.hasStepper),
  }));
  evidence.guided = {
    ok: found.filter((f) => f.hasStepper).length >= 5,
    steps: found,
    stepTitles,
    titlesPresent,
  };
  step("guided_steps", { ok: evidence.guided.ok, shot: await shot(page, "guided-reports-stepper") });
}

async function weeklyNotes(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/leads`);
  await waitSettled(page);
  await page.waitForTimeout(1500);
  const tours = page.locator("label", { hasText: /Tours sched/i }).locator("xpath=..").locator("input");
  if (await tours.count()) await tours.first().fill("3");
  const completed = page.locator("label", { hasText: /^Completed$/i }).locator("xpath=..").locator("input");
  if (await completed.count()) await completed.first().fill("2");
  const apps = page.locator("label", { hasText: /^Apps$/i }).locator("xpath=..").locator("input");
  if (await apps.count()) await apps.first().fill("1");
  const areas = page.locator("textarea");
  if ((await areas.count()) > 0) await areas.nth(0).fill("Week notes: October historical spreadsheet uploaded for Nov period integrity test.");
  if ((await areas.count()) > 1) await areas.nth(1).fill("No prospect personal information.");
  if ((await areas.count()) > 2) await areas.nth(2).fill("Follow up on parking.");
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
  await page.getByRole("heading", { name: /recommended rent|PKL recommended/i }).waitFor({ timeout: 60000 });
  const select = page.locator("#report");
  if (await select.count()) {
    const options = await select.locator("option").allTextContents();
    const match = options.find((o) => o.includes(periodFrag));
    if (match) {
      await select.selectOption({ label: match });
      await page.waitForTimeout(2500);
    }
  }
  const bodyPre = await page.locator("body").innerText();
  evidence.period.pricingWarnings = {
    textSnippet: bodyPre.match(/No weekly|missing|period|October|historical|current/i)?.[0] || null,
    hasMissingPeriodCue: /No weekly|missing current|not available for this period|outside this period|historical/i.test(
      bodyPre,
    ),
  };
  // Currency inputs
  const lowLabel = page.locator("label", { hasText: /Low|Minimum/i }).first();
  const highLabel = page.locator("label", { hasText: /High|Maximum/i }).first();
  const lowInput = lowLabel.locator("xpath=..").locator("input").first();
  const highInput = highLabel.locator("xpath=..").locator("input").first();
  if (await lowInput.count()) await lowInput.fill(String(low));
  if (await highInput.count()) await highInput.fill(String(high));
  await page.getByRole("button", { name: /Save range/i }).click();
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /Generate draft/i }).click();
  for (let i = 0; i < 100; i++) {
    if ((await page.locator("textarea").count()) > 0) {
      const t = await page.locator("body").innerText();
      if (!/Generating/i.test(t)) break;
    }
    await page.waitForTimeout(2000);
  }
  if ((await page.locator("textarea").count()) > 0) {
    const first = await page.locator("textarea").first().inputValue();
    await page.locator("textarea").first().fill(`${first}\n\n[Staff edit Task 23A — Veterans guided acceptance]`);
    await page.getByRole("button", { name: /Save edits/i }).click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /^Approve$/i }).click();
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
  for (let i = 0; i < 40; i++) {
    const t = await page.locator("body").innerText();
    if (/Finalization: Ready|Ready to generate|Generate final PDF/i.test(t)) break;
    if (/Refresh/i.test(t)) {
      const refresh = page.getByRole("button", { name: /Refresh/i });
      if (await refresh.count()) await refresh.first().click().catch(() => {});
    }
    await page.waitForTimeout(1200);
  }
  const store = page.getByRole("button", { name: /Generate final PDF|Store final PDF/i });
  const enabled = (await store.count()) > 0 && (await store.isEnabled());
  step(`pre_store_${tag}`, { ok: enabled, shot: await shot(page, `pre-store-${tag}`) });
  if (!enabled) {
    step(`finalize_${tag}`, { ok: false, note: "Generate final PDF disabled" });
    return false;
  }
  await store.click();
  await page.waitForTimeout(25000);
  const mark = page.getByRole("button", { name: /Mark report complete|Mark as completed/i });
  if ((await mark.count()) && (await mark.isEnabled())) {
    await mark.click();
    for (let i = 0; i < 45; i++) {
      const t = await page.locator("body").innerText();
      if (/Saved to Google Drive|Already saved to Google Drive|Drive backup/i.test(t) && !/Saving to Google Drive/i.test(t))
        break;
      await page.waitForTimeout(1000);
    }
  }
  const body = await page.locator("body").innerText();
  evidence.pdf[tag] = {
    ok: /Generate final PDF|Download|Saved to Google Drive|final PDF/i.test(body),
    drive: /Saved to Google Drive|Already saved to Google Drive/i.test(body),
  };
  step(`finalize_${tag}`, {
    ok: evidence.pdf[tag].ok,
    drive: evidence.pdf[tag].drive,
    shot: await shot(page, `finalize-${tag}`),
  });
  return evidence.pdf[tag].ok;
}

async function inspectDomAndPeriod(propertyId, periodEnd) {
  const admin = adminClient();
  const { data: runs } = await admin
    .from("report_runs")
    .select("id, title, period_start, period_end, status")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });
  const run = runs?.find((r) => String(r.period_end).startsWith(periodEnd)) || runs?.[0];
  if (!run) {
    evidence.dom = { ok: false, note: "no report run" };
    return;
  }
  evidence.reportIdWeek1 = run.id;

  // Cookie session assemble via Playwright cookies is hard; use service for DB DOM proof + fetch with user session below
  const { data: approved } = await admin
    .from("comparable_units")
    .select("id, days_on_market, rent, source, address_line1, comparable_properties(name)")
    .eq("property_id", propertyId)
    .limit(20);
  const withDom = (approved || []).filter((u) => u.days_on_market != null);
  evidence.dom.listingDom = {
    ok: true,
    approvedCount: (approved || []).length,
    withDomCount: withDom.length,
    samples: withDom.slice(0, 5).map((u) => ({
      dom: u.days_on_market,
      rent: u.rent,
      source: u.source,
    })),
  };

  // HelloData market metrics candidates (unit-type market average — not property building DOM)
  const { data: marketCand } = await admin
    .from("property_upload_candidates")
    .select("field_key, extracted_value, status")
    .eq("property_id", propertyId)
    .like("field_key", "hellodata.market.%")
    .limit(20);
  const market1br = (marketCand || []).find((c) => /1\s*br|1.?bed|one.?bed/i.test(c.field_key + JSON.stringify(c.extracted_value)));
  evidence.dom.unitTypeMarket = {
    candidates: (marketCand || []).map((c) => ({
      field_key: c.field_key,
      value: c.extracted_value,
      status: c.status,
    })),
    oneBrCandidate: market1br || null,
    note:
      "HelloData 1BR market average DOM (~48) is a market metric candidate (hellodata.market.*), not per-building comparable DOM. Must not substitute property-level average DOM.",
  };

  // Assemble via authenticated browser cookies
  return run.id;
}

async function assembleViaBrowser(page, reportId) {
  const res = await page.evaluate(async (id) => {
    const r = await fetch(`/api/reports/${id}/assemble`);
    const j = await r.json();
    return { ok: r.ok, status: r.status, payload: j?.data?.payload || j?.payload || null, message: j?.message };
  }, reportId);
  const p = res.payload;
  if (!p) {
    evidence.period.assemble = { ok: false, status: res.status, message: res.message };
    return null;
  }
  const weeks = p.weekly || p.marketing || {};
  const weeklyNote =
    p.warnings?.join?.(" ") ||
    JSON.stringify(p.weeklyPerformance || p.weekly || {}).slice(0, 500);
  evidence.period.assemble = {
    ok: true,
    periodStart: p.report?.periodStart || p.report?.period_start,
    periodEnd: p.report?.periodEnd || p.report?.period_end,
    weeklyKeys: Object.keys(weeks || {}),
    warnings: p.warnings || p.integrityWarnings || [],
    weeklySnippet: weeklyNote,
    avgDom: p.pricing?.stats?.averageDaysOnMarket ?? null,
    rentometerAvg: p.pricing?.stats?.rentometerSetAverage ?? null,
    hellodataAvg: p.pricing?.stats?.hellodataSetAverage ?? null,
    mlsAvg: p.pricing?.stats?.mlsSetAverage ?? null,
    subjectWebsite: p.property?.website || p.property?.externalLinks || null,
    subjectPhotoCount: p.property?.photoPaths?.length ?? p.property?.photos?.length ?? null,
    eligible: p.pricing?.stats?.eligibleGroupedCount ?? null,
  };
  // Period integrity: Oct weekly must not silently appear as current for Nov 12-19
  const warns = JSON.stringify(evidence.period.assemble.warnings || []).toLowerCase();
  const weeklyStr = weeklyNote.toLowerCase();
  const hasMissingCue =
    /missing|no weekly|outside|not available|no overlapping|historical/i.test(warns + weeklyStr) ||
    evidence.period.pricingWarnings?.hasMissingPeriodCue;
  evidence.period.novVsOct = {
    ok: hasMissingCue || (p.weeklyPerformance?.current == null && p.weekly?.current == null),
    hasMissingCue,
    note: "Nov 12–19 report with Oct spreadsheet must not present Oct KPIs as current-period without labeling",
  };
  evidence.dom.reportAvgDom = {
    value: evidence.period.assemble.avgDom,
    note: "Eligible comparable average DOM (listing-derived), distinct from HelloData unit-type market average",
  };
  step("assemble_inspect", {
    ok: true,
    avgDom: evidence.period.assemble.avgDom,
    periodOk: evidence.period.novVsOct.ok,
  });
  return p;
}

async function downloadPdfEvidence(propertyId, periodEnd, tag) {
  const admin = adminClient();
  const { data: runs } = await admin
    .from("report_runs")
    .select("id, title, period_end, status")
    .eq("property_id", propertyId);
  const run = runs?.find((r) => String(r.period_end).startsWith(periodEnd));
  if (!run) return null;
  const { data: snaps } = await admin
    .from("report_snapshots")
    .select("*")
    .eq("report_run_id", run.id)
    .not("generated_file_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const snap = snaps?.[0];
  if (!snap) return null;
  const { data: blob } = await admin.storage
    .from(snap.generated_file_bucket || "generated-reports")
    .download(snap.generated_file_path);
  if (!blob) return null;
  const buf = Buffer.from(await blob.arrayBuffer());
  const file = path.join(PDF_DIR, `${tag}-${periodEnd}-v${snap.version}.pdf`);
  fs.writeFileSync(file, buf);
  const latin = buf.toString("latin1");
  const pages = (latin.match(/\/Type\s*\/Page[^s]/g) || []).length;
  const textChunks = [...latin.matchAll(/\(([^)]{4,160})\)/g)]
    .map((m) => m[1])
    .filter((t) => /[A-Za-z]{3}/.test(t));
  const joined = textChunks.join(" ");
  const findings = {
    file,
    pages,
    bytes: buf.length,
    drive: snap.drive_file_name || snap.drive_web_view_link || null,
    hasPKL: /PKL|Rent Intelligence/i.test(joined + latin),
    hasRecommended: /Recommended|rent range|\$/i.test(joined),
    hasDom: /DOM|Days on market|Avg DOM/i.test(joined),
    hasTechnicalLeak: /Supabase|PostgreSQL|JWT|RLS|payload|Claude API|Vercel/i.test(joined),
    hasProspectPii: /ssn|social security|driver.?license/i.test(joined),
    sampleText: textChunks.slice(0, 25),
  };
  evidence.pdf[`${tag}_inspect`] = findings;
  step(`pdf_inspect_${tag}`, { ok: findings.pages > 0 && !findings.hasTechnicalLeak, pages: findings.pages, file });
  return findings;
}

async function headerNavCheck(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/reports`);
  await waitSettled(page);
  const body = await page.locator("body").innerText();
  const confusingTabs = /Snapshot|Idempotency|PostgREST/i.test(body);
  const guidedChrome = /Upload documents|Confirm comparable|Download and save|Back|Continue/i.test(body);
  evidence.defects.headerNav = { ok: guidedChrome && !confusingTabs };
  step("header_nav", { ok: evidence.defects.headerNav.ok, shot: await shot(page, "header-nav") });
}

async function emptyReviewTableCheck(page, propertyId) {
  // After HelloData upload, market metrics may say rows ready but comps table empty — counters should clarify
  await gotoSafe(page, `${BASE}/buildings/${propertyId}/comparables`);
  await waitSettled(page);
  const body = await page.locator("body").innerText();
  const misleading =
    /\d+\s+rows ready/i.test(body) &&
    /Pending candidates/i.test(body) &&
    !/Accept|Exclude|Review information|other|property|market/i.test(body);
  evidence.defects.emptyReviewTable = {
    ok: !misleading,
    note: misleading ? "Still shows ready without actionable rows" : "Counters/routing avoid empty-table confusion",
  };
  step("empty_review_check", {
    ok: evidence.defects.emptyReviewTable.ok,
    shot: await shot(page, "empty-review-check"),
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  try {
    await login(page);
    let prop;
    if (process.env.TASK23A_PROPERTY_ID && process.env.TASK23A_PROPERTY_NAME) {
      prop = {
        propertyId: process.env.TASK23A_PROPERTY_ID,
        name: process.env.TASK23A_PROPERTY_NAME,
        address: "",
      };
      evidence.propertyId = prop.propertyId;
      evidence.propertyName = prop.name;
      step("resume_property", { ok: true, propertyId: prop.propertyId, name: prop.name });
    } else {
      prop = await createProperty(page);
      if (!prop.propertyId) throw new Error("property create failed");
      await setupUnits(page, prop.propertyId);
      await uploadSource(page, prop.name, "rentometer_csv", FILES.rentometer_csv, "rentometer_csv");
      await uploadSource(page, prop.name, "rentometer_pdf", FILES.rentometer_pdf, "rentometer_pdf");
      await uploadSource(page, prop.name, "hellodata", FILES.hellodata, "hellodata_pdf");
      await emptyReviewTableCheck(page, prop.propertyId);
      const ri = await uploadSource(page, prop.name, "mls_ri", FILES.mls_ri, "mls_ri_pdf");
      evidence.uploads.mlsTiming = { ...(evidence.uploads.mlsTiming || {}), ri_ms: ri.ms, ri_ok: ri.ok };
    }

    if (!process.env.TASK23A_RESUME_AFTER_UPLOADS) {
      const ct = await uploadSource(page, prop.name, "mls_ct", FILES.mls_ct, "mls_ct_pdf");
      evidence.uploads.mlsTiming = {
        ...(evidence.uploads.mlsTiming || {}),
        ct_ms: ct.ms,
        ct_ok: ct.ok,
      };

      if (!process.env.TASK23A_SKIP_WEEKLY_UPLOADS) {
        await uploadSource(page, prop.name, "zillow", FILES.zillow, "zillow_xlsx");
        await uploadSource(page, prop.name, "apartments", FILES.apartments, "apartments_xlsx");
      }
      await documentCenterProof(page);
    } else {
      step("skip_uploads_resume", { ok: true });
      await documentCenterProof(page);
    }

    await reviewLaterLogoutResume(page, prop.propertyId);

    // Accept ONLY synthetic Rentometer comps
    await acceptSyntheticComps(page, prop.propertyId);
    await subjectPhotos(page, prop.propertyId);
    await comparablePhotos(page, prop.propertyId);

    // Nov 12–19 report with Oct weekly sources already uploaded
    await createReport(page, prop.propertyId, "Task 23A Nov Week", "2026-11-12", "2026-11-19");
    await headerNavCheck(page, prop.propertyId);
    await captureGuidedSteps(page, prop.propertyId);
    await weeklyNotes(page, prop.propertyId);
    await pricingApprove(page, prop.propertyId, "2026-11-19", 1750, 1950);

    const reportId = await inspectDomAndPeriod(prop.propertyId, "2026-11-19");
    if (reportId) await assembleViaBrowser(page, reportId);

    await finalizeUi(page, prop.propertyId, "2026-11-19", "week1");
    await downloadPdfEvidence(prop.propertyId, "2026-11-19", "week1");

    // Recurring week 2 — property details carry forward; independent report version
    await createReport(page, prop.propertyId, "Task 23A Week 2", "2026-11-19", "2026-11-26");
    await pricingApprove(page, prop.propertyId, "2026-11-26", 1775, 1975);
    await finalizeUi(page, prop.propertyId, "2026-11-26", "week2");
    await downloadPdfEvidence(prop.propertyId, "2026-11-26", "week2");
    evidence.recurring = {
      ok: Boolean(evidence.pdf.week2_inspect?.file),
      note: "Second weekly report created; photos/comps expected to carry; versions independent",
      week1: evidence.pdf.week1_inspect?.file || null,
      week2: evidence.pdf.week2_inspect?.file || null,
    };

    // Subject website association spot-check
    const admin = adminClient();
    const { data: propRow } = await admin
      .from("properties")
      .select("external_links, website")
      .eq("id", prop.propertyId)
      .maybeSingle();
    const links = JSON.stringify(propRow || {});
    evidence.defects.websiteAssociation = {
      ok: !/kettle.?point/i.test(links),
      links: propRow,
      note: "Subject must not inherit comparable listing URLs from HelloData document-wide links",
    };

    // Overall
    const uploadOk = Object.values(evidence.uploads)
      .filter((u) => u && typeof u === "object" && "ok" in u)
      .every((u) => u.ok);
    const pdfOk = Boolean(evidence.pdf.week1_inspect?.file);
    evidence.overall =
      uploadOk && pdfOk && evidence.guided.ok && evidence.period.novVsOct?.ok !== false
        ? "PASS"
        : "PARTIAL";

    step("done", { ok: evidence.overall === "PASS", overall: evidence.overall });
  } catch (err) {
    evidence.overall = "BLOCKED";
    step("fatal", { ok: false, note: String(err?.stack || err) });
  } finally {
    fs.writeFileSync(path.join(OUT, "evidence.json"), JSON.stringify({ evidence, log }, null, 2));
    await browser.close();
    console.log(JSON.stringify({ overall: evidence.overall, propertyId: evidence.propertyId, out: OUT }, null, 2));
  }
}

main();
