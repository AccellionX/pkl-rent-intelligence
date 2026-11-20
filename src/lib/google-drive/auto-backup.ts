import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domain/database.types";
import {
  backupFinalizedReportToDrive,
  type DriveBackupResult,
} from "@/lib/google-drive/backup";
import { getGoogleDriveConfig } from "@/lib/google-drive/config";
import type { GoogleDrivePort } from "@/lib/google-drive/types";

type Client = SupabaseClient<Database>;

export type AutoBackupOutcome =
  | { attempted: false; reason: string }
  | {
      attempted: true;
      ok: true;
      backup: DriveBackupResult;
    }
  | {
      attempted: true;
      ok: false;
      message: string;
    };

/**
 * Best-effort Drive backup after a report is completed with a stored final PDF.
 * Never fails the primary finalize/transition operation.
 * Manual retry remains available via POST /api/reports/:id/drive.
 */
export async function attemptAutomaticDriveBackup(opts: {
  supabase: Client;
  reportId: string;
  drive?: GoogleDrivePort;
}): Promise<AutoBackupOutcome> {
  if (!getGoogleDriveConfig().configured) {
    return {
      attempted: false,
      reason: "Google Drive is not connected.",
    };
  }

  const { data: report, error } = await opts.supabase
    .from("report_runs")
    .select("id, status, property_id")
    .eq("id", opts.reportId)
    .maybeSingle();

  if (error || !report) {
    return { attempted: false, reason: "Report unavailable for backup." };
  }

  if (report.status === "saved_to_drive") {
    return { attempted: false, reason: "Already saved to Google Drive." };
  }

  if (report.status !== "sent") {
    return {
      attempted: false,
      reason: "Report must be completed before automatic Drive backup.",
    };
  }

  const { data: property } = await opts.supabase
    .from("properties")
    .select("drive_folder_id")
    .eq("id", report.property_id)
    .maybeSingle();

  if (!property?.drive_folder_id) {
    return {
      attempted: false,
      reason: "No Google Drive folder assigned to this property.",
    };
  }

  const { data: snapshots } = await opts.supabase
    .from("report_snapshots")
    .select("generated_file_path")
    .eq("report_run_id", opts.reportId)
    .order("version", { ascending: false })
    .limit(1);

  const path = snapshots?.[0]?.generated_file_path;
  if (!path || !/\/final-v\d+/i.test(path)) {
    return {
      attempted: false,
      reason: "Final PDF is not stored yet.",
    };
  }

  try {
    const backup = await backupFinalizedReportToDrive({
      supabase: opts.supabase,
      reportId: opts.reportId,
      drive: opts.drive,
    });
    return { attempted: true, ok: true, backup };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not save the finalized PDF to Google Drive.";
    return { attempted: true, ok: false, message };
  }
}
