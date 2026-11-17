import { updateReportRunSchema } from "@/domain/schemas";
import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { omitUndefined } from "@/lib/api/object";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";

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

  if (error) {
    throw validationError("Failed to load report", error.message);
  }
  if (!data) {
    throw notFoundError("Report not found");
  }
  return data as { id: string; organization_id: string; status: string };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    const reportRef = await loadReportOrg(supabase, id);
    await requireOrgMembership(supabase, user, reportRef.organization_id);

    const { data, error } = await supabase
      .from("report_runs")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      throw validationError("Failed to load report", error.message);
    }

    return jsonOk({ report: data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    const reportRef = await loadReportOrg(supabase, id);
    await requireOrgMembership(supabase, user, reportRef.organization_id);

    if (reportRef.status === "saved_to_drive") {
      throw validationError("Finalized reports saved to Drive cannot be edited");
    }

    const body = await parseJsonBody(request, updateReportRunSchema);

    const { data, error } = await supabase
      .from("report_runs")
      .update(
        omitUndefined({
          title: body.title,
          prepared_by: body.preparedBy,
          notes: body.notes,
          recommended_rent_low: body.recommendedRentLow,
          recommended_rent_high: body.recommendedRentHigh,
          narrative_draft: body.narrativeDraft,
          narrative_approved: body.narrativeApproved,
        }),
      )
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw validationError("Failed to update report", error.message);
    }

    return jsonOk({ report: data });
  } catch (error) {
    return jsonError(error);
  }
}
