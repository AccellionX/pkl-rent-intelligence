import { updateUnitTypeSchema } from "@/domain/schemas";
import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { omitUndefined } from "@/lib/api/object";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

async function loadUnitTypeOrg(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  unitTypeId: string,
) {
  const { data, error } = await supabase
    .from("unit_types")
    .select("id, organization_id")
    .eq("id", unitTypeId)
    .maybeSingle();

  if (error) {
    throw validationError("Failed to load unit type", error.message);
  }
  if (!data) {
    throw notFoundError("Unit type not found");
  }
  return data as { id: string; organization_id: string };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    const unitTypeRef = await loadUnitTypeOrg(supabase, id);
    await requireOrgMembership(supabase, user, unitTypeRef.organization_id);

    const { data, error } = await supabase
      .from("unit_types")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      throw validationError("Failed to load unit type", error.message);
    }

    return jsonOk({ unitType: data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    const unitTypeRef = await loadUnitTypeOrg(supabase, id);
    await requireOrgMembership(supabase, user, unitTypeRef.organization_id);
    const body = await parseJsonBody(request, updateUnitTypeSchema);

    const { data, error } = await supabase
      .from("unit_types")
      .update(
        omitUndefined({
          label: body.label,
          beds: body.beds,
          baths: body.baths,
          description: body.description,
        }),
      )
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw validationError("Failed to update unit type", error.message);
    }

    return jsonOk({ unitType: data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    const unitTypeRef = await loadUnitTypeOrg(supabase, id);
    await requireOrgMembership(supabase, user, unitTypeRef.organization_id);

    const { error } = await supabase.from("unit_types").delete().eq("id", id);
    if (error) {
      throw validationError("Failed to delete unit type", error.message);
    }

    return jsonOk({ deleted: true, id });
  } catch (error) {
    return jsonError(error);
  }
}
