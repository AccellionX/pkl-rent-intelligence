import type { Json } from "@/domain/database.types";
import {
  createPropertySchema,
  listPropertiesQuerySchema,
} from "@/domain/schemas";
import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { parseJsonBody, parseSearchParams } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { validationError } from "@/lib/api/errors";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireAuth();
    const query = parseSearchParams(new URL(request.url), listPropertiesQuerySchema);
    await requireOrgMembership(supabase, user, query.organizationId);

    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .eq("organization_id", query.organizationId)
      .order("name", { ascending: true });

    if (error) {
      throw validationError("Failed to list properties", error.message);
    }

    return jsonOk({ properties: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAuth();
    const body = await parseJsonBody(request, createPropertySchema);
    await requireOrgMembership(supabase, user, body.organizationId);

    const { data, error } = await supabase
      .from("properties")
      .insert({
        organization_id: body.organizationId,
        name: body.name,
        marketing_name: body.marketingName ?? null,
        address_line1: body.addressLine1,
        address_line2: body.addressLine2 ?? null,
        city: body.city,
        state: body.state,
        postal_code: body.postalCode,
        country: body.country,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        year_built: body.yearBuilt ?? null,
        stories: body.stories ?? null,
        unit_count: body.unitCount ?? null,
        amenities: body.amenities,
        external_links: body.externalLinks as Json,
      })
      .select("*")
      .single();

    if (error) {
      throw validationError("Failed to create property", error.message);
    }

    return jsonOk({ property: data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
