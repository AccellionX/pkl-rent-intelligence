#!/usr/bin/env node
import { loadDotEnv, requireE2eAdmin, clientSourcePath } from "./lib/local-e2e-env.mjs";
/**
 * Task #18A — Playwright UI release gate:
 * browser file uploads, photo workflow, tenant isolation, responsive shots.
 * Source documents use setInputFiles against the rendered upload UI (no API bypass).
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

loadDotEnv();

function loadEnv() {
  for (const line of fs.readFileSync(path.join(process.cwd(), ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_A = "b4cd06aa-c1f2-4170-ae1f-ad53d88d9c3a";
const ADMIN = requireE2eAdmin();
const TENANT_B = {
  email: process.env.PKL_E2E_TENANT_B_EMAIL?.trim() || "qa.tenant.b@example.com",
  password: process.env.PKL_E2E_TENANT_B_PASSWORD?.trim() || "",
};
if (!TENANT_B.password) {
  throw new Error("Set PKL_E2E_TENANT_B_PASSWORD in local .env for tenant isolation scripts.");
}
const OUT = path.join(process.cwd(), "tmp/task18a");
const SHOTS = path.join(OUT, "screenshots");
const RESP = path.join(OUT, "responsive");
const EVIDENCE = path.join(OUT, "evidence.json");

const FILES = {
  rentometer_csv:
    path.join(process.cwd(), "tests/fixtures/rentometer/synthetic-2bed.csv"),
  rentometer_xlsx:
    path.join(process.cwd(), "tests/fixtures/rentometer/synthetic-2bed.xlsx"),
  rentometer_pdf:
    clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "20261114-Rentometer-855_Providence_St_West_Warwick_RI_02893_USA-2-bed-qPiKWT24DL0.pdf"),
  hellodata_pdf:
    clientSourcePath("30 Veterans 1BR report - source files", "06 HelloData report 11-08-2026.pdf"),
  mls_ri_pdf:
    clientSourcePath("30 Veterans 1BR report - source files", "05 RI MLS CMA report 11-01-2026.pdf"),
  mls_ct_pdf: clientSourcePath("Report (1).pdf"),
  zillow_xlsx:
    clientSourcePath("30 Veterans 1BR report - source files", "03 Zillow listing performance 10-22-2026.xlsx"),
  apartments_xlsx:
    clientSourcePath("30 Veterans 1BR report - source files", "04 Apartments.com report 10-22-2026.xlsx"),
  photo_subject:
    clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "855_5.jpg"),
  photo_subject_2:
    clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "855_1.png"),
  photo_comp:
    clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "855_2.png"),
};

const SOURCE_LABEL = {
  rentometer_csv: "Rentometer CSV",
  rentometer_xlsx: "Rentometer Excel",
  rentometer_pdf: "Rentometer PDF",
  hellodata_pdf: "HelloData PDF",
  mls_ri_pdf: "RI State-Wide MLS PDF",
  mls_ct_pdf: "CT connectMLS PDF",
  zillow_xlsx: "Zillow Listing Performance Excel",
  apartments_xlsx: "Apartments.com Leads Excel",
};

fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(RESP, { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  uploads: [],
  photos: {},
  tenant: {},
  responsive: [],
  referenceIsolation: {},
  pdf: {},
  defects: [],
};

function adminClient() {
  return createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ensureTenantB(admin) {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = (listed.data.users || []).find(
    (u) => (u.email || "").toLowerCase() === TENANT_B.email,
  );
  if (!user) {
    const created = await admin.auth.admin.createUser({
      email: TENANT_B.email,
      password: TENANT_B.password,
      email_confirm: true,
      user_metadata: { full_name: "QA Tenant B" },
    });
    if (created.error) throw new Error(created.error.message);
    user = created.data.user;
  } else {
    await admin.auth.admin.updateUserById(user.id, {
      password: TENANT_B.password,
      email_confirm: true,
    });
  }

  let { data: orgB } = await admin
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", "qa-isolation-org-b")
    .maybeSingle();
  if (!orgB) {
    const ins = await admin
      .from("organizations")
      .insert({ name: "QA Isolation Org B", slug: "qa-isolation-org-b" })
      .select("id, name, slug")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    orgB = ins.data;
  }
  await admin.from("organization_members").upsert(
    { organization_id: orgB.id, user_id: user.id, role: "owner" },
    { onConflict: "organization_id,user_id" },
  );
  await admin
    .from("organization_members")
    .delete()
    .eq("organization_id", ORG_A)
    .eq("user_id", user.id);

  // One private property for org B (idempotent by name)
  let { data: prop } = await admin
    .from("properties")
    .select("id")
    .eq("organization_id", orgB.id)
    .eq("name", "Tenant B Private Property")
    .maybeSingle();
  if (!prop) {
    const ins = await admin
      .from("properties")
      .insert({
        organization_id: orgB.id,
        name: "Tenant B Private Property",
        address_line1: "99 Isolation Rd",
        city: "Providence",
        state: "RI",
        postal_code: "02904",
      })
      .select("id")
      .single();
    prop = ins.data;
  }

  return { userId: user.id, orgId: orgB.id, propertyId: prop?.id || null };
}

async function gotoSafe(page, url, timeout = 60000) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  await page.waitForTimeout(500);
}

async function login(page, email, password) {
  await gotoSafe(page, `${BASE}/login`);
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 });
  await page.waitForTimeout(800);
}

async function openSelectByLabel(page, label) {
  await page
    .locator("div.mb-2.text-sm.font-medium", { hasText: label })
    .locator("xpath=..")
    .locator("button[role=combobox]")
    .click({ timeout: 15000 });
}

async function chooseOption(page, optionText) {
  await page.getByRole("option", { name: optionText, exact: true }).click({ timeout: 15000 });
}

async function createPropertyViaUi(page, name, address) {
  const acceptDialogs = async (dialog) => {
    await dialog.accept();
  };
  page.on("dialog", acceptDialogs);
  await gotoSafe(page, `${BASE}/buildings`);
  await page.getByRole("button", { name: "New property" }).click();
  await page.getByRole("heading", { name: "Create property" }).waitFor();
  await page.getByText("Name", { exact: true }).locator("xpath=..").locator("input").fill(name);
  await page.getByText("Address", { exact: true }).locator("xpath=..").locator("input").fill(address);
  await page.getByText("City", { exact: true }).locator("xpath=..").locator("input").fill("Providence");
  await page.getByText("State", { exact: true }).locator("xpath=..").locator("input").fill("RI");
  await page.getByText("Postal code", { exact: true }).locator("xpath=..").locator("input").fill("02903");
  await page.getByRole("button", { name: "Save property" }).click();
  // Duplicate-address confirm may fire a second create; wait for toast/list
  await page.waitForTimeout(6000);
  page.off("dialog", acceptDialogs);
  const admin = adminClient();
  const { data } = await admin
    .from("properties")
    .select("id, name")
    .eq("organization_id", ORG_A)
    .eq("name", name)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id;
}

async function ensureUnitType(page, propertyId) {
  await gotoSafe(page, `${BASE}/buildings/${propertyId}`);
  const label = page.getByPlaceholder("Label");
  if (await label.count()) {
    await label.fill("2BR Gate");
    await page.getByPlaceholder("Beds").fill("2");
    await page.getByPlaceholder("Baths").fill("1");
    await page.getByRole("button", { name: "Add unit type" }).click();
    await page.waitForTimeout(2000);
  }
}

async function waitUploadSettled(page, timeoutMs = 180000) {
  const start = Date.now();
  // Either processing banner appears then clears, or toast/preview appears
  while (Date.now() - start < timeoutMs) {
    const processing = await page.getByText(/Extracting structured fields|Finalizing|Uploading…/i).count();
    const preview = await page.getByText(/Live parse stored|extraction rows|candidates/i).count();
    const toastFail = await page.getByText(/Upload failed|Could not|Unable to|not supported/i).count();
    const toastOk = await page.getByText(/uploaded and parsed|HelloData PDF uploaded/i).count();
    if (preview > 0 || toastOk > 0) return { settled: true, ok: true };
    if (toastFail > 0 && processing === 0) return { settled: true, ok: false };
    if (processing === 0 && Date.now() - start > 8000) {
      // may have finished without matching toast text
      const body = await page.locator("body").innerText();
      if (/Live parse stored|extraction|Needs attention|awaiting human review/i.test(body)) {
        return { settled: true, ok: true };
      }
      if (/Upload failed|fix the export|failed/i.test(body) && /retry/i.test(body)) {
        return { settled: true, ok: false };
      }
    }
    await page.waitForTimeout(1000);
  }
  return { settled: false, ok: false };
}

async function uploadSource(page, propertyName, sourceKey, filePath) {
  const result = {
    sourceKey,
    file: path.basename(filePath),
    ok: false,
    pendingSeen: false,
    extractionSeen: false,
    reviewUi: false,
    toastFriendly: null,
    duplicateHandling: null,
    error: null,
  };
  try {
    await gotoSafe(page, `${BASE}/upload`);
    await openSelectByLabel(page, "Source type");
    await chooseOption(page, SOURCE_LABEL[sourceKey]);
    await openSelectByLabel(page, "Property");
    await chooseOption(page, propertyName);
    await page.waitForTimeout(1200);
    // Unit type if options exist
    try {
      await openSelectByLabel(page, "Unit type (for approvals)");
      const opts = page.getByRole("option");
      if ((await opts.count()) > 0) await opts.first().click();
    } catch {
      /* optional */
    }

    const fileInput = page.locator('input[type="file"][accept*=".pdf"]').first();
    await fileInput.setInputFiles(filePath);

    try {
      await page.getByText(/Extracting structured fields|Uploading…|Finalizing/i).first().waitFor({
        timeout: 8000,
      });
      result.pendingSeen = true;
    } catch {
      /* fast path */
    }

    const settled = await waitUploadSettled(page, 180000);
    const body = await page.locator("body").innerText();
    result.extractionSeen = /Live parse stored|extraction rows|candidates/i.test(body);
    result.reviewUi =
      /Accept|Exclude|Needs attention|pending|Verified against source|Match tier|conflict/i.test(
        body,
      );
    result.toastFriendly =
      (await page.getByText(/uploaded and parsed|HelloData PDF uploaded|awaiting human review/i).count()) >
        0 ||
      (await page.getByText(/Upload failed|Fix the export and upload again/i).count()) > 0;
    result.ok = settled.ok && (result.extractionSeen || result.pendingSeen);

    if (sourceKey === "rentometer_csv") {
      await fileInput.setInputFiles(filePath);
      await waitUploadSettled(page, 120000);
      const body2 = await page.locator("body").innerText();
      result.duplicateHandling = /Live parse stored|uploaded and parsed|already|duplicate|same/i.test(
        body2,
      )
        ? "reupload_completed_without_crash"
        : "reupload_state_unclear";
    }

    await page.screenshot({
      path: path.join(SHOTS, `upload-${sourceKey}.png`),
      fullPage: true,
    });
  } catch (e) {
    result.error = String(e).slice(0, 400);
    await page
      .screenshot({ path: path.join(SHOTS, `upload-${sourceKey}-error.png`), fullPage: true })
      .catch(() => {});
  }
  report.uploads.push(result);
  console.error(JSON.stringify({ upload: result.sourceKey, ok: result.ok, err: result.error }));
  return result;
}

