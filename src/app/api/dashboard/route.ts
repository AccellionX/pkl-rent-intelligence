import { z } from "zod";
import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { parseSearchParams } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { validationError } from "@/lib/api/errors";
import { isLiveMode } from "@/lib/supabase/env";

const querySchema = z.object({
  organizationId: z.string().uuid(),
});

/**
 * Org-scoped dashboard KPIs from live tables only.
 * Never fabricates counts.
 */
export async function GET(request: Request) {
  try {
    if (!isLiveMode()) throw validationError("This action isn't available right now. Please try again later.");
    const { supabase, user } = await requireAuth();
    const query = parseSearchParams(new URL(request.url), querySchema);
    await requireOrgMembership(supabase, user, query.organizationId);

    const orgId = query.organizationId;

    const [
      propsRes,
      unitTypesRes,
      reportsRes,
      docsRes,
      recentReportsRes,
    ] = await Promise.all([
      supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
      supabase
        .from("unit_types")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
      supabase
        .from("report_runs")
        .select("id, status", { count: "exact" })
        .eq("organization_id", orgId),
      supabase
        .from("source_documents")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
      supabase
        .from("report_runs")
        .select(
          "id, title, status, property_id, period_start, period_end, updated_at, created_at, properties(name)",
        )
        .eq("organization_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(8),
    ]);

    if (propsRes.error) {
      throw validationError("Failed to count properties", propsRes.error.message);
    }
    if (unitTypesRes.error) {
      throw validationError("Failed to count unit types", unitTypesRes.error.message);
    }
    if (reportsRes.error) {
      throw validationError("Failed to load reports", reportsRes.error.message);
    }
    if (docsRes.error) {
      throw validationError("Failed to count documents", docsRes.error.message);
    }
    if (recentReportsRes.error) {
      throw validationError("Failed to load recent reports", recentReportsRes.error.message);
    }

    const reports = reportsRes.data ?? [];
    const byStatus = {
      in_progress: reports.filter((r) => r.status === "in_progress").length,
      waiting_on_review: reports.filter((r) => r.status === "waiting_on_review").length,
      sent: reports.filter((r) => r.status === "sent").length,
      saved_to_drive: reports.filter((r) => r.status === "saved_to_drive").length,
    };

    return jsonOk({
      organizationId: orgId,
      counts: {
        properties: propsRes.count ?? 0,
        unitTypes: unitTypesRes.count ?? 0,
        reports: reportsRes.count ?? reports.length,
        sourceDocuments: docsRes.count ?? 0,
        draftReports: byStatus.in_progress,
        awaitingReview: byStatus.waiting_on_review,
        finalizedReports: byStatus.sent,
        savedToDrive: byStatus.saved_to_drive,
      },
      recentReports: (recentReportsRes.data ?? []).map((r) => {
        const prop = r.properties as { name: string } | null;
        return {
          id: r.id,
          title: r.title,
          status: r.status,
          propertyId: r.property_id,
          propertyName: prop?.name ?? "Property",
          periodStart: r.period_start,
          periodEnd: r.period_end,
          updatedAt: r.updated_at,
          createdAt: r.created_at,
        };
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
