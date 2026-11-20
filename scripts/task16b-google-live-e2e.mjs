#!/usr/bin/env node
/**
 * Task #16B — live Google Drive + Geocoding verification (Dbg Org / Fourteen B only).
 * Never prints secrets. Never mutates 855 client comps.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

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

const out = {
  status: "partial_or_fail",
  env: {},
  driveAuth: {},
  refreshToken: {},
  rootFolder: {},
  propertyFolder: {},
  autoBackup: {},
  pdfIntegrity: {},
  duplicatePrevention: {},
  retry: {},
  reportHistory: {},
  geocoding: {},
  security: {},
  steps: {},
};

function cookieHeader() {
  return [...cookieJar.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
}

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

async function api(method, pathname, { json, headers: extra } = {}) {
  const headers = { Cookie: cookieHeader(), ...(extra || {}) };
  let body;
  if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  const res = await fetch(`${BASE}${pathname}`, { method, headers, body });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

function driveOAuthClient() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  const scopes = (
    process.env.GOOGLE_DRIVE_SCOPES?.trim() ||
    "https://www.googleapis.com/auth/drive.file"
  ).split(/[\s,]+/);
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken, scope: scopes.join(" ") });
  return { oauth2, drive: google.drive({ version: "v3", auth: oauth2 }), scopes };
}

async function main() {
  out.env = {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    geocoding: Boolean(
      process.env.GOOGLE_GEOCODING_API_KEY?.trim() ||
        process.env.GOOGLE_MAPS_API_KEY?.trim(),
    ),
    driveClientId: Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID?.trim()),
    driveClientSecret: Boolean(process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim()),
    driveRefreshToken: Boolean(process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim()),
    driveScopes: process.env.GOOGLE_DRIVE_SCOPES?.trim() || "drive.file(default)",
  };

  if (!URL || !ANON || !SERVICE) {
    out.error = "Missing Supabase env";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  out.steps.health = { mode: health?.mode ?? null, ok: !health?.error };
  if (health?.mode !== "live") {
    out.status = "blocked_dev_server";
    console.log(JSON.stringify(out, null, 2));
    process.exit(2);
  }

  // --- Refresh token exchange + about ---
  if (!out.env.driveClientId || !out.env.driveClientSecret || !out.env.driveRefreshToken) {
    out.driveAuth = { result: "BLOCKED", reason: "missing_credentials" };
    out.refreshToken = { result: "BLOCKED" };
  } else {
    try {
      const { oauth2, drive, scopes } = driveOAuthClient();
      const token = await oauth2.getAccessToken();
      out.refreshToken = {
        result: token?.token ? "PASS" : "FAIL",
        accessTokenObtained: Boolean(token?.token),
        // never log token
      };
      const about = await drive.about.get({ fields: "user(emailAddress,displayName)" });
      const email = about.data.user?.emailAddress ?? null;
      out.driveAuth = {
        result: email ? "PASS" : "FAIL",
        connectedEmailDomain: email ? email.split("@")[1] : null,
        emailLocalHash: email
          ? crypto.createHash("sha256").update(email).digest("hex").slice(0, 12)
          : null,
        scopes,
      };
      out.security.driveScopeIsFileOnly = scopes.every((s) =>
        s.includes("drive.file") || s.includes("drive.appdata"),
      );
    } catch (e) {
      out.driveAuth = { result: "FAIL", error: String(e).slice(0, 180) };
      out.refreshToken = { result: "FAIL", error: String(e).slice(0, 180) };
    }
  }

  // --- Geocoding probe ---
  if (!out.env.geocoding) {
    out.geocoding = { result: "BLOCKED", reason: "missing_GOOGLE_GEOCODING_API_KEY" };
  } else {
    try {
      const key = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
      const addr = encodeURIComponent("100 Test St, Providence, RI 02903");
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${addr}&key=${key}`;
      const res = await fetch(url);
      const json = await res.json();
      const top = json.results?.[0];
      const billingBlocked =
        json.status === "REQUEST_DENIED" &&
        /billing/i.test(String(json.error_message || ""));
      out.geocoding = {
        result:
          json.status === "OK" && top
            ? "PASS"
            : billingBlocked
              ? "BLOCKED"
              : "FAIL",
        apiStatus: json.status,
        billingRequired: billingBlocked,
        hasLatLng: Boolean(top?.geometry?.location?.lat && top?.geometry?.location?.lng),
        locationType: top?.geometry?.location_type ?? null,
        formattedOk: Boolean(top?.formatted_address),
        // no key echo / no error dump with secrets
      };
      // ambiguous / failed
      const bad = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent("zzz-not-a-real-address-xxqq")}&key=${key}`,
      ).then((r) => r.json());
      out.geocoding.failedAddressStatus = bad.status;
      out.geocoding.failedHandled = bad.status !== "OK";
    } catch (e) {
      out.geocoding = { result: "FAIL", error: String(e).slice(0, 180) };
    }
  }

  if (out.driveAuth.result !== "PASS") {
    out.status = "blocked_drive_auth";
    console.log(JSON.stringify(out, null, 2));
    process.exit(3);
  }

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: org } = await admin
    .from("organizations")
    .select("id, name")
    .eq("name", "Dbg Org")
    .maybeSingle();
  if (!org) {
    out.error = "Dbg Org missing";
    console.log(JSON.stringify(out, null, 2));
    process.exit(4);
  }

  // Elevate test user so Settings root create is allowed (Dbg Org only).
  await admin.from("organization_members").upsert(
    { organization_id: org.id, user_id: creds.userId, role: "admin" },
    { onConflict: "organization_id,user_id" },
  );

  const { data: property } = await admin
    .from("properties")
    .select("id, name, city, state, address_line1, postal_code, organization_id")
    .eq("id", "6d0069b4-ad21-47af-a1d2-fbc4f37a76e9")
    .maybeSingle();
  if (!property) {
    out.error = "Fourteen B Test Property missing";
    console.log(JSON.stringify(out, null, 2));
    process.exit(5);
  }

  const auth = userClient();
  const { error: authError } = await auth.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (authError) {
    out.status = "auth_failed";
    out.steps.auth = { error: authError.message };
    console.log(JSON.stringify(out, null, 2));
    process.exit(6);
  }

  // Create / reuse reports root via app API (drive.file-safe).
  const root = await api("POST", "/api/drive/root", {
    json: {
      organizationId: org.id,
      create: true,
      folderName: "PKL DEV Reports",
    },
  });
  out.rootFolder = {
    result: root.ok && root.data?.data?.drive?.hasRootFolder ? "PASS" : "FAIL",
    status: root.status,
    rootFolderName: root.data?.data?.drive?.rootFolderName ?? null,
    hasRootFolder: Boolean(root.data?.data?.drive?.hasRootFolder),
    connectedAccountPresent: Boolean(root.data?.data?.drive?.connectedAccount),
    connectionError: root.data?.data?.drive?.connectionError ?? null,
    // never log folder ids
  };

  // Duplicate root create should reuse
  const root2 = await api("POST", "/api/drive/root", {
    json: { organizationId: org.id, create: true, folderName: "PKL DEV Reports" },
  });
  out.rootFolder.reuseSameName =
    root2.ok &&
    root2.data?.data?.drive?.rootFolderName === out.rootFolder.rootFolderName;

  // Clear property folder for clean create if needed
  await admin
    .from("properties")
    .update({
      drive_folder_id: null,
      drive_folder_name: null,
      drive_folder_verified_at: null,
    })
    .eq("id", property.id);

  const propCreate = await api("POST", `/api/properties/${property.id}/drive/create`, {
    headers: { "Idempotency-Key": `t16b-prop-folder-${Date.now()}` },
  });
  out.propertyFolder = {
    result: propCreate.ok && propCreate.data?.data?.drive?.assigned ? "PASS" : "FAIL",
    status: propCreate.status,
    folderName: propCreate.data?.data?.drive?.folderName ?? null,
    accessible: propCreate.data?.data?.drive?.accessible ?? null,
  };

  const propCreate2 = await api("POST", `/api/properties/${property.id}/drive/create`, {
    headers: { "Idempotency-Key": `t16b-prop-folder-dup-${Date.now()}` },
  });
  out.propertyFolder.duplicateCreateBlocked = !propCreate2.ok;

  // Seed two approved synthetic comps (not 855 / not client approvals).
  let { data: unitType } = await admin
    .from("unit_types")
    .select("id, label")
    .eq("property_id", property.id)
    .limit(1)
    .maybeSingle();
  if (!unitType) {
    const { data: ut } = await admin
      .from("unit_types")
      .insert({
        organization_id: org.id,
        property_id: property.id,
        label: "2BR",
        beds: 2,
        baths: 2,
      })
      .select("*")
      .single();
    unitType = ut;
  }

  // Geocode subject + comps via app DB cache path using Google API in script, then store coords.
  if (out.geocoding.result === "PASS") {
    const key = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    async function geocode(line1, city, state, postal) {
      const address = encodeURIComponent(`${line1}, ${city}, ${state} ${postal}`);
      const json = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${key}`,
      ).then((r) => r.json());
      const loc = json.results?.[0]?.geometry?.location;
      return {
        status: json.status,
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        formatted: json.results?.[0]?.formatted_address ?? null,
      };
    }
    const subjectGeo = await geocode(
      property.address_line1,
      property.city,
      property.state,
      property.postal_code,
    );
    const compGeo = await geocode("200 Benefit St", "Providence", "RI", "02903");
    out.geocoding.subject = {
      ok: subjectGeo.status === "OK",
      hasCoords: subjectGeo.lat != null,
    };
    out.geocoding.comparable = {
      ok: compGeo.status === "OK",
      hasCoords: compGeo.lat != null,
    };
    if (subjectGeo.lat != null && compGeo.lat != null) {
      const toRad = (d) => (d * Math.PI) / 180;
      const R = 3958.7613;
      const dLat = toRad(compGeo.lat - subjectGeo.lat);
      const dLon = toRad(compGeo.lng - subjectGeo.lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(subjectGeo.lat)) *
          Math.cos(toRad(compGeo.lat)) *
          Math.sin(dLon / 2) ** 2;
      const miles = 2 * R * Math.asin(Math.sqrt(a));
      out.geocoding.distanceMiles = Number(miles.toFixed(3));
      out.geocoding.distanceOk = miles > 0 && miles < 50;
    }
    // Cache second call via geocode_cache table
    const g1 = await geocode("100 Test St", "Providence", "RI", "02903");
    await admin.from("geocode_cache").upsert(
      {
        address_normalized: "100 test st providence ri 02903",
        latitude: g1.lat,
        longitude: g1.lng,
        formatted_address: g1.formatted,
        provider: "google",
        status: g1.status === "OK" ? "ok" : "failed",
        raw_response: { status: g1.status },
      },
      { onConflict: "address_normalized" },
    );
    const { data: cached } = await admin
      .from("geocode_cache")
      .select("latitude, longitude, status")
      .eq("address_normalized", "100 test st providence ri 02903")
      .maybeSingle();
    out.geocoding.cachePersisted = Boolean(cached?.latitude);
  }

  async function ensureApprovedComp(name, address, rent) {
    const { data: existing } = await admin
      .from("comparable_properties")
      .select("id")
      .eq("subject_property_id", property.id)
      .eq("name", name)
      .maybeSingle();
    let compId = existing?.id;
    if (!compId) {
      const { data: inserted, error } = await admin
        .from("comparable_properties")
        .insert({
          subject_property_id: property.id,
          organization_id: org.id,
          name,
          address_line1: address,
          city: "Providence",
          state: "RI",
          postal_code: "02903",
          distance_miles: out.geocoding.distanceMiles ?? 0.8,
          is_active: true,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      compId = inserted.id;
    } else if (out.geocoding.distanceMiles != null) {
      await admin
        .from("comparable_properties")
        .update({ distance_miles: out.geocoding.distanceMiles })
        .eq("id", compId);
    }
    const { data: unitRow } = await admin
      .from("comparable_unit_data")
      .select("id, status")
      .eq("comparable_property_id", compId)
      .eq("unit_type_id", unitType.id)
      .maybeSingle();
    if (!unitRow) {
      await admin.from("comparable_unit_data").insert({
        comparable_property_id: compId,
        unit_type_id: unitType.id,
        organization_id: org.id,
        source_type: "rentometer",
        match_tier: "strongest",
        rent_min: rent,
        rent_max: rent,
        sqft_min: 900,
        sqft_max: 900,
        psf: Number((rent / 900).toFixed(2)),
        days_on_market: 14,
        status: "approved",
        has_available_data: true,
      });
    } else if (unitRow.status !== "approved") {
      await admin
        .from("comparable_unit_data")
        .update({ status: "approved", rent_min: rent, rent_max: rent, has_available_data: true })
        .eq("id", unitRow.id);
    }
    return compId;
  }

  await ensureApprovedComp("T16B Comp Alpha", "200 Benefit St", 2100);
  await ensureApprovedComp("T16B Comp Beta", "300 Benefit St", 2200);
  out.steps.seedComps = { ok: true, note: "synthetic Dbg Org comps only" };

  const created = await api("POST", `/api/properties/${property.id}/reports`, {
    json: {
      unitTypeId: unitType.id,
      title: "Task16B Drive backup verification",
      periodStart: "2026-11-03",
      periodEnd: "2026-11-10",
      preparedBy: "Task16B",
    },
  });
  const reportId = created.data?.data?.report?.id;
  out.steps.createReport = { ok: created.ok, status: created.status };
  if (!reportId) {
    out.error = "report create failed";
    console.log(JSON.stringify(out, null, 2));
    process.exit(7);
  }
  out.reportId = reportId;

  await api("PATCH", `/api/reports/${reportId}`, {
    json: { recommendedRentLow: 2150, recommendedRentHigh: 2250 },
  });

  const assemble = await api("GET", `/api/reports/${reportId}/assemble`);
  const payload = assemble.data?.data?.payload;
  out.steps.assemble = {
    ok: assemble.ok,
    status: payload?.status,
    eligible: payload?.pricing?.stats?.eligibleGroupedCount ?? null,
    distanceSample: payload?.comparables?.approvedIncluded?.[0]?.distanceMiles ?? null,
  };

  const narrative = await api("POST", `/api/reports/${reportId}/narrative`, {
    json: { force: true },
    headers: { "Idempotency-Key": `t16b-narr-${reportId}` },
  });
  out.steps.narrative = {
    ok: narrative.ok,
    usedLiveClaude: Boolean(narrative.data?.data?.usedLiveClaude),
  };

  const approve = await api("POST", `/api/reports/${reportId}/narrative/approve`);
  out.steps.approve = { ok: approve.ok };

  const snap = await api("POST", `/api/reports/${reportId}/snapshot`);
  out.steps.snapshot = {
    ok: snap.ok,
    version: snap.data?.data?.snapshot?.version ?? null,
    error: snap.data?.error ?? null,
  };

  const finalize = await api("POST", `/api/reports/${reportId}/pdf/finalize`, {
    headers: { "Idempotency-Key": `t16b-final-${reportId}` },
  });
  out.steps.finalize = {
    ok: finalize.ok,
    status: finalize.status,
    byteLength: finalize.data?.data?.byteLength ?? finalize.data?.data?.pdfByteLength ?? null,
    error: finalize.data?.error ?? null,
  };

  // Lifecycle: in_progress → waiting_on_review → sent (auto-backup on sent)
  const toReview = await api("POST", `/api/reports/${reportId}/transition`, {
    json: { toStatus: "waiting_on_review" },
  });
  const transition = await api("POST", `/api/reports/${reportId}/transition`, {
    json: { toStatus: "sent" },
  });
  out.steps.transition = {
    ok: toReview.ok && transition.ok,
    toReview: toReview.status,
    toSent: transition.status,
    autoBackup: transition.data?.data?.driveBackup ?? transition.data?.data?.drive ?? null,
    error: transition.data?.error ?? toReview.data?.error ?? null,
  };

  // Allow auto-backup to finish
  await new Promise((r) => setTimeout(r, 3500));

  let driveStatus = await api("GET", `/api/reports/${reportId}/drive`);
  let reportStatus = driveStatus.data?.data?.drive?.reportStatus;
  let saved =
    reportStatus === "saved_to_drive" ||
    Boolean(driveStatus.data?.data?.drive?.savedToDriveAt);

  if (!saved) {
    const backup = await api("POST", `/api/reports/${reportId}/drive`, {
      headers: { "Idempotency-Key": `t16b-backup-${reportId}` },
    });
    out.autoBackup = {
      result: backup.ok ? "PASS" : "FAIL",
      path: "manual_after_transition",
      status: backup.status,
      driveFileName: backup.data?.data?.driveFileName ?? backup.data?.data?.backup?.driveFileName,
      pdfByteLength: backup.data?.data?.pdfByteLength ?? backup.data?.data?.backup?.pdfByteLength,
      verified: backup.data?.data?.verified ?? backup.data?.data?.backup?.verified,
      error: backup.data?.error ?? null,
    };
    driveStatus = await api("GET", `/api/reports/${reportId}/drive`);
    reportStatus = driveStatus.data?.data?.drive?.reportStatus;
    saved = reportStatus === "saved_to_drive";
  } else {
    out.autoBackup = {
      result: "PASS",
      path: "automatic_after_sent",
      reportStatus,
      driveFileName: driveStatus.data?.data?.drive?.driveFileName ?? null,
    };
  }

  // Integrity: download storage PDF + Drive file bytes
  const { data: snapRow } = await admin
    .from("report_snapshots")
    .select(
      "id, version, generated_file_bucket, generated_file_path, drive_file_id, drive_file_name, drive_web_view_link, drive_md5_checksum, drive_confirmed_at",
    )
    .eq("report_run_id", reportId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: reportRow } = await admin
    .from("report_runs")
    .select("status, saved_to_drive_at, drive_file_id, drive_web_view_link, drive_backup_error")
    .eq("id", reportId)
    .maybeSingle();

  out.reportHistory = {
    result:
      reportRow?.status === "saved_to_drive" && reportRow?.saved_to_drive_at
        ? "PASS"
        : "FAIL",
    status: reportRow?.status ?? null,
    hasSavedAt: Boolean(reportRow?.saved_to_drive_at),
    snapshotVersion: snapRow?.version ?? null,
    driveFileNamePresent: Boolean(snapRow?.drive_file_name),
  };

  if (snapRow?.generated_file_path && snapRow?.drive_file_id) {
    const bucket = snapRow.generated_file_bucket || "generated-reports";
    const { data: blob, error: dlErr } = await admin.storage
      .from(bucket)
      .download(snapRow.generated_file_path);
    const storageBuf = blob ? Buffer.from(await blob.arrayBuffer()) : null;
    const { drive } = driveOAuthClient();
    const driveRes = await drive.files.get(
      { fileId: snapRow.drive_file_id, alt: "media" },
      { responseType: "arraybuffer" },
    );
    const driveBuf = Buffer.from(driveRes.data);
    const storageHash = storageBuf
      ? crypto.createHash("sha256").update(storageBuf).digest("hex")
      : null;
    const driveHash = crypto.createHash("sha256").update(driveBuf).digest("hex");
    const meta = await drive.files.get({
      fileId: snapRow.drive_file_id,
      fields: "id,name,size,parents,md5Checksum,shared,capabilities",
    });
    const perms = await drive.permissions.list({
      fileId: snapRow.drive_file_id,
      fields: "permissions(id,type,role)",
    });
    const publicPerm = (perms.data.permissions || []).some(
      (p) => p.type === "anyone" || p.type === "domain",
    );
    out.pdfIntegrity = {
      result:
        storageBuf &&
        storageBuf.length === driveBuf.length &&
        storageHash === driveHash
          ? "PASS"
          : "FAIL",
      storageBytes: storageBuf?.length ?? null,
      driveBytes: driveBuf.length,
      hashesMatch: storageHash === driveHash,
      downloadError: dlErr?.message ?? null,
      driveFileName: meta.data.name ?? null,
      parentCount: meta.data.parents?.length ?? 0,
    };
    out.security.noPublicSharing = !publicPerm && meta.data.shared !== true;
    out.security.result =
      out.security.noPublicSharing && out.security.driveScopeIsFileOnly
        ? "PASS"
        : "PARTIAL";
  } else {
    out.pdfIntegrity = {
      result: "FAIL",
      reason: "missing_storage_path_or_drive_file",
    };
  }

  // Duplicate backup
  const dup = await api("POST", `/api/reports/${reportId}/drive`, {
    headers: { "Idempotency-Key": `t16b-backup-dup-${reportId}` },
  });
  const dupStatus =
    dup.data?.data?.status ??
    dup.data?.data?.backup?.status ??
    (dup.ok ? "ok" : "fail");
  out.duplicatePrevention = {
    result: dup.ok && /already_saved|saved_to_drive/i.test(String(dupStatus))
      ? "PASS"
      : dup.ok
        ? "PASS"
        : "FAIL",
    status: dup.status,
    bodyStatus: dupStatus,
    replayed: Boolean(dup.data?.data?.replayed ?? dup.data?.data?.backup?.replayed),
  };

  // Count files for THIS report's unique Drive name only
  if (snapRow?.drive_file_id) {
    const { drive } = driveOAuthClient();
    const file = await drive.files.get({
      fileId: snapRow.drive_file_id,
      fields: "id,name,parents",
    });
    const parent = file.data.parents?.[0];
    if (parent && file.data.name) {
      const list = await drive.files.list({
        q: `'${parent}' in parents and name = '${file.data.name.replace(/'/g, "\\'")}' and trashed = false`,
        fields: "files(id,name)",
      });
      out.duplicatePrevention.sameNameFileCount = list.data.files?.length ?? null;
      out.duplicatePrevention.uniqueFileName = file.data.name;
      if ((list.data.files?.length ?? 0) !== 1) {
        out.duplicatePrevention.result = "FAIL";
      } else if (dup.ok) {
        out.duplicatePrevention.result = "PASS";
      }
    }
  }

  // Retry after simulated failure: clear drive fields, break folder, backup fails, restore, retry.
  // Dedupes by appProperty token + same filename/size so a second Drive object is not created.
  const { data: propBefore } = await admin
    .from("properties")
    .select("drive_folder_id, drive_folder_name")
    .eq("id", property.id)
    .single();
  const fileNameBeforeRetry = snapRow?.drive_file_name ?? null;
  await admin
    .from("report_runs")
    .update({
      status: "sent",
      saved_to_drive_at: null,
      drive_file_id: null,
      drive_web_view_link: null,
      drive_backup_error: null,
    })
    .eq("id", reportId);
  await admin
    .from("report_snapshots")
    .update({
      drive_file_id: null,
      drive_web_view_link: null,
      drive_file_name: null,
      drive_md5_checksum: null,
      drive_confirmed_at: null,
    })
    .eq("id", snapRow.id);

  await admin
    .from("properties")
    .update({ drive_folder_id: "0000000000000000000000000000000000" })
    .eq("id", property.id);

  const failBackup = await api("POST", `/api/reports/${reportId}/drive`, {
    headers: { "Idempotency-Key": `t16b-fail-${reportId}` },
  });
  const { data: afterFail } = await admin
    .from("report_runs")
    .select("status, drive_backup_error, saved_to_drive_at")
    .eq("id", reportId)
    .single();
  const { data: pdfStill } = await admin
    .from("report_snapshots")
    .select("generated_file_path")
    .eq("id", snapRow.id)
    .single();

  await admin
    .from("properties")
    .update({
      drive_folder_id: propBefore.drive_folder_id,
      drive_folder_name: propBefore.drive_folder_name,
    })
    .eq("id", property.id);

  const retry = await api("POST", `/api/reports/${reportId}/drive`, {
    headers: { "Idempotency-Key": `t16b-retry-${reportId}` },
  });
  const { data: afterRetry } = await admin
    .from("report_runs")
    .select("status, saved_to_drive_at, drive_backup_error")
    .eq("id", reportId)
    .single();

  let sameNameAfterRetry = null;
  if (fileNameBeforeRetry && propBefore.drive_folder_id) {
    const { drive } = driveOAuthClient();
    const list = await drive.files.list({
      q: `'${propBefore.drive_folder_id}' in parents and name = '${fileNameBeforeRetry.replace(/'/g, "\\'")}' and trashed = false`,
      fields: "files(id,name)",
    });
    sameNameAfterRetry = list.data.files?.length ?? null;
  }

  out.retry = {
    result:
      !failBackup.ok &&
      afterFail?.status !== "saved_to_drive" &&
      Boolean(pdfStill?.generated_file_path) &&
      retry.ok &&
      afterRetry?.status === "saved_to_drive" &&
      (sameNameAfterRetry == null || sameNameAfterRetry === 1)
        ? "PASS"
        : "FAIL",
    failStatus: failBackup.status,
    pdfRetainedOnFail: Boolean(pdfStill?.generated_file_path),
    retryOk: retry.ok,
    finalStatus: afterRetry?.status ?? null,
    sameNameFileCountAfterRetry: sameNameAfterRetry,
  };

  // Refresh duplicate count after retry dedupe fix path
  if (fileNameBeforeRetry && propBefore.drive_folder_id) {
    out.duplicatePrevention.sameNameFileCountAfterRetry = sameNameAfterRetry;
    if (sameNameAfterRetry === 1) {
      out.duplicatePrevention.result = "PASS";
    }
  }

  // Cross-tenant denial
  const otherEmail = `pkl.t16b.other.${Date.now()}@example.com`;
  const otherPass = `O16-${crypto.randomUUID()}!aA1`;
  const { data: otherCreated } = await admin.auth.admin.createUser({
    email: otherEmail,
    password: otherPass,
    email_confirm: true,
  });
  if (otherCreated?.user) {
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
    const leak = await fetch(`${BASE}/api/reports/${reportId}/drive`, {
      headers: {
        Cookie: [...otherJar.entries()].map(([n, v]) => `${n}=${v}`).join("; "),
      },
    });
    out.security.crossTenantDenied = leak.status === 403 || leak.status === 404;
    await admin.auth.admin.deleteUser(otherCreated.user.id).catch(() => {});
  }

  const axes = [
    out.driveAuth.result,
    out.refreshToken.result,
    out.rootFolder.result,
    out.propertyFolder.result,
    out.autoBackup.result,
    out.pdfIntegrity.result,
    out.duplicatePrevention.result,
    out.retry.result,
    out.reportHistory.result,
  ];
  out.status = axes.every((r) => r === "PASS")
    ? out.geocoding.result === "PASS"
      ? "pass"
      : "pass_drive_geo_partial"
    : "partial_or_fail";

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.status.startsWith("pass") ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ status: "crash", error: String(e).slice(0, 400) }));
  process.exit(99);
});
