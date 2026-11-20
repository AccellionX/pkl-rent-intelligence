import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";
import { computeApprovedCompStats } from "@/lib/calculations";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Draft KPIs from approved + eligible comparable unit data.
 * Does not mutate report recommendation low/high or finalized snapshots.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();

    const { data: report, error } = await supabase
      .from("report_runs")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw validationError("Failed to load report", error.message);
    if (!report) throw notFoundError("Report not found");

    await requireOrgMembership(supabase, user, report.organization_id);

    const { data: pendingConflicts } = await supabase
      .from("source_value_conflicts")
      .select("id, comparable_property_id, status")
      .eq("property_id", report.property_id)
      .eq("status", "pending");

    const blockedCompIds = new Set(
      (pendingConflicts ?? [])
        .map((c) => c.comparable_property_id)
        .filter((v): v is string => Boolean(v)),
    );

    const { data: unitData, error: unitError } = await supabase
      .from("comparable_unit_data")
      .select("*, comparable_properties(id, address_line1, city, state, distance_miles)")
      .eq("organization_id", report.organization_id)
      .eq("unit_type_id", report.unit_type_id)
      .eq("status", "approved");

    if (unitError) {
      throw validationError("Failed to load approved comps", unitError.message);
    }

    const rows = (unitData ?? []).map((row) => {
      const comp = row.comparable_properties as
        | {
            id: string;
            address_line1: string;
            city: string;
            state: string;
            distance_miles: number | null;
          }
        | null;
      const hasConflict = blockedCompIds.has(row.comparable_property_id);
      return {
        comparablePropertyId: row.comparable_property_id,
        addressKey: comp
          ? `${comp.address_line1}, ${comp.city}, ${comp.state}`.toLowerCase()
          : row.comparable_property_id,
        buildingKey: row.comparable_property_id,
        unitTypeKey: report.unit_type_id,
        source: row.source_type,
        rentMin: row.rent_min,
        rentMax: row.rent_max,
        sqftMin: row.sqft_min,
        sqftMax: row.sqft_max,
        psf: row.psf,
        daysOnMarket: row.days_on_market,
        distanceMiles: comp?.distance_miles ?? null,
        matchTier: row.match_tier,
        hasAvailableData: row.has_available_data,
        eligibleForStats: !hasConflict,
      };
    });

    const missingUnitTypeComps = (unitData ?? []).filter((r) => !r.has_available_data);

    const stats = computeApprovedCompStats(rows);

    return jsonOk({
      reportId: report.id,
      unitTypeId: report.unit_type_id,
      pendingConflictCount: pendingConflicts?.length ?? 0,
      missingUnitTypeCount: missingUnitTypeComps.length,
      missingUnitTypeMessage:
        missingUnitTypeComps.length > 0
          ? `No unit-type data available for ${missingUnitTypeComps.length} approved building(s)`
          : null,
      recommendationNote:
        "Manual recommendedRentLow/High remain user-owned and are not replaced by these draft KPIs",
      snapshotNote: "Finalized report_snapshots are immutable and unchanged by draft stats",
      stats,
      rows,
    });
  } catch (error) {
    return jsonError(error);
  }
}
