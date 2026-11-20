import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";
import { approveNarrativeAndLockSnapshot } from "@/lib/reports/narrative-workflow";
import { isLiveMode } from "@/lib/supabase/env";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    if (!isLiveMode()) throw validationError("This action isn't available right now. Please try again later.");
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();

    const { data: reportRef, error } = await supabase
      .from("report_runs")
      .select("id, organization_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw validationError("Failed to load report", error.message);
    if (!reportRef) throw notFoundError("Report not found");

    await requireOrgMembership(supabase, user, reportRef.organization_id);
    const result = await approveNarrativeAndLockSnapshot({
      supabase,
      reportId: id,
      userId: user.id,
    });

    return jsonOk({
      report: result.report,
      narrative: result.narrative,
      snapshot: {
        id: result.snapshot.id,
        version: result.snapshot.version,
        reused: result.reusedSnapshot,
      },
      note: result.reusedSnapshot
        ? "Narrative already approved; existing snapshot reused"
        : "Narrative approved and snapshot locked for the final PDF",
    });
  } catch (error) {
    return jsonError(error);
  }
}
