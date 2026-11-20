import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domain/database.types";
import { conflictError, validationError } from "@/lib/api/errors";
import { assertReportStatusTransition } from "@/domain/report-status";
import type { ReportRunStatus } from "@/domain/types";
import { GENERATED_REPORTS_BUCKET } from "@/lib/pdf/storage";
import { getGoogleDrivePort } from "@/lib/google-drive/client";
import { mapGoogleDriveError } from "@/lib/google-drive/errors";
import {
  buildFinalizedDriveFileName,
  driveFileViewUrl,
} from "@/lib/google-drive/naming";
import type { GoogleDrivePort } from "@/lib/google-drive/types";

type Client = SupabaseClient<Database>;

export type DriveBackupResult = {
  status: "saved_to_drive" | "already_saved";
  reportId: string;
  snapshotId: string;
  version: number;
  driveFileId: string;
  driveFileName: string;
  driveWebViewLink: string;
  folderId: string;
  folderName: string | null;
  savedToDriveAt: string;
  pdfByteLength: number;
  verified: boolean;
  replayed: boolean;
};

export type ReportDriveStatus = {
  reportStatus: string;
  canBackup: boolean;
  blockers: string[];
  savedToDriveAt: string | null;
  driveFileId: string | null;
  driveWebViewLink: string | null;
  driveBackupError: string | null;
  driveFileName: string | null;
  finalPdfStored: boolean;
  snapshotVersion: number | null;
  propertyFolderName: string | null;
  propertyFolderAssigned: boolean;
};

export async function getReportDriveStatus(
  supabase: Client,
  reportId: string,
): Promise<ReportDriveStatus> {
  const { data: report, error } = await supabase
    .from("report_runs")
    .select(
      "id, status, property_id, saved_to_drive_at, drive_file_id, drive_web_view_link, drive_backup_error",
    )
    .eq("id", reportId)
    .maybeSingle();

  let reportRow = report;
  if (error && /drive_file_id|drive_web_view_link|drive_backup_error/i.test(error.message)) {
    const { data, error: fbErr } = await supabase
      .from("report_runs")
      .select("id, status, property_id, saved_to_drive_at")
      .eq("id", reportId)
      .maybeSingle();
    if (fbErr || !data) throw validationError("Could not load report.");
    reportRow = {
      ...data,
      drive_file_id: null,
      drive_web_view_link: null,
      drive_backup_error: null,
    };
  } else if (error || !reportRow) {
    throw validationError("Could not load report.");
  }

  const { data: property } = await supabase
    .from("properties")
    .select("drive_folder_id, drive_folder_name")
    .eq("id", reportRow.property_id)
    .maybeSingle();

  const { data: snapshots } = await supabase
    .from("report_snapshots")
    .select(
      "version, generated_file_path, drive_file_id, drive_confirmed_at, drive_web_view_link, drive_file_name",
    )
    .eq("report_run_id", reportId)
    .order("version", { ascending: false })
    .limit(1);

  const snapshot = snapshots?.[0];
  const finalPdfStored = Boolean(
    snapshot?.generated_file_path && /\/final-v\d+/i.test(snapshot.generated_file_path),
  );
  const propertyFolderAssigned = Boolean(property?.drive_folder_id);

  const blockers: string[] = [];
  if (!propertyFolderAssigned) {
    blockers.push("Assign a Google Drive folder to this property first.");
  }
  if (!finalPdfStored) {
    blockers.push("Store the final PDF before saving to Drive.");
  }
  if (reportRow.status !== "sent" && reportRow.status !== "saved_to_drive") {
    blockers.push("Mark the report as finalized before saving to Drive.");
  }

  return {
    reportStatus: reportRow.status,
    canBackup: blockers.length === 0 && reportRow.status !== "saved_to_drive",
    blockers,
    savedToDriveAt: reportRow.saved_to_drive_at ?? snapshot?.drive_confirmed_at ?? null,
    driveFileId: snapshot?.drive_file_id ?? reportRow.drive_file_id,
    driveWebViewLink: snapshot?.drive_web_view_link ?? reportRow.drive_web_view_link,
    driveBackupError: reportRow.drive_backup_error,
    driveFileName: snapshot?.drive_file_name ?? null,
    finalPdfStored,
    snapshotVersion: snapshot?.version ?? null,
    propertyFolderName: property?.drive_folder_name ?? null,
    propertyFolderAssigned,
  };
}

