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

type ReportListRow = {
  id: string;
  title: string;
  status: string;
  property_id: string;
  unit_type_id: string;
  period_start: string;
  period_end: string;
  prepared_by: string | null;
  recommended_rent_low: number | null;
  recommended_rent_high: number | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  saved_to_drive_at: string | null;
  drive_web_view_link: string | null;
  drive_backup_error: string | null;
  properties: { name: string } | null;
};

/** Org-wide report run history (live). */
export async function GET(request: Request) {
  try {
    if (!isLiveMode()) throw validationError("This action isn't available right now. Please try again later.");
    const { supabase, user } = await requireAuth();
    const query = parseSearchParams(new URL(request.url), querySchema);
    await requireOrgMembership(supabase, user, query.organizationId);

    const primary = await supabase
      .from("report_runs")
      .select(
        "id, title, status, property_id, unit_type_id, period_start, period_end, prepared_by, recommended_rent_low, recommended_rent_high, created_at, updated_at, sent_at, saved_to_drive_at, drive_web_view_link, drive_backup_error, properties(name)",
      )
      .eq("organization_id", query.organizationId)
      .order("updated_at", { ascending: false })
      .limit(100);

    let rows: ReportListRow[] = [];
    if (
      primary.error &&
      /drive_web_view_link|drive_backup_error/i.test(primary.error.message)
    ) {
      const fallback = await supabase
        .from("report_runs")
        .select(
          "id, title, status, property_id, unit_type_id, period_start, period_end, prepared_by, recommended_rent_low, recommended_rent_high, created_at, updated_at, sent_at, saved_to_drive_at, properties(name)",
        )
        .eq("organization_id", query.organizationId)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (fallback.error) {
        throw validationError("Failed to list reports", fallback.error.message);
      }
      rows = (fallback.data ?? []).map((r) => ({
        ...(r as Omit<ReportListRow, "drive_web_view_link" | "drive_backup_error" | "properties"> & {
          properties: { name: string } | null;
        }),
        drive_web_view_link: null,
        drive_backup_error: null,
      }));
    } else if (primary.error) {
      throw validationError("Failed to list reports", primary.error.message);
    } else {
      rows = (primary.data ?? []) as unknown as ReportListRow[];
    }

    const unitTypeIds = [
      ...new Set(rows.map((r) => r.unit_type_id).filter(Boolean)),
    ] as string[];
    const labelByUt = new Map<string, string>();
    if (unitTypeIds.length > 0) {
      const { data: uts } = await supabase
        .from("unit_types")
        .select("id, label")
        .in("id", unitTypeIds);
      for (const ut of uts ?? []) labelByUt.set(ut.id, ut.label);
    }

    return jsonOk({
      reports: rows.map((r) => {
        const prop = r.properties;
        return {
          id: r.id,
          title: r.title,
          status: r.status,
          propertyId: r.property_id,
          propertyName: prop?.name ?? "Property",
          unitTypeId: r.unit_type_id,
          unitTypeLabel: labelByUt.get(r.unit_type_id) ?? null,
          periodStart: r.period_start,
          periodEnd: r.period_end,
          preparedBy: r.prepared_by,
          recommendedRentLow: r.recommended_rent_low,
          recommendedRentHigh: r.recommended_rent_high,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          sentAt: r.sent_at,
          savedToDriveAt: r.saved_to_drive_at,
          driveWebViewLink: r.drive_web_view_link,
          driveBackupError: r.drive_backup_error,
        };
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
