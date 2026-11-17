import { createUnitTypeSchema } from "@/domain/schemas";
import { requirePropertyAccess } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    await requirePropertyAccess(supabase, user, propertyId);

    const { data, error } = await supabase
      .from("unit_types")
      .select("*")
      .eq("property_id", propertyId)
      .order("beds", { ascending: true })
      .order("label", { ascending: true });

    if (error) {
      throw validationError("Failed to list unit types", error.message);
    }

    return jsonOk({ unitTypes: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    const access = await requirePropertyAccess(supabase, user, propertyId);
    const body = await parseJsonBody(request, createUnitTypeSchema);

    const { data, error } = await supabase
      .from("unit_types")
      .insert({
        property_id: propertyId,
        organization_id: access.organizationId,
        label: body.label,
        beds: body.beds,
        baths: body.baths,
        description: body.description ?? null,
      })
      .select("*")
      .single();

    if (error) {
      throw validationError("Failed to create unit type", error.message);
    }

    return jsonOk({ unitType: data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
