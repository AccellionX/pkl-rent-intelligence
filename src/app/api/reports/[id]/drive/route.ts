import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { runIdempotent } from "@/lib/api/idempotency";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";
import {
  backupFinalizedReportToDrive,
  getReportDriveStatus,
} from "@/lib/google-drive/backup";
import { isLiveMode } from "@/lib/supabase/env";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    if (!isLiveMode()) throw validationError("This action isn't available right now. Please try again later.");
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();

    const { data: report, error } = await supabase
      .from("report_runs")
      .select("id, organization_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw validationError("Failed to load report", error.message);
    if (!report) throw notFoundError("Report not found");
    await requireOrgMembership(supabase, user, report.organization_id);

    const status = await getReportDriveStatus(supabase, id);
    return jsonOk({
      drive: {
        reportStatus: status.reportStatus,
        canBackup: status.canBackup,
        blockers: status.blockers,
        savedToDriveAt: status.savedToDriveAt,
        driveWebViewLink: status.driveWebViewLink,
        driveBackupError: status.driveBackupError,
        driveFileName: status.driveFileName,
        finalPdfStored: status.finalPdfStored,
        snapshotVersion: status.snapshotVersion,
        propertyFolderName: status.propertyFolderName,
        propertyFolderAssigned: status.propertyFolderAssigned,
        // Never expose raw Drive file ids in the UI payload.
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Upload the finalized private PDF to the property Drive folder.
 * Marks Saved to Drive only after Google confirms. Idempotent.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    if (!isLiveMode()) throw validationError("This action isn't available right now. Please try again later.");
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();

    const { data: report, error } = await supabase
      .from("report_runs")
      .select("id, organization_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw validationError("Failed to load report", error.message);
    if (!report) throw notFoundError("Report not found");
    await requireOrgMembership(supabase, user, report.organization_id);

    const result = await runIdempotent({
      request,
      organizationId: report.organization_id,
      userId: user.id,
      route: `POST /api/reports/${id}/drive`,
      supabase,
      execute: async () => {
        const backup = await backupFinalizedReportToDrive({
          supabase,
          reportId: id,
        });
        return {
          data: {
            backup: {
              status: backup.status,
              version: backup.version,
              driveFileName: backup.driveFileName,
              driveWebViewLink: backup.driveWebViewLink,
              folderName: backup.folderName,
              savedToDriveAt: backup.savedToDriveAt,
              verified: backup.verified,
              replayed: backup.replayed,
              pdfByteLength: backup.pdfByteLength,
            },
          },
          status: backup.replayed || backup.status === "already_saved" ? 200 : 201,
        };
      },
    });

    return jsonOk(result.data, { status: result.status });
  } catch (error) {
    return jsonError(error);
  }
}