/**
 * Durable backup identity: report/snapshot identity + content hash.
 * Filename and byte length alone are insufficient — identical size with
 * different PDF bytes must produce a distinct token.
 */
export function backupToken(opts: {
  organizationId: string;
  reportRunId: string;
  snapshotId: string;
  version: number;
  storagePath: string;
  byteLength: number;
  /** SHA-256 hex of finalized PDF bytes (required for content identity). */
  contentSha256: string;
}): string {
  return createHash("sha256")
    .update(
      [
        opts.organizationId,
        opts.reportRunId,
        opts.snapshotId,
        String(opts.version),
        opts.storagePath,
        String(opts.byteLength),
        opts.contentSha256,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 40);
}

async function downloadFinalPdf(
  supabase: Client,
  bucket: string,
  path: string,
): Promise<Uint8Array> {
  if (bucket !== GENERATED_REPORTS_BUCKET) {
    throw validationError("Unexpected PDF storage location.");
  }
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw validationError(
      "Could not read the finalized PDF from private storage. Try again or regenerate the final PDF.",
    );
  }
  const buf = new Uint8Array(await data.arrayBuffer());
  if (buf.byteLength < 100) {
    throw validationError("Finalized PDF appears incomplete.");
  }
  // PDF magic
  const head = String.fromCharCode(...buf.slice(0, 5));
  if (!head.startsWith("%PDF")) {
    throw validationError("Stored final file is not a valid PDF.");
  }
  return buf;
}

async function recordBackupFailure(
  supabase: Client,
  reportId: string,
  message: string,
): Promise<void> {
  const patch: Database["public"]["Tables"]["report_runs"]["Update"] = {
    drive_backup_error: message.slice(0, 2000),
  };
  const { error } = await supabase.from("report_runs").update(patch).eq("id", reportId);
  if (error && /drive_backup_error/i.test(error.message)) {
    // Column not migrated yet — keep finalized PDF; failure surfaces via API only.
    return;
  }
}

/**
 * Upload the immutable finalized PDF to the property Drive folder.
 * Never uploads drafts. Marks saved_to_drive only after Drive confirms.
 */
