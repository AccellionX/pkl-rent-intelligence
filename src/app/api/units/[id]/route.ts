import { updateSubjectUnitSchema } from "@/domain/schemas";
import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { omitUndefined } from "@/lib/api/object";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";
import type { Database } from "@/domain/database.types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();

    const { data, error } = await supabase
      .from("subject_units")
      .select("*, unit_types(id, label, beds, baths)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw validationError("Failed to load unit", error.message);
    if (!data) throw notFoundError("Subject unit not found");

    await requireOrgMembership(supabase, user, data.organization_id);
    return jsonOk({ unit: data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    const body = await parseJsonBody(request, updateSubjectUnitSchema);

    const { data: existing, error } = await supabase
      .from("subject_units")
      .select("id, organization_id, property_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw validationError("Failed to load unit", error.message);
    if (!existing) throw notFoundError("Subject unit not found");
    await requireOrgMembership(supabase, user, existing.organization_id);

    if (body.unitTypeId) {
      const { data: ut } = await supabase
        .from("unit_types")
        .select("id, property_id, organization_id")
        .eq("id", body.unitTypeId)
        .maybeSingle();
      if (!ut || ut.property_id !== existing.property_id) {
        throw validationError("unitTypeId must belong to the same property");
      }
    }

    const patch = omitUndefined({
      unit_type_id: body.unitTypeId,
      unit_number: body.unitNumber,
      sqft: body.sqft,
      asking_rent: body.askingRent,
      market_rent: body.marketRent,
      status: body.status,
      available_date: body.availableDate,
      floor: body.floor,
      notes: body.notes,
    }) as Database["public"]["Tables"]["subject_units"]["Update"];

    const { data, error: updErr } = await supabase
      .from("subject_units")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (updErr) {
      if (updErr.code === "23505") {
        throw validationError("A unit with this number already exists on the property");
      }
      throw validationError("Failed to update subject unit", updErr.message);
    }

    return jsonOk({ unit: data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();

    const { data: existing, error } = await supabase
      .from("subject_units")
      .select("id, organization_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw validationError("Failed to load unit", error.message);
    if (!existing) throw notFoundError("Subject unit not found");
    await requireOrgMembership(supabase, user, existing.organization_id);

    const { error: delErr } = await supabase.from("subject_units").delete().eq("id", id);
    if (delErr) throw validationError("Failed to delete subject unit", delErr.message);

    return jsonOk({ deleted: true, id });
  } catch (error) {
    return jsonError(error);
  }
}
