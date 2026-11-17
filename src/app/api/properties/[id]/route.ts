import type { Database, Json } from "@/domain/database.types";
import { updatePropertySchema } from "@/domain/schemas";
import { requirePropertyAccess } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { omitUndefined } from "@/lib/api/object";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    await requirePropertyAccess(supabase, user, id);

    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw validationError("Failed to load property", error.message);
    }
    if (!data) {
      throw notFoundError("Property not found");
    }

    return jsonOk({ property: data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    await requirePropertyAccess(supabase, user, id);
    const body = await parseJsonBody(request, updatePropertySchema);

    const patch = omitUndefined({
      name: body.name,
      marketing_name: body.marketingName,
      address_line1: body.addressLine1,
      address_line2: body.addressLine2,
      city: body.city,
      state: body.state,
      postal_code: body.postalCode,
      country: body.country,
      latitude: body.latitude,
      longitude: body.longitude,
      year_built: body.yearBuilt,
      stories: body.stories,
      unit_count: body.unitCount,
      amenities: body.amenities,
      external_links:
        body.externalLinks === undefined
          ? undefined
          : (body.externalLinks as Json),
    }) as Database["public"]["Tables"]["properties"]["Update"];

    const { data, error } = await supabase
      .from("properties")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw validationError("Failed to update property", error.message);
    }

    return jsonOk({ property: data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    await requirePropertyAccess(supabase, user, id);

    const { error } = await supabase.from("properties").delete().eq("id", id);
    if (error) {
      throw validationError("Failed to delete property", error.message);
    }

    return jsonOk({ deleted: true, id });
  } catch (error) {
    return jsonError(error);
  }
}
