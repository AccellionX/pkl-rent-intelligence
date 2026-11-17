import { requirePropertyAccess } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Read-only listing of property-level comparable buildings and optional unit-type data.
 * Comp membership is at the property level so unit-type reports share the same buildings.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    await requirePropertyAccess(supabase, user, propertyId);

    const unitTypeId = new URL(request.url).searchParams.get("unitTypeId");

    const { data: comps, error } = await supabase
      .from("comparable_properties")
      .select("*")
      .eq("subject_property_id", propertyId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      throw validationError("Failed to list comparables", error.message);
    }

    const comparableIds = (comps ?? []).map((c) => c.id);
    let unitData: unknown[] = [];

    if (comparableIds.length > 0) {
      let query = supabase
        .from("comparable_unit_data")
        .select("*")
        .in("comparable_property_id", comparableIds);

      if (unitTypeId) {
        query = query.eq("unit_type_id", unitTypeId);
      }

      const { data, error: unitError } = await query;
      if (unitError) {
        throw validationError("Failed to list comparable unit data", unitError.message);
      }
      unitData = data ?? [];
    }

    return jsonOk({
      comparables: comps ?? [],
      unitData,
    });
  } catch (error) {
    return jsonError(error);
  }
}