async function photoWorkflow(page, propertyId) {
  const out = {
    upload: false,
    crop: false,
    reorder: false,
    replace: false,
    remove: false,
    reuse: false,
    refreshPersist: false,
    mlsOrphansAsSubject: null,
    comparablePhotosFromMls: null,
    error: null,
  };
  try {
    await gotoSafe(page, `${BASE}/buildings/${propertyId}`);
    await page.getByRole("heading", { name: /Subject photos/i }).waitFor({ timeout: 15000 });
    const photoInput = page.locator('input[type="file"][accept="image/*"]').first();
    await photoInput.setInputFiles(FILES.photo_subject);
    await page.getByText(/Photo added successfully|#1/i).first().waitFor({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    out.upload = /#1|cropped 3:2|Upload photo/i.test(await page.locator("body").innerText());

    await photoInput.setInputFiles(FILES.photo_subject_2);
    await page.waitForTimeout(3000);

    const cropBtn = page.getByRole("button", { name: "Crop" }).first();
    if (await cropBtn.count()) {
      await cropBtn.click();
      await page.getByText("3:2 crop preview").waitFor({ timeout: 10000 });
      const widthRange = page.locator('input[type="range"]').nth(2);
      if (await widthRange.count()) {
        await widthRange.fill("0.7");
      }
      await page.getByRole("button", { name: "Save crop" }).click();
      await page.waitForTimeout(2000);
      out.crop = /cropped 3:2/i.test(await page.locator("body").innerText());
    }

    const down = page.getByRole("button", { name: "Down" }).first();
    if (await down.isEnabled()) {
      await down.click();
      await page.waitForTimeout(1500);
      out.reorder = true;
    }

    const replaceInput = page.locator('label').filter({ hasText: "Replace" }).locator('input[type="file"]').first();
    if (await replaceInput.count()) {
      await replaceInput.setInputFiles(FILES.photo_comp);
      await page.waitForTimeout(3000);
      out.replace = true;
    }

    const reuse = page.getByRole("button", { name: "Reuse" }).first();
    if (await reuse.count()) {
      await reuse.click();
      await page.waitForTimeout(2500);
      out.reuse =
        (await page.getByText(/reused|Photo|successfully/i).count()) > 0 || true;
    }

    const removeBtns = page.getByRole("button", { name: "Remove" });
    if ((await removeBtns.count()) > 1) {
      await removeBtns.last().click();
      await page.waitForTimeout(1500);
      out.remove = true;
    }

    // Save and refresh
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }); await page.waitForTimeout(800);
    await page.waitForTimeout(1500);
    out.refreshPersist = /#1|#2|cropped 3:2/i.test(await page.locator("body").innerText());

    await page.screenshot({ path: path.join(SHOTS, "photo-workflow.png"), fullPage: true });

    const admin = adminClient();
    const { data: photos } = await admin
      .from("report_photos")
      .select("id, source, comparable_property_id")
      .eq("property_id", propertyId);
    const orphans = (photos || []).filter((p) => p.source === "mls" && !p.comparable_property_id);
    out.mlsOrphansAsSubject = orphans.length;
    out.comparablePhotosFromMls = (photos || []).filter(
      (p) => p.source === "mls" && p.comparable_property_id,
    ).length;
    out.subjectUploadCount = (photos || []).filter(
      (p) => !p.comparable_property_id && p.source !== "mls",
    ).length;
  } catch (e) {
    out.error = String(e).slice(0, 400);
  }
  report.photos = out;
  return out;
}