export async function backupFinalizedReportToDrive(opts: {
  supabase: Client;
  reportId: string;
  drive?: GoogleDrivePort;
}): Promise<DriveBackupResult> {
  const { data: report, error: reportErr } = await opts.supabase
    .from("report_runs")
    .select(
      "id, organization_id, property_id, unit_type_id, title, status, period_end, saved_to_drive_at, drive_file_id, drive_web_view_link",
    )
    .eq("id", opts.reportId)
    .maybeSingle();

  // Fallback select if new columns absent.
  let reportRow = report;
  if (reportErr && /drive_file_id|drive_web_view_link/i.test(reportErr.message)) {
    const { data, error } = await opts.supabase
      .from("report_runs")
      .select(
        "id, organization_id, property_id, unit_type_id, title, status, period_end, saved_to_drive_at",
      )
      .eq("id", opts.reportId)
      .maybeSingle();
    if (error || !data) throw validationError("Could not load report.");
    reportRow = {
      ...data,
      drive_file_id: null,
      drive_web_view_link: null,
    };
  } else if (reportErr || !reportRow) {
    throw validationError("Could not load report.");
  }

  const { data: property, error: propErr } = await opts.supabase
    .from("properties")
    .select("id, name, drive_folder_id, drive_folder_name")
    .eq("id", reportRow.property_id)
    .maybeSingle();

  let propertyRow = property;
  if (propErr && /drive_folder_name/i.test(propErr.message)) {
    const { data, error } = await opts.supabase
      .from("properties")
      .select("id, name, drive_folder_id")
      .eq("id", reportRow.property_id)
      .maybeSingle();
    if (error || !data) throw validationError("Could not load property.");
    propertyRow = { ...data, drive_folder_name: null };
  } else if (propErr || !propertyRow) {
    throw validationError("Could not load property.");
  }

  if (!propertyRow.drive_folder_id) {
    throw validationError(
      "Assign a Google Drive folder to this property before saving the report to Drive.",
    );
  }

  const { data: unitType } = await opts.supabase
    .from("unit_types")
    .select("label")
    .eq("id", reportRow.unit_type_id)
    .maybeSingle();

  const { data: snapshots, error: snapErr } = await opts.supabase
    .from("report_snapshots")
    .select(
      "id, version, generated_file_bucket, generated_file_path, drive_file_id, drive_confirmed_at, drive_web_view_link, drive_file_name",
    )
    .eq("report_run_id", opts.reportId)
    .order("version", { ascending: false })
    .limit(1);

  let snapshot = snapshots?.[0];
  if (snapErr && /drive_web_view_link|drive_file_name/i.test(snapErr.message)) {
    const { data, error } = await opts.supabase
      .from("report_snapshots")
      .select(
        "id, version, generated_file_bucket, generated_file_path, drive_file_id, drive_confirmed_at",
      )
      .eq("report_run_id", opts.reportId)
      .order("version", { ascending: false })
      .limit(1);
    if (error) throw validationError("Could not load the finalized snapshot.");
    snapshot = data?.[0]
      ? { ...data[0], drive_web_view_link: null, drive_file_name: null }
      : undefined;
  } else if (snapErr) {
    throw validationError("Could not load the finalized snapshot.");
  }

  if (!snapshot) {
    throw validationError(
      "No immutable snapshot found. Approve the narrative and create a snapshot first.",
    );
  }
  if (!snapshot.generated_file_path) {
    throw validationError(
      "Final PDF has not been stored yet. Store the final PDF before saving to Drive.",
    );
  }

  // Idempotent success path — never re-upload or overwrite.
  if (
    reportRow.status === "saved_to_drive" &&
    (snapshot.drive_file_id || reportRow.drive_file_id)
  ) {
    const fileId = snapshot.drive_file_id ?? reportRow.drive_file_id!;
    return {
      status: "already_saved",
      reportId: reportRow.id,
      snapshotId: snapshot.id,
      version: snapshot.version,
      driveFileId: fileId,
      driveFileName: snapshot.drive_file_name ?? "Finalized report.pdf",
      driveWebViewLink:
        snapshot.drive_web_view_link ??
        reportRow.drive_web_view_link ??
        driveFileViewUrl(fileId),
      folderId: propertyRow.drive_folder_id,
      folderName: propertyRow.drive_folder_name,
      savedToDriveAt:
        snapshot.drive_confirmed_at ??
        reportRow.saved_to_drive_at ??
        new Date().toISOString(),
      pdfByteLength: 0,
      verified: true,
      replayed: true,
    };
  }

  if (reportRow.status !== "sent" && reportRow.status !== "saved_to_drive") {
    throw validationError(
      "Mark the report as finalized before saving it to Google Drive.",
      { requiredStatus: "sent", currentStatus: reportRow.status },
    );
  }

  // Reject draft-only paths: require final storage path naming convention.
  if (!/\/final-v\d+/i.test(snapshot.generated_file_path)) {
    throw validationError(
      "Only finalized PDFs can be saved to Drive. Draft files are not uploaded.",
    );
  }

  const bytes = await downloadFinalPdf(
    opts.supabase,
    snapshot.generated_file_bucket ?? GENERATED_REPORTS_BUCKET,
    snapshot.generated_file_path,
  );

  const fileName = buildFinalizedDriveFileName({
    propertyName: propertyRow.name,
    unitTypeLabel: unitType?.label ?? "Unit type",
    periodEnd: reportRow.period_end,
    version: snapshot.version,
    reportId: reportRow.id,
  });

  const contentSha256 = createHash("sha256").update(bytes).digest("hex");
  const token = backupToken({
    organizationId: reportRow.organization_id,
    reportRunId: reportRow.id,
    snapshotId: snapshot.id,
    version: snapshot.version,
    storagePath: snapshot.generated_file_path,
    byteLength: bytes.byteLength,
    contentSha256,
  });

  const port = opts.drive ?? getGoogleDrivePort();

  let upload;
  try {
    // Confirm folder still accessible.
    const folder = await port.getFolder(propertyRow.drive_folder_id);
    if (folder.trashed) {
      throw validationError(
        "The property Drive folder is in the trash. Assign a different folder and retry.",
      );
    }

    upload = await port.uploadPdf({
      folderId: propertyRow.drive_folder_id,
      fileName,
      bytes,
      idempotencyToken: token,
    });

    if (!upload.verified) {
      throw validationError(
        "Drive upload completed but the file could not be verified. Retry the backup.",
      );
    }
  } catch (error) {
    const mapped = mapGoogleDriveError(
      error,
      "Could not save the finalized PDF to Google Drive.",
    );
    await recordBackupFailure(opts.supabase, reportRow.id, mapped.message);
    throw mapped;
  }

  const confirmedAt = new Date().toISOString();
  const webViewLink = upload.webViewLink ?? driveFileViewUrl(upload.id);

  const snapUpdate: Database["public"]["Tables"]["report_snapshots"]["Update"] = {
    drive_file_id: upload.id,
    drive_confirmed_at: confirmedAt,
    drive_web_view_link: webViewLink,
    drive_file_name: upload.name,
    drive_md5_checksum: upload.md5Checksum ?? null,
  };

  const { error: snapUpdateErr } = await opts.supabase
    .from("report_snapshots")
    .update(snapUpdate)
    .eq("id", snapshot.id);

  if (snapUpdateErr && /drive_web_view_link|drive_file_name|drive_md5/i.test(snapUpdateErr.message)) {
    const { error } = await opts.supabase
      .from("report_snapshots")
      .update({
        drive_file_id: upload.id,
        drive_confirmed_at: confirmedAt,
      })
      .eq("id", snapshot.id);
    if (error) {
      // Drive file exists — do not leave report unmarked; still try report_runs update.
      console.error(
        "[drive-backup] snapshot drive fields update failed after successful upload",
      );
    }
  } else if (snapUpdateErr) {
    console.error(
      "[drive-backup] snapshot update failed after successful upload",
      snapUpdateErr.message,
    );
  }

  if (reportRow.status === "sent") {
    try {
      assertReportStatusTransition(
        reportRow.status as ReportRunStatus,
        "saved_to_drive",
      );
    } catch {
      throw conflictError("Report cannot transition to Saved to Drive from its current status.");
    }
  }

  const reportUpdate: Database["public"]["Tables"]["report_runs"]["Update"] = {
    status: "saved_to_drive",
    saved_to_drive_at: confirmedAt,
    drive_file_id: upload.id,
    drive_web_view_link: webViewLink,
    drive_backup_error: null,
    notes: `Saved to Drive: ${upload.name}`.slice(0, 5000),
  };

  const { error: reportUpdateErr } = await opts.supabase
    .from("report_runs")
    .update(reportUpdate)
    .eq("id", reportRow.id);

  if (
    reportUpdateErr &&
    /drive_file_id|drive_web_view_link|drive_backup_error/i.test(reportUpdateErr.message)
  ) {
    const { error } = await opts.supabase
      .from("report_runs")
      .update({
        status: "saved_to_drive",
        saved_to_drive_at: confirmedAt,
        notes: `Saved to Drive: ${upload.name}`.slice(0, 5000),
      })
      .eq("id", reportRow.id);
    if (error) {
      throw validationError(
        "Drive upload succeeded but report status could not be updated. Contact support — do not re-upload.",
        { driveFileId: upload.id },
      );
    }
  } else if (reportUpdateErr) {
    throw validationError(
      "Drive upload succeeded but report status could not be updated. Contact support — do not re-upload.",
      { driveFileId: upload.id },
    );
  }

  return {
    status: "saved_to_drive",
    reportId: reportRow.id,
    snapshotId: snapshot.id,
    version: snapshot.version,
    driveFileId: upload.id,
    driveFileName: upload.name,
    driveWebViewLink: webViewLink,
    folderId: propertyRow.drive_folder_id,
    folderName: propertyRow.drive_folder_name,
    savedToDriveAt: confirmedAt,
    pdfByteLength: bytes.byteLength,
    verified: upload.verified,
    replayed: !upload.created,
  };
}
