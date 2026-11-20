import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";
import { assembleReportPayload } from "@/lib/reports/assemble";
import { isLiveMode } from "@/lib/supabase/env";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    if (!isLiveMode()) {
      throw validationError("This action isn't available right now. Please try again later.");
    }
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
    const payload = await assembleReportPayload(supabase, id);
    return jsonOk({ payload });
  } catch (error) {
    return jsonError(error);
  }
}
