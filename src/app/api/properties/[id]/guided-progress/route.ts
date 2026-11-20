import { requirePropertyAccess } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { validationError } from "@/lib/api/errors";
import { parseNarrativeDocument } from "@/lib/reports/narrative-document";
import { weekOverlapsReportPeriod } from "@/lib/reports/weekly-period";
import type { GuidedWorkflowSignals } from "@/lib/reports/guided-workflow";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    const access = await requirePropertyAccess(supabase, user, propertyId);

    const url = new URL(request.url);
    const reportId = url.searchParams.get("reportId");
    const unitTypeIdParam = url.searchParams.get("unitTypeId");

    const { data: property, error: propErr } = await supabase
      .from("properties")
      .select("id, name, marketing_name, drive_folder_id")
      .eq("id", propertyId)
      .single();
    if (propErr || !property) {
      throw validationError("Property not found", propErr?.message);
    }

    let reportQuery = supabase
      .from("report_runs")
      .select(
        "id, title, status, unit_type_id, period_start, period_end, recommended_rent_low, recommended_rent_high, narrative_draft, saved_to_drive_at, drive_file_id",
      )
      .eq("property_id", propertyId)
      .order("period_start", { ascending: false })
      .limit(1);

    if (reportId) {
      reportQuery = supabase
        .from("report_runs")
        .select(
          "id, title, status, unit_type_id, period_start, period_end, recommended_rent_low, recommended_rent_high, narrative_draft, saved_to_drive_at, drive_file_id",
        )
        .eq("property_id", propertyId)
        .eq("id", reportId)
        .limit(1);
    } else if (unitTypeIdParam) {
      reportQuery = reportQuery.eq("unit_type_id", unitTypeIdParam);
    }

    const { data: reports } = await reportQuery;
    const report = reports?.[0] ?? null;

    let unitTypeLabel: string | null = null;
    if (report?.unit_type_id) {
      const { data: ut } = await supabase
        .from("unit_types")
        .select("label")
        .eq("id", report.unit_type_id)
        .maybeSingle();
      unitTypeLabel = ut?.label ?? null;
    }

    const periodStart = report?.period_start ?? null;
    const periodEnd = report?.period_end ?? null;

    const { count: documentCount } = await supabase
      .from("source_documents")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .is("superseded_by", null)
      .neq("parse_status", "failed");

    // Pending comparable candidates only (not market metrics / weekly summaries).
    const { data: pendingExtractionRows } = await supabase
      .from("extracted_values")
      .select("id, field_key, source_document_id, source_documents!inner(property_id)")
      .eq("source_documents.property_id", propertyId)
      .eq("review_status", "pending");

    const pendingComparableReviews = (pendingExtractionRows ?? []).filter((e) => {
      const key = e.field_key ?? "";
      return (
        key.startsWith("candidate.") ||
        key.startsWith("hellodata.comp.") ||
        key.startsWith("mls.listing.")
      );
    }).length;

    const { count: pendingConflicts } = await supabase
      .from("source_value_conflicts")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("status", "pending");

    const { count: subjectPhotos } = await supabase
      .from("report_photos")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .is("comparable_property_id", null)
      .neq("source", "mls");

    const { data: unitRows } = await supabase
      .from("comparable_unit_data")
      .select("id, status, unit_type_id, comparable_properties!inner(subject_property_id)")
      .eq("organization_id", access.organizationId)
      .eq("comparable_properties.subject_property_id", propertyId)
      .eq("status", "approved");

    const includedComparableCount = (unitRows ?? []).filter((row) =>
      report?.unit_type_id ? row.unit_type_id === report.unit_type_id : true,
    ).length;

    const { data: weeklyRows } = await supabase
      .from("weekly_metrics")
      .select("week_start, week_end")
      .eq("property_id", propertyId);

    const hasPeriodWeeklyData =
      Boolean(periodStart && periodEnd) &&
      (weeklyRows ?? []).some((w) =>
        weekOverlapsReportPeriod(
          { weekStart: w.week_start, weekEnd: w.week_end },
          periodStart!,
          periodEnd!,
        ),
      );

    const narrative = parseNarrativeDocument(report?.narrative_draft);
    const narrativeApproved = narrative?.status === "approved";
    const narrativeStale = narrative?.status === "stale";

    const { count: compsWithPhotos } = await supabase
      .from("report_photos")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .not("comparable_property_id", "is", null);

    let finalPdfReady = false;
    if (report?.id) {
      const { data: snapshots } = await supabase
        .from("report_snapshots")
        .select("id, generated_file_path")
        .eq("report_run_id", report.id)
        .not("generated_file_path", "is", null)
        .limit(1);
      finalPdfReady = Boolean(snapshots?.[0]?.generated_file_path);
    }

    const signals: GuidedWorkflowSignals = {
      hasReportRun: Boolean(report),
      documentCountForPeriod: documentCount ?? 0,
      pendingComparableReviews,
      pendingConflictCount: pendingConflicts ?? 0,
      subjectPhotoCount: subjectPhotos ?? 0,
      compsWithSelectedPhotos: compsWithPhotos ?? 0,
      includedComparableCount,
      hasPeriodWeeklyData,
      hasRecommendedRange:
        report?.recommended_rent_low != null && report?.recommended_rent_high != null,
      narrativeApproved,
      narrativeStale,
      finalPdfReady,
      driveConfigured: Boolean(property.drive_folder_id),
      driveSaved: Boolean(report?.saved_to_drive_at || report?.drive_file_id),
    };

    return jsonOk({
      signals,
      propertyName: property.marketing_name || property.name,
      unitTypeLabel,
      periodStart,
      periodEnd,
      reportStatus: report?.status ?? null,
      reportId: report?.id ?? null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
