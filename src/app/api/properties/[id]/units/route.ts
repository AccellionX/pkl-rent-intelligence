import { createSubjectUnitSchema } from "@/domain/schemas";
import { requirePropertyAccess } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { runIdempotent } from "@/lib/api/idempotency";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

/** List subject units for a property (optionally filtered by unitTypeId). */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    await requirePropertyAccess(supabase, user, propertyId);

    const unitTypeId = new URL(request.url).searchParams.get("unitTypeId");

    let query = supabase
      .from("subject_units")
      .select("*")
      .eq("property_id", propertyId)
      .order("unit_number", { ascending: true });

    if (unitTypeId) query = query.eq("unit_type_id", unitTypeId);

    const { data, error } = await query;
    if (error) throw validationError("Failed to list subject units", error.message);

    const typeIds = [...new Set((data ?? []).map((r) => r.unit_type_id))];
    const typeById = new Map<
      string,
      { id: string; label: string; beds: number; baths: number }
    >();
    if (typeIds.length > 0) {
      const { data: types } = await supabase
        .from("unit_types")
        .select("id, label, beds, baths")
        .in("id", typeIds);
      for (const t of types ?? []) {
        typeById.set(t.id, {
          id: t.id,
          label: t.label,
          beds: Number(t.beds),
          baths: Number(t.baths),
        });
      }
    }

    const units = (data ?? []).map((row) => {
      const ut = typeById.get(row.unit_type_id);
      return {
        id: row.id,
        propertyId: row.property_id,
        organizationId: row.organization_id,
        unitTypeId: row.unit_type_id,
        unitTypeLabel: ut?.label ?? null,
        beds: ut?.beds ?? null,
        baths: ut?.baths ?? null,
        unitNumber: row.unit_number,
        sqft: row.sqft,
        askingRent: row.asking_rent != null ? Number(row.asking_rent) : null,
        marketRent: row.market_rent != null ? Number(row.market_rent) : null,
        status: row.status,
        availableDate: row.available_date,
        floor: row.floor,
        notes: row.notes,
        incomplete:
          row.sqft == null ||
          row.asking_rent == null ||
          !row.unit_number ||
          !row.unit_type_id,
        updatedAt: row.updated_at,
      };
    });

    return jsonOk({ units });
  } catch (error) {
    return jsonError(error);
  }
}

/** Create a subject unit on this property. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    const access = await requirePropertyAccess(supabase, user, propertyId);
    const body = await parseJsonBody(request, createSubjectUnitSchema);

    const { data: unitType, error: utErr } = await supabase
      .from("unit_types")
      .select("id, property_id, organization_id")
      .eq("id", body.unitTypeId)
      .maybeSingle();
    if (utErr) throw validationError("Failed to validate unit type", utErr.message);
    if (!unitType || unitType.property_id !== propertyId) {
      throw notFoundError("Unit type not found on this property");
    }
    if (unitType.organization_id !== access.organizationId) {
      throw notFoundError("Unit type not found on this property");
    }

    const result = await runIdempotent({
      request,
      organizationId: access.organizationId,
      userId: user.id,
      route: `POST /api/properties/${propertyId}/units`,
      supabase,
      execute: async () => {
        const { data, error } = await supabase
          .from("subject_units")
          .insert({
            property_id: propertyId,
            organization_id: access.organizationId,
            unit_type_id: body.unitTypeId,
            unit_number: body.unitNumber,
            sqft: body.sqft ?? null,
            asking_rent: body.askingRent ?? null,
            market_rent: body.marketRent ?? null,
            status: body.status,
            available_date: body.availableDate ?? null,
            floor: body.floor ?? null,
            notes: body.notes ?? null,
          })
          .select("*")
          .single();

        if (error) {
          if (error.code === "23505") {
            throw validationError("A unit with this number already exists on the property");
          }
          throw validationError("Failed to create subject unit", error.message);
        }

        return { data: { unit: data }, status: 201 };
      },
    });

    return jsonOk(result.data, { status: result.status });
  } catch (error) {
    return jsonError(error);
  }
}
