import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { runIdempotent } from "@/lib/api/idempotency";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { ApiError, notFoundError, validationError } from "@/lib/api/errors";
import {
  narrativeEditSchema,
  narrativeGenerateSchema,
} from "@/lib/reports/narrative-schema";
import {
  editNarrativeForReport,
  generateNarrativeForReport,
} from "@/lib/reports/narrative-workflow";
import { isLiveMode } from "@/lib/supabase/env";

type RouteContext = { params: Promise<{ id: string }> };

async function loadReportOrg(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  reportId: string,
) {
  const { data, error } = await supabase
    .from("report_runs")
    .select("id, organization_id, status")
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw validationError("Failed to load report", error.message);
  if (!data) throw notFoundError("Report not found");
  return data as { id: string; organization_id: string; status: string };
}

/** Generate or regenerate Claude/deterministic narrative draft. */
export async function POST(request: Request, context: RouteContext) {
  try {
    if (!isLiveMode()) throw validationError("This action isn't available right now. Please try again later.");
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    const reportRef = await loadReportOrg(supabase, id);
    await requireOrgMembership(supabase, user, reportRef.organization_id);

    const body = await parseJsonBody(request, narrativeGenerateSchema);
    const outcome = await runIdempotent({
      request,
      organizationId: reportRef.organization_id,
      userId: user.id,
      route: `POST /api/reports/${id}/narrative`,
      supabase,
      defaultStatus: 200,
      execute: async () => {
        const result = await generateNarrativeForReport({
          supabase,
          reportId: id,
          userId: user.id,
          preserveUserEdits: body.preserveUserEdits,
          force: body.force,
        });
        return {
          data: {
            report: result.report,
            narrative: result.document,
            assemblyStatus: result.assembled.status,
            stale: result.assembled.narrative.stale,
            usedLiveClaude: result.usedLiveClaude,
            // Metrics only — never include prompt/report body content.
            claudeUsage: result.claudeUsage,
          },
          status: 200,
        };
      },
    });

    return jsonOk(outcome.data, { status: outcome.status });
  } catch (error) {
    if (error instanceof Error && !(error instanceof ApiError)) {
      return jsonError(validationError(error.message));
    }
    return jsonError(error);
  }
}

/** Edit narrative sections without calling Claude. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    if (!isLiveMode()) throw validationError("This action isn't available right now. Please try again later.");
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    const reportRef = await loadReportOrg(supabase, id);
    await requireOrgMembership(supabase, user, reportRef.organization_id);

    const body = await parseJsonBody(request, narrativeEditSchema);
    const result = await editNarrativeForReport({
      supabase,
      reportId: id,
      userId: user.id,
      sections: body.sections,
    });

    return jsonOk({
      report: result.report,
      narrative: result.document,
      stale: result.stale,
      note: "User edits saved; AI output did not overwrite these fields",
    });
  } catch (error) {
    if (error instanceof Error && !(error instanceof ApiError)) {
      return jsonError(validationError(error.message));
    }
    return jsonError(error);
  }
}
