#!/usr/bin/env node
import { loadDotEnv, requireE2eAdmin, clientSourcePath } from "./lib/local-e2e-env.mjs";
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

loadDotEnv();
function loadEnv() {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

// Use vitest-compiled path via dynamic import of built sources through tsx register
const { register } = await import("node:module");
try {
  register("tsx/esm", import.meta.url);
} catch {
  /* tsx may already be available via npx */
}

const { parseHelloDataPdfBuffer } = await import("../src/lib/extraction/hellodata-pdf.ts");
const { extractExcelHyperlinks } = await import("../src/lib/extraction/listing-links.ts");

const BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const ORG = "b4cd06aa-c1f2-4170-ae1f-ad53d88d9c3a";
const OUT = path.join(process.cwd(), "tmp/task18b");
fs.mkdirSync(OUT, { recursive: true });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const HD =
  clientSourcePath("855 Providence St - 2BR Report Package", "3 Source files", "855_Providence_St_-11-14-2026.pdf");

async function main() {
  const hd = await parseHelloDataPdfBuffer({
    filename: "855.pdf",
    bytes: new Uint8Array(fs.readFileSync(HD)),
  });
  const evidence = {
    helloData: {
      subjectName: hd.subjectName,
      subjectAddress: hd.subjectAddress,
      documentListingLinks: hd.documentListingLinks,
      websiteCount: hd.buildings.filter((b) => b.websiteUrl).length,
      withSite: hd.buildings
        .filter((b) => b.websiteUrl)
        .slice(0, 10)
        .map((b) => ({
          name: b.name,
          isSubject: b.isSubject,
          websiteUrl: b.websiteUrl,
          address: b.address?.raw,
        })),
    },
  };

  const csv = `address,name,url,price,size (sqft),bedrooms,baths,property type,list date,outlier
"100 Example St, Sample City, RI 02900, USA",Example Court,https://www.zillow.com/homedetails/100-example/1_zpid/,2000,900,2,1ba,Apartment,10/27/2026,FALSE
"200 Demo Ave, Sample City, RI 02901, USA",Demo Towers,https://demo-towers.example.com,2480,1040,2,1ba,apartment,10/27/2026,FALSE
`;
  fs.writeFileSync(path.join(OUT, "rentometer-with-links.csv"), csv);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["address", "price", "size (sqft)", "bedrooms", "baths", "property type", "list date", "outlier"],
    ["300 Link St, Sample City, RI 02902, USA", 1850, 800, 2, "1ba", "Apartment", "10/27/2026", "FALSE"],
  ]);
  ws.A2.l = { Target: "https://www.apartments.com/link-st-ri/abc123/" };
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, path.join(OUT, "rentometer-with-hyperlink.xlsx"));
  evidence.excelHyperlinks = extractExcelHyperlinks(wb);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const __e2eAdmin = requireE2eAdmin();
  await page.locator("#login-email").fill(__e2eAdmin.email);
  await page.locator("#login-password").fill(__e2eAdmin.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 });
  const cookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const stamp = Date.now().toString(36).slice(-4);

  const create = await fetch(`${BASE}/api/properties`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "Idempotency-Key": `18b-${stamp}`,
    },
    body: JSON.stringify({
      organizationId: ORG,
      name: `Eighteen B Identity ${stamp}`,
      addressLine1: `${50 + (Date.now() % 100)} Identity Ave ${stamp}`,
      city: "Providence",
      state: "RI",
      postalCode: "02903",
      country: "US",
      amenities: [],
      externalLinks: {},
      confirmDuplicateAddress: true,
    }),
  });
  const cj = await create.json();
  const propertyId = cj?.data?.property?.id;
  evidence.createProperty = { ok: create.ok, propertyId, status: create.status, err: cj?.error };
  if (!propertyId) throw new Error(`create failed: ${JSON.stringify(cj).slice(0, 300)}`);

  const ut = await fetch(`${BASE}/api/properties/${propertyId}/unit-types`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "Idempotency-Key": `18b-ut-${stamp}`,
    },
    body: JSON.stringify({ label: "2BR", beds: 2, baths: 1 }),
  });
  const unitTypeId = (await ut.json())?.data?.unitType?.id;

  async function upload(sourceType, filePath) {
    const buf = fs.readFileSync(filePath);
    const fd = new FormData();
    fd.set("file", new Blob([buf]), path.basename(filePath));
    fd.set("sourceType", sourceType);
    fd.set("organizationId", ORG);
    fd.set("propertyId", propertyId);
    if (unitTypeId) fd.set("unitTypeId", unitTypeId);
    const res = await fetch(`${BASE}/api/uploads`, {
      method: "POST",
      headers: { Cookie: cookie, "Idempotency-Key": `18b-up-${sourceType}-${Date.now()}` },
      body: fd,
    });
    const json = await res.json();
    const extractions = json?.data?.extractions || [];
    return {
      ok: res.ok,
      status: res.status,
      message: json?.error?.message,
      count: extractions.length,
      sample: extractions.slice(0, 4).map((e) => ({
        key: e.field_key,
        name: e.normalized_value?.name,
        listingUrl: e.normalized_value?.listingUrl,
        websiteUrl: e.normalized_value?.websiteUrl,
        address: e.normalized_value?.address?.line1 || e.normalized_value?.address?.raw,
      })),
    };
  }

  evidence.uploads = {
    rentometer_csv_links: await upload("rentometer_csv", path.join(OUT, "rentometer-with-links.csv")),
    rentometer_xlsx_hyperlink: await upload(
      "rentometer_xlsx",
      path.join(OUT, "rentometer-with-hyperlink.xlsx"),
    ),
    hellodata: await upload("hellodata_pdf", HD),
  };

  const { data: propAfter } = await admin
    .from("properties")
    .select("name,marketing_name,address_line1,city,state,postal_code,external_links")
    .eq("id", propertyId)
    .single();
  evidence.propertyAfterUploads = propAfter;

  await admin
    .from("properties")
    .update({ marketing_name: "Staff Verified Marketing Name" })
    .eq("id", propertyId);
  evidence.uploads.hellodata_reupload = await upload("hellodata_pdf", HD);
  const { data: propAfterStaff } = await admin
    .from("properties")
    .select("marketing_name,external_links")
    .eq("id", propertyId)
    .single();
  evidence.staffCorrectionPreserved =
    propAfterStaff?.marketing_name === "Staff Verified Marketing Name";

  await page.goto(`${BASE}/buildings/${propertyId}/comparables`, {
    waitUntil: "domcontentloaded",
  });
  for (let i = 0; i < 25; i++) {
    const t = await page.locator("body").innerText();
    if (!/Checking your account/i.test(t)) break;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1500);
  const body = await page.locator("body").innerText();
  evidence.browserReview = {
    hasPending: /Accept|Exclude|Pending/i.test(body),
    showsNames: /Example Court|Demo Towers/i.test(body),
    showsAddress: /Example St|Demo Ave|Link St/i.test(body),
    showsLink: /Listing \/ website link/i.test(body),
    snippet: body.match(/Pending candidates[\s\S]{0,900}/)?.[0]?.slice(0, 800) || body.slice(0, 400),
  };
  await page.screenshot({ path: path.join(OUT, "comparables-review.png"), fullPage: true });

  await page.goto(`${BASE}/buildings/${propertyId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Property details" }).waitFor({ timeout: 30000 });
  const pbody = await page.locator("body").innerText();
  evidence.browserProperty = {
    hasWebsiteField: /Property website/i.test(pbody),
    staffName: /Staff Verified Marketing Name/i.test(pbody),
  };
  await page.screenshot({ path: path.join(OUT, "property-details.png"), fullPage: true });

  fs.writeFileSync(path.join(OUT, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify(
      {
        subjectName: evidence.helloData.subjectName,
        subjectAddress: evidence.helloData.subjectAddress,
        websiteCount: evidence.helloData.websiteCount,
        withSite: evidence.helloData.withSite,
        csv: evidence.uploads.rentometer_csv_links,
        xlsx: evidence.uploads.rentometer_xlsx_hyperlink,
        hdOk: evidence.uploads.hellodata.ok,
        hdSample: evidence.uploads.hellodata.sample,
        marketing: evidence.propertyAfterUploads?.marketing_name,
        staffPreserved: evidence.staffCorrectionPreserved,
        browser: evidence.browserReview,
        browserProperty: evidence.browserProperty,
        excelHyperlinks: evidence.excelHyperlinks,
      },
      null,
      2,
    ),
  );
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