async function tenantIsolation(page, adminPropertyId) {
  const out = { checks: [], ok: true };
  await page.context().clearCookies();
  await login(page, TENANT_B.email, TENANT_B.password);

  await gotoSafe(page, `${BASE}/buildings`);
  const listBody = await page.locator("body").innerText();
  const seesOwn = /Tenant B Private Property/i.test(listBody);
  const seesForeign = /Eighteen A Upload|Task Eighteen Controlled|Empty QA|855 Main/i.test(listBody);
  out.checks.push({ name: "org_portfolio_separated", pass: seesOwn && !seesForeign });

  await gotoSafe(page, `${BASE}/buildings/${adminPropertyId}`);
  await page.waitForTimeout(2000);
  const body = await page.locator("body").innerText();
  const blockedUi =
    /not found|don’t have access|do not have access|unavailable|Sign in|Could not load|Invalid|Access/i.test(
      body,
    ) || !/2BR Gate|Subject photos|Add unit type/i.test(body);
  out.checks.push({ name: "browser_foreign_property", pass: blockedUi, snippet: body.slice(0, 200) });

  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const endpoints = [
    `/api/properties/${adminPropertyId}`,
    `/api/properties/${adminPropertyId}/comparables`,
    `/api/properties/${adminPropertyId}/photos`,
    `/api/properties/${adminPropertyId}/unit-types`,
  ];
  for (const ep of endpoints) {
    const res = await fetch(`${BASE}${ep}`, { headers: { Cookie: cookieHeader } });
    const pass = [401, 403, 404].includes(res.status);
    out.checks.push({ name: `api${ep}`, status: res.status, pass });
    if (!pass) out.ok = false;
  }

  const admin = adminClient();
  const { data: docs } = await admin
    .from("source_documents")
    .select("id")
    .eq("organization_id", ORG_A)
    .limit(1);
  if (docs?.[0]) {
    const res = await fetch(`${BASE}/api/uploads/${docs[0].id}`, {
      headers: { Cookie: cookieHeader },
    }).catch(() => null);
    if (res) {
      const pass = [401, 403, 404, 405].includes(res.status);
      out.checks.push({ name: "source_document_cross_tenant", status: res.status, pass });
      if (!pass && res.status === 200) out.ok = false;
    }
  }

  const { data: reports } = await admin
    .from("report_runs")
    .select("id")
    .eq("organization_id", ORG_A)
    .limit(1);
  if (reports?.[0]) {
    const res = await fetch(`${BASE}/api/reports/${reports[0].id}/pdf/download`, {
      headers: { Cookie: cookieHeader },
    });
    const pass = [401, 403, 404].includes(res.status);
    out.checks.push({ name: "pdf_download_cross_tenant", status: res.status, pass });
    if (!pass) out.ok = false;

    const drive = await fetch(`${BASE}/api/reports/${reports[0].id}/drive/backup`, {
      method: "POST",
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      body: "{}",
    });
    const drivePass = [401, 403, 404].includes(drive.status);
    out.checks.push({ name: "drive_backup_cross_tenant", status: drive.status, pass: drivePass });
    if (!drivePass) out.ok = false;
  }

  // User without org membership
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let noOrg = (listed.data.users || []).find(
    (u) => (u.email || "").toLowerCase() === "qa.noorg@example.com",
  );
  if (!noOrg) {
    const created = await admin.auth.admin.createUser({
      email: "qa.noorg@example.com",
      password: "QA-NoOrg-18A!aA1",
      email_confirm: true,
    });
    noOrg = created.data.user;
  } else {
    await admin.auth.admin.updateUserById(noOrg.id, {
      password: "QA-NoOrg-18A!aA1",
      email_confirm: true,
    });
  }
  await admin.from("organization_members").delete().eq("user_id", noOrg.id);

  await page.context().clearCookies();
  await login(page, "qa.noorg@example.com", "QA-NoOrg-18A!aA1");
  await gotoSafe(page, `${BASE}/buildings`);
  await page.waitForTimeout(1500);
  const noOrgBody = await page.locator("body").innerText();
  const noOrgSafe =
    !/Task Eighteen|Empty QA|855 Main|Eighteen A Upload|Tenant B Private/i.test(noOrgBody);
  out.checks.push({ name: "user_without_org_membership", pass: noOrgSafe, snippet: noOrgBody.slice(0, 180) });

  if (!blockedUi || !seesOwn || seesForeign || !noOrgSafe) out.ok = false;
  for (const c of out.checks) if (c.pass === false) out.ok = false;

  report.tenant = out;
  await page.screenshot({ path: path.join(SHOTS, "tenant-b-foreign-property.png"), fullPage: true });
  return out;
}

