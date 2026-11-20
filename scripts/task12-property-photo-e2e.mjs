#!/usr/bin/env node
/**
 * Task #12 live E2E — org selection, subject units CRUD, photo crop, tenant isolation.
 * No scraping. No public photo URLs. Does not auto-approve comps.
 */
import fs from "fs";
import path from "path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userJsonPath =
  process.env.PKL_TASK05_USER_JSON;
const creds = JSON.parse(fs.readFileSync(userJsonPath || (() => { throw new Error("Set PKL_TASK05_USER_JSON to a local credentials JSON path"); })(), "utf8"));
const cookieJar = new Map();

function userClient() {
  return createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return [...cookieJar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          if (!value) cookieJar.delete(name);
          else cookieJar.set(name, value);
        }
      },
    },
  });
}

async function api(method, pathname, { json, formData } = {}) {
  const headers = {
    Cookie: [...cookieJar.entries()].map(([n, v]) => `${n}=${v}`).join("; "),
  };
  let body;
  if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (formData) {
    body = formData;
  }
  const res = await fetch(`${BASE}${pathname}`, { method, headers, body });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

/** Minimal 1x1 JPEG */
function tinyJpeg() {
  const b64 =
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z";
  return Buffer.from(b64, "base64");
}

async function main() {
  const out = { status: "partial_or_fail", steps: {} };
  const health = await fetch(`${BASE}/api/health`)
    .then((r) => r.json())
    .catch((e) => ({ error: String(e) }));
  out.steps.health = health;
  if (health?.mode !== "live") {
    out.status = "blocked_dev_server";
    console.log(JSON.stringify(out, null, 2));
    process.exit(2);
  }

  const auth = userClient();
  const { data: authData, error: authError } = await auth.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (authError || !authData.session) {
    out.status = "auth_failed";
    out.error = authError?.message;
    console.log(JSON.stringify(out, null, 2));
    process.exit(3);
  }

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId = authData.user.id;

  const me = await api("GET", "/api/me");
  out.steps.me = {
    ok: me.ok,
    orgCount: me.data?.data?.organizations?.length ?? 0,
    suggestedOrganizationId: me.data?.data?.suggestedOrganizationId ?? null,
    propertyCounts: (me.data?.data?.organizations ?? []).map((o) => ({
      id: o.id,
      propertyCount: o.propertyCount,
    })),
  };

  const orgs = me.data?.data?.organizations ?? [];
  const suggested = me.data?.data?.suggestedOrganizationId;
  const primaryOrg =
    orgs.find((o) => o.id === suggested) ??
    orgs.find((o) => (o.propertyCount ?? 0) > 0) ??
    orgs[0];
  if (!primaryOrg) {
    out.error = "no organization membership";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const propsList = await api(
    "GET",
    `/api/properties?organizationId=${primaryOrg.id}`,
  );
  out.steps.propertiesList = {
    ok: propsList.ok,
    count: propsList.data?.data?.properties?.length ?? 0,
  };

  let propertyId = propsList.data?.data?.properties?.[0]?.id;
  if (!propertyId) {
    const created = await api("POST", "/api/properties", {
      json: {
        organizationId: primaryOrg.id,
        name: "Task12 Test Property",
        addressLine1: "12 Task Twelve St",
        city: "Providence",
        state: "RI",
        postalCode: "02903",
      },
    });
    propertyId = created.data?.data?.property?.id;
    out.steps.createProperty = { ok: created.ok, propertyId };
  }

  if (!propertyId) {
    out.error = "no property available";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  // Ensure membership
  await admin.from("organization_members").upsert(
    { organization_id: primaryOrg.id, user_id: userId, role: "member" },
    { onConflict: "organization_id,user_id" },
  );

  let unitTypes = await api("GET", `/api/properties/${propertyId}/unit-types`);
  let unitTypeId = unitTypes.data?.data?.unitTypes?.[0]?.id;
  if (!unitTypeId) {
    const ut = await api("POST", `/api/properties/${propertyId}/unit-types`, {
      json: { label: "2BR-T12", beds: 2, baths: 1 },
    });
    unitTypeId = ut.data?.data?.unitType?.id;
    out.steps.createUnitType = { ok: ut.ok, unitTypeId };
  }

  const unitNumber = `T12-${Date.now().toString().slice(-6)}`;
  const createUnit = await api("POST", `/api/properties/${propertyId}/units`, {
    json: {
      unitTypeId,
      unitNumber,
      sqft: 910,
      askingRent: 1995,
      status: "available",
      availableDate: "2026-12-01",
      notes: "task12 e2e",
    },
  });
  const unitId = createUnit.data?.data?.unit?.id;
  out.steps.createUnit = { ok: createUnit.ok, unitId, status: createUnit.status };

  const patchUnit = unitId
    ? await api("PATCH", `/api/units/${unitId}`, {
        json: { askingRent: 2010, sqft: 915 },
      })
    : { ok: false };
  out.steps.patchUnit = { ok: patchUnit.ok };

  const listUnits = await api("GET", `/api/properties/${propertyId}/units`);
  const found = (listUnits.data?.data?.units ?? []).find((u) => u.id === unitId);
  out.steps.listUnits = {
    ok: listUnits.ok,
    found: Boolean(found),
    askingRent: found?.askingRent ?? null,
    incomplete: found?.incomplete ?? null,
  };

  // Photo upload + crop
  const fd = new FormData();
  fd.set(
    "file",
    new Blob([tinyJpeg()], { type: "image/jpeg" }),
    "task12-subject.jpg",
  );
  fd.set("source", "upload");
  fd.set(
    "cropMetadata",
    JSON.stringify({ aspect: "3:2", x: 0.05, y: 0.1, width: 0.9, height: 0.6 }),
  );
  const upload = await api("POST", `/api/properties/${propertyId}/photos`, {
    formData: fd,
  });
  const photoId = upload.data?.data?.photo?.id;
  out.steps.uploadPhoto = {
    ok: upload.ok,
    photoId,
    hasPublicUrl: Boolean(upload.data?.data?.photo?.publicUrl),
  };

  const cropPatch = photoId
    ? await api("PATCH", `/api/photos/${photoId}`, {
        json: {
          cropMetadata: { aspect: "3:2", x: 0.1, y: 0.1, width: 0.8, height: 0.533 },
          sortOrder: 0,
        },
      })
    : { ok: false };
  out.steps.cropPhoto = { ok: cropPatch.ok };

  const photos = await api("GET", `/api/properties/${propertyId}/photos`);
  const photoRow = (photos.data?.data?.photos ?? []).find((p) => p.id === photoId);
  out.steps.listPhotos = {
    ok: photos.ok,
    found: Boolean(photoRow),
    hasSignedUrl: Boolean(photoRow?.signedUrl),
    signedIsHttp: typeof photoRow?.signedUrl === "string",
    cropSaved: Boolean(photoRow?.crop_metadata?.width),
  };

  const reuse = photoId
    ? await api("POST", `/api/properties/${propertyId}/photos/reuse`, {
        json: { sourcePhotoId: photoId },
      })
    : { ok: false };
  out.steps.reusePhoto = { ok: reuse.ok, id: reuse.data?.data?.photo?.id ?? null };

  // Property facts patch
  const facts = await api("PATCH", `/api/properties/${propertyId}`, {
    json: {
      stories: 3,
      yearBuilt: 1988,
      amenities: ["Laundry", "Parking"],
      externalLinks: {
        zillow: "https://www.zillow.com/example-task12",
        propertyNotes: "Task12 manual note",
      },
    },
  });
  out.steps.propertyFacts = { ok: facts.ok };

  // Report assembly includes units/photos when a report exists
  const reports = await api("GET", `/api/properties/${propertyId}/reports`);
  let reportId = reports.data?.data?.reports?.[0]?.id;
  if (!reportId && unitTypeId) {
    const createdReport = await api("POST", `/api/properties/${propertyId}/reports`, {
      json: {
        unitTypeId,
        title: `Task12 assemble check ${new Date().toISOString().slice(0, 10)}`,
        periodStart: "2026-11-10",
        periodEnd: "2026-11-17",
      },
    });
    reportId = createdReport.data?.data?.report?.id;
    out.steps.createReport = { ok: createdReport.ok, reportId };
  }
  if (reportId) {
    const assembled = await api("GET", `/api/reports/${reportId}/assemble`);
    const pdfStatus = await api("GET", `/api/reports/${reportId}/pdf`);
    const payload = assembled.data?.data?.payload ?? assembled.data?.data;
    out.steps.reportAssemble = {
      ok: assembled.ok,
      availableUnitCount: payload?.availableUnits?.length ?? null,
      subjectPhotoCount: payload?.property?.photoPaths?.length ?? null,
      photoRecordCount: payload?.property?.photos?.length ?? null,
      warnings: payload?.quality?.warnings ?? null,
    };
    out.steps.reportPdfStatus = {
      ok: pdfStatus.ok,
      warnings: pdfStatus.data?.data?.finalization?.warnings ?? null,
      blockers: pdfStatus.data?.data?.finalization?.blockers ?? null,
    };
  } else {
    out.steps.reportAssemble = { skipped: true, reason: "no report run" };
    out.steps.reportPdfStatus = { skipped: true, reason: "no report run on property" };
  }

  // Cross-tenant denial
  const otherEmail = `task12-other-${Date.now()}@example.com`;
  const otherPass = `T12-${Math.random().toString(36).slice(2)}A1!`;
  const { data: otherUser, error: otherErr } = await admin.auth.admin.createUser({
    email: otherEmail,
    password: otherPass,
    email_confirm: true,
  });
  out.steps.crossTenantPrep = { ok: !otherErr, error: otherErr?.message ?? null };

  if (otherUser?.user) {
    const otherJar = new Map();
    const otherAuth = createServerClient(URL, ANON, {
      cookies: {
        getAll() {
          return [...otherJar.entries()].map(([name, value]) => ({ name, value }));
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            if (!value) otherJar.delete(name);
            else otherJar.set(name, value);
          }
        },
      },
    });
    await otherAuth.auth.signInWithPassword({ email: otherEmail, password: otherPass });
    const otherHeaders = {
      Cookie: [...otherJar.entries()].map(([n, v]) => `${n}=${v}`).join("; "),
    };
    const deniedUnit = await fetch(`${BASE}/api/properties/${propertyId}/units`, {
      headers: otherHeaders,
    }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
    const deniedPhoto = await fetch(`${BASE}/api/properties/${propertyId}/photos`, {
      headers: otherHeaders,
    }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
    out.steps.crossTenantDenied = {
      unitsStatus: deniedUnit.status,
      photosStatus: deniedPhoto.status,
      unitsDenied: deniedUnit.status === 403 || deniedUnit.status === 404,
      photosDenied: deniedPhoto.status === 403 || deniedPhoto.status === 404,
    };
    await admin.auth.admin.deleteUser(otherUser.user.id);
  }

  // Org switch visibility: compare property counts across orgs via /api/me
  const emptyOrg = orgs.find((o) => (o.propertyCount ?? 0) === 0 && o.id !== primaryOrg.id);
  if (emptyOrg) {
    const emptyList = await api(
      "GET",
      `/api/properties?organizationId=${emptyOrg.id}`,
    );
    out.steps.orgSwitchList = {
      emptyOrgId: emptyOrg.id,
      emptyCount: emptyList.data?.data?.properties?.length ?? 0,
      primaryCount: propsList.data?.data?.properties?.length ?? 0,
      listsDiffer:
        (emptyList.data?.data?.properties?.length ?? 0) !==
        (propsList.data?.data?.properties?.length ?? 0),
    };
  } else {
    out.steps.orgSwitchList = { skipped: true, reason: "no empty secondary org" };
  }

  // Cleanup created unit (keep property/photos for inspection unless flagged)
  if (unitId) {
    const del = await api("DELETE", `/api/units/${unitId}`);
    out.steps.deleteUnit = { ok: del.ok };
  }

  const critical = [
    out.steps.me?.ok,
    out.steps.createUnit?.ok,
    out.steps.patchUnit?.ok,
    out.steps.listUnits?.found,
    out.steps.uploadPhoto?.ok,
    out.steps.cropPhoto?.ok,
    out.steps.listPhotos?.hasSignedUrl,
    out.steps.reusePhoto?.ok,
    out.steps.propertyFacts?.ok,
    out.steps.crossTenantDenied?.unitsDenied,
    out.steps.crossTenantDenied?.photosDenied,
    out.steps.reportAssemble?.ok,
    (out.steps.reportAssemble?.subjectPhotoCount ?? 0) > 0,
  ];
  out.status = critical.every(Boolean) ? "pass" : "partial";
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.status === "pass" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
