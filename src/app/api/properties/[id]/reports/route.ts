import { createReportRunSchema } from "@/domain/schemas";
import { requirePropertyAccess } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    await requirePropertyAccess(supabase, user, propertyId);

    const { data, error } = await supabase
      .from("report_runs")
      .select("*")
      .eq("property_id", propertyId)
      .order("period_start", { ascending: false });

    if (error) {
      throw validationError("Failed to list report runs", error.message);
    }

    return jsonOk({ reports: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    const access = await requirePropertyAccess(supabase, user, propertyId);
    const body = await parseJsonBody(request, createReportRunSchema);

    const { data: unitType, error: unitTypeError } = await supabase
      .from("unit_types")
      .select("id, property_id, organization_id")
      .eq("id", body.unitTypeId)
      .maybeSingle();

    if (unitTypeError) {
      throw validationError("Failed to validate unit type", unitTypeError.message);
    }
    if (!unitType || unitType.property_id !== propertyId) {
      throw notFoundError("Unit type not found on this property");
    }
    if (unitType.organization_id !== access.organizationId) {
      throw notFoundError("Unit type not found on this property");
    }

    const { data, error } = await supabase
      .from("report_runs")
      .insert({
        organization_id: access.organizationId,
        property_id: propertyId,
        unit_type_id: body.unitTypeId,
        title: body.title,
        period_start: body.periodStart,
        period_end: body.periodEnd,
        prepared_by: body.preparedBy ?? null,
        notes: body.notes ?? null,
        created_by: user.id,
        status: "in_progress",
      })
      .select("*")
      .single();

    if (error) {
      throw validationError("Failed to create report run", error.message);
    }

    return jsonOk({ report: data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
