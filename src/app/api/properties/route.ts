import type { Json } from "@/domain/database.types";
import {
  createPropertySchema,
  listPropertiesQuerySchema,
} from "@/domain/schemas";
import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { runIdempotent } from "@/lib/api/idempotency";
import { parseJsonBody, parseSearchParams } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { conflictError, validationError } from "@/lib/api/errors";
import { addressesLikelyDuplicate } from "@/lib/properties/duplicate-address";

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

    const result = await runIdempotent({
      request,
      organizationId: body.organizationId,
      userId: user.id,
      route: "POST /api/properties",
      supabase,
      fingerprintExtra: [
        body.organizationId,
        body.name,
        body.addressLine1,
        body.city,
        body.state,
        body.postalCode,
        body.confirmDuplicateAddress ?? false,
      ],
      execute: async () => {
        const { data: existing, error: listErr } = await supabase
          .from("properties")
          .select("id, name, address_line1, address_line2, city, state, postal_code")
          .eq("organization_id", body.organizationId);
        if (listErr) {
          throw validationError("Failed to check existing properties", listErr.message);
        }

        const duplicates = (existing ?? []).filter((p) =>
          addressesLikelyDuplicate(
            {
              addressLine1: body.addressLine1,
              addressLine2: body.addressLine2,
              city: body.city,
              state: body.state,
              postalCode: body.postalCode,
            },
            p,
          ),
        );

        if (duplicates.length > 0 && !body.confirmDuplicateAddress) {
          throw conflictError(
            "A property with this address already exists in your organization. Confirm if you still want to create another.",
            {
              code: "duplicate_property_address",
              matches: duplicates.map((d) => ({
                name: d.name,
                addressLine1: d.address_line1,
                city: d.city,
                state: d.state,
                postalCode: d.postal_code,
              })),
            },
          );
        }

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

        return {
          data: {
            property: data,
            duplicateAddressConfirmed: Boolean(
              body.confirmDuplicateAddress && duplicates.length,
            ),
            duplicateMatches: duplicates.map((d) => d.name),
          },
          status: 201,
        };
      },
    });

    return jsonOk(result.data, { status: result.status });
  } catch (error) {
    return jsonError(error);
  }
}
