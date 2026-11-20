import type { Database } from "@/domain/database.types";
import { transitionReportRunSchema } from "@/domain/schemas";
import type { ReportRunStatus } from "@/domain/types";
import { assertReportStatusTransition } from "@/domain/report-status";
import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { conflictError, notFoundError, validationError } from "@/lib/api/errors";
import { attemptAutomaticDriveBackup } from "@/lib/google-drive/auto-backup";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    const body = await parseJsonBody(request, transitionReportRunSchema);

    const { data: report, error } = await supabase
      .from("report_runs")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw validationError("Failed to load report", error.message);
    }
    if (!report) {
      throw notFoundError("Report not found");
    }

    await requireOrgMembership(supabase, user, report.organization_id);

    // Saved to Drive is only set after Google Drive confirms upload.
    if (body.toStatus === "saved_to_drive") {
      throw validationError(
        "Save the finalized PDF to Google Drive from the report workspace. Status cannot be set to Saved to Drive manually.",
      );
    }

    try {
      assertReportStatusTransition(
        report.status as ReportRunStatus,
        body.toStatus,
      );
    } catch (transitionError) {
      throw conflictError(
        transitionError instanceof Error
          ? transitionError.message
          : "Invalid status transition",
      );
    }

    const patch: Database["public"]["Tables"]["report_runs"]["Update"] = {
      status: body.toStatus,
    };
    if (body.toStatus === "sent") {
      patch.sent_at = new Date().toISOString();
    }

    const { data, error: updateError } = await supabase
      .from("report_runs")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      throw validationError("Failed to transition report", updateError.message);
    }

    let driveBackup:
      | { attempted: false; reason: string }
      | { attempted: true; ok: true; status: string; driveFileName?: string }
      | { attempted: true; ok: false; message: string }
      | null = null;

    // Completing a report with a stored final PDF triggers best-effort Drive backup.
    if (body.toStatus === "sent") {
      const auto = await attemptAutomaticDriveBackup({
        supabase,
        reportId: id,
      });
      if (!auto.attempted) {
        driveBackup = { attempted: false, reason: auto.reason };
      } else if (auto.ok) {
        driveBackup = {
          attempted: true,
          ok: true,
          status: auto.backup.status,
          driveFileName: auto.backup.driveFileName,
        };
      } else {
        driveBackup = { attempted: true, ok: false, message: auto.message };
      }

      // Refresh report row if backup advanced status.
      if (driveBackup.attempted && driveBackup.ok) {
        const { data: refreshed } = await supabase
          .from("report_runs")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        return jsonOk({ report: refreshed ?? data, driveBackup });
      }
    }

    return jsonOk({ report: data, driveBackup });
  } catch (error) {
    return jsonError(error);
  }
}
