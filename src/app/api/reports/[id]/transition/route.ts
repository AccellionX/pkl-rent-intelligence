import type { Database } from "@/domain/database.types";
import { transitionReportRunSchema } from "@/domain/schemas";
import type { ReportRunStatus } from "@/domain/types";
import { assertReportStatusTransition } from "@/domain/report-status";
import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { conflictError, notFoundError, validationError } from "@/lib/api/errors";

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
    if (body.toStatus === "saved_to_drive") {
      patch.saved_to_drive_at = new Date().toISOString();
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

    return jsonOk({ report: data });
  } catch (error) {
    return jsonError(error);
  }
}
