import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";
import { createReportContentSnapshot } from "@/lib/reports/narrative-workflow";
import { isLiveMode } from "@/lib/supabase/env";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Persist an immutable content snapshot for Task #10 PDF rendering.
 * Does not generate PDF bytes.
 */
export async function POST(_request: Request, context: RouteContext) {
  try {
    if (!isLiveMode()) throw validationError("This action isn’t available right now. Please try again later.");
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
    const result = await createReportContentSnapshot({
      supabase,
      reportId: id,
      userId: user.id,
    });

    return jsonOk(
      {
        snapshot: {
          id: result.snapshot.id,
          version: result.snapshot.version,
          reportRunId: result.snapshot.report_run_id,
          createdAt: result.snapshot.created_at,
          reused: result.reused,
        },
        note: result.reused
          ? "Existing locked version reused"
          : "Immutable snapshot stored for final PDF",
      },
      { status: result.reused ? 200 : 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    if (!isLiveMode()) throw validationError("This action isn’t available right now. Please try again later.");
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

    const { data, error: listError } = await supabase
      .from("report_snapshots")
      .select("id, version, created_at, created_by")
      .eq("report_run_id", id)
      .order("version", { ascending: true });
    if (listError) throw validationError("Failed to list snapshots", listError.message);

    return jsonOk({ snapshots: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}