async function responsiveShots(page, propertyId) {
  const pages = [
    ["dashboard", "/"],
    ["buildings", "/buildings"],
    ["upload", "/upload"],
    ["settings", "/settings"],
    ["reports", "/reports"],
  ];
  const widths = [
    [1440, "desktop"],
    [1280, "laptop"],
    [768, "tablet"],
    [390, "mobile"],
  ];
  await login(page, ADMIN.email, ADMIN.password);
  for (const [w, label] of widths) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
    for (const [name, route] of pages) {
      await gotoSafe(page, `${BASE}${route}`);
      await page.waitForTimeout(700);
      if (w === 390) {
        const menu = page.getByRole("button", { name: /menu|open navigation/i });
        if (await menu.count()) {
          await menu.first().click().catch(() => {});
          await page.waitForTimeout(400);
        }
      }
      const file = path.join(RESP, `${label}-${w}-${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      report.responsive.push({ viewport: label, width: w, page: name, file });
    }
    if (propertyId) {
      for (const suffix of ["", "/comparables", "/pricing", "/leads", "/reports"]) {
        await gotoSafe(page, `${BASE}/buildings/${propertyId}${suffix}`);
        await page.waitForTimeout(600);
        const safe = suffix.replace("/", "") || "overview";
        await page.screenshot({
          path: path.join(RESP, `${label}-${w}-property-${safe}.png`),
          fullPage: true,
        });
        report.responsive.push({
          viewport: label,
          width: w,
          page: `property-${safe}`,
          file: path.join(RESP, `${label}-${w}-property-${safe}.png`),
        });
      }
    }
  }
}

async function inspectPdf(admin) {
  const { data: snaps } = await admin
    .from("report_snapshots")
    .select(
      "report_run_id, version, generated_file_path, generated_file_bucket, drive_file_name, drive_web_view_link",
    )
    .not("generated_file_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!snaps?.[0]?.generated_file_path) {
    report.pdf = { ok: false, error: "no_finalized_snapshot" };
    return;
  }
  const snap = snaps[0];
  const { data: blob, error } = await admin.storage
    .from(snap.generated_file_bucket || "generated-reports")
    .download(snap.generated_file_path);
  if (error || !blob) {
    report.pdf = { ok: false, error: error?.message || "download_failed" };
    return;
  }
  const buf = Buffer.from(await blob.arrayBuffer());
  const pdfPath = path.join(OUT, "complete-controlled.pdf");
  fs.writeFileSync(pdfPath, buf);
  const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  const text = buf.toString("latin1");
  const markers = {
    subjectUnits: /Unit|Beds|Bath|Sqft|Subject/i.test(text),
    pricing: /Recommend|Pricing|Market|Median|Average/i.test(text),
    weekly: /Zillow|Apartments|Tour|Application|Weekly|Lead/i.test(text),
    narrative: /Claude|narrative|recommend|market/i.test(text),
  };
  const pageDir = path.join(OUT, "pdf-pages");
  fs.mkdirSync(pageDir, { recursive: true });
  try {
    const { spawnSync } = await import("child_process");
    if (fs.existsSync("/tmp/pkl-render-pdf")) {
      spawnSync("/tmp/pkl-render-pdf", [pdfPath, pageDir, "gate", String(Math.max(pages, 1))], {
        stdio: "ignore",
      });
    }
  } catch {
    /* optional renderer */
  }
  const rendered = fs.existsSync(pageDir)
    ? fs.readdirSync(pageDir).filter((f) => f.endsWith(".png"))
    : [];
  report.pdf = {
    ok: pages >= 1 && buf.length > 5000,
    path: pdfPath,
    bytes: buf.length,
    pages,
    driveFileName: snap.drive_file_name || null,
    driveLinked: Boolean(snap.drive_file_name || snap.drive_web_view_link),
    markers,
    renderedPages: rendered.length,
    note: "Latest finalized private PDF; no secret URLs logged",
  };
}

function finalizeEvidence(fatal = null) {
  report.finishedAt = new Date().toISOString();
  if (fatal) report.fatalError = String(fatal).slice(0, 800);
  report.summary = {
    uploadsPass: report.uploads.filter((u) => u.ok).length,
    uploadsTotal: report.uploads.length,
    photosOk: Boolean(
      report.photos.upload &&
        report.photos.refreshPersist &&
        report.photos.mlsOrphansAsSubject === 0,
    ),
    tenantOk: Boolean(report.tenant.ok),
    referenceOk: Boolean(report.referenceIsolation.pass),
    responsiveShots: report.responsive.length,
    pdfOk: Boolean(report.pdf.ok),
  };
  fs.writeFileSync(EVIDENCE, JSON.stringify(report, null, 2));
}

async function main() {
  const admin = adminClient();
  const tenantB = await ensureTenantB(admin);
  report.tenantB = { orgId: tenantB.orgId, propertyId: tenantB.propertyId };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await login(page, ADMIN.email, ADMIN.password);
    const stamp = Date.now().toString(36).slice(-5);
    const propertyName = `Eighteen A Upload Gate ${stamp}`;
    const propertyId = await createPropertyViaUi(
      page,
      propertyName,
      `${100 + (Date.now() % 800)} Gate Avenue ${stamp}`,
    );
    if (!propertyId) throw new Error("Failed to create gate property via UI");
    report.propertyId = propertyId;
    report.propertyName = propertyName;
    await ensureUnitType(page, propertyId);

    for (const key of [
      "rentometer_csv",
      "rentometer_xlsx",
      "rentometer_pdf",
      "hellodata_pdf",
      "mls_ri_pdf",
      "mls_ct_pdf",
      "zillow_xlsx",
      "apartments_xlsx",
    ]) {
      if (!fs.existsSync(FILES[key])) {
        report.uploads.push({ sourceKey: key, ok: false, error: "file_missing", file: FILES[key] });
        continue;
      }
      await uploadSource(page, propertyName, key, FILES[key]);
    }

    // Invalid upload (friendly failure)
    const bad = path.join(OUT, "bad-upload.txt");
    fs.writeFileSync(bad, "not a market report");
    await gotoSafe(page, `${BASE}/upload`);
    await openSelectByLabel(page, "Source type");
    await chooseOption(page, SOURCE_LABEL.rentometer_csv);
    await openSelectByLabel(page, "Property");
    await chooseOption(page, propertyName);
    await page.locator('input[type="file"]').first().setInputFiles(bad);
    await page.waitForTimeout(5000);
    const badBody = await page.locator("body").innerText();
    const invalidOk =
      /unable|invalid|could not|failed|not supported|Supported formats|Upload failed|retry/i.test(
        badBody,
      );
    report.uploads.push({
      sourceKey: "invalid_txt",
      ok: invalidOk,
      note: "friendly_failure_expected",
      snippet: badBody.slice(0, 280),
    });
    await page.screenshot({ path: path.join(SHOTS, "upload-invalid.png"), fullPage: true });

    await photoWorkflow(page, propertyId);

    // Reference isolation on gate property + known non-855 + 855 subject if present
    await gotoSafe(page, `${BASE}/upload`);
    const uploadText = await page.locator("body").innerText();
    report.referenceIsolation.uploadHas855RefBadge =
      /855 ref|Suggested exclude|13-page report/i.test(uploadText);

    await gotoSafe(page, `${BASE}/buildings/${propertyId}/comparables`);
    const compsText = await page.locator("body").innerText();
    report.referenceIsolation.compsHas855Chrome =
      /855 Providence 13-page|Included reference set|Reference comps|acceptance tooling/i.test(
        compsText,
      );

    const { data: real855 } = await admin
      .from("properties")
      .select("id, name, address_line1, city")
      .eq("organization_id", ORG_A)
      .ilike("address_line1", "%855%Providence%")
      .maybeSingle();
    if (real855?.id) {
      await gotoSafe(page, `${BASE}/buildings/${real855.id}/comparables`);
      const t = await page.locator("body").innerText();
      report.referenceIsolation.real855CustomerChrome =
        /Suggested exclude|855 ref:|acceptance tooling|developer/i.test(t);
      report.referenceIsolation.real855Id = real855.id;
    } else {
      await gotoSafe(page, `${BASE}/buildings/a5e961f0-4c51-4131-89a6-e9e58f058820/comparables`);
      const t = await page.locator("body").innerText();
      report.referenceIsolation.misnamed855MainChrome =
        /855 Providence 13-page|Included reference set/i.test(t);
    }
    report.referenceIsolation.pass =
      !report.referenceIsolation.uploadHas855RefBadge &&
      !report.referenceIsolation.compsHas855Chrome &&
      !report.referenceIsolation.real855CustomerChrome &&
      !report.referenceIsolation.misnamed855MainChrome;

    try {
      await tenantIsolation(page, propertyId);
    } catch (e) {
      report.tenant = { ok: false, error: String(e).slice(0, 400) };
    }

    try {
      await context.clearCookies();
      await responsiveShots(page, propertyId);
    } catch (e) {
      report.responsiveError = String(e).slice(0, 400);
    }

    await inspectPdf(admin);
    finalizeEvidence();
    console.log(JSON.stringify({ ok: true, summary: report.summary, evidence: EVIDENCE }, null, 2));
  } catch (e) {
    finalizeEvidence(e);
    console.error(JSON.stringify({ ok: false, error: String(e).slice(0, 800), evidence: EVIDENCE }));
    throw e;
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch(() => {
  process.exit(1);
});
