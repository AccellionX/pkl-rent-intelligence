import { requirePropertyAccess } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";
import { PROVIDENCE_855_REFERENCE } from "@/data/855-providence-reference";
import { isProvidence855Subject } from "@/lib/properties/is-providence-855";
import {
  reconcile855Candidates,
  type LiveCandidateRow,
} from "@/lib/reports/reconcile-855";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Internal read-only reference↔live reconciliation for 855 Providence acceptance.
 * Gated to the matching subject property only — never injects 855 content elsewhere.
 * Customer Comparables UI uses `/comparables/review` instead.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    const access = await requirePropertyAccess(supabase, user, propertyId);
    const organizationId = access.organizationId;

    const { data: property, error: propErr } = await supabase
      .from("properties")
      .select("id, name, address_line1, city, state, postal_code")
      .eq("id", propertyId)
      .maybeSingle();
    if (propErr) throw validationError("Failed to load property", propErr.message);
    if (!property) throw notFoundError("Property not found");
    if (!isProvidence855Subject(property)) {
      throw notFoundError(
        "Reference acceptance tooling is not available for this property",
      );
    }

    const unitTypeId = new URL(request.url).searchParams.get("unitTypeId");

    const { data: unitTypes, error: utErr } = await supabase
      .from("unit_types")
      .select("id, label, beds, baths")
      .eq("property_id", propertyId);
    if (utErr) throw validationError("Failed to load unit types", utErr.message);

    const focusUnitTypeId =
      unitTypeId ??
      unitTypes?.find((u) => Number(u.beds) === 2)?.id ??
      unitTypes?.[0]?.id ??
      null;

    const { data: comps, error: compErr } = await supabase
      .from("comparable_properties")
      .select("*")
      .eq("subject_property_id", propertyId)
      .eq("is_active", true);
    if (compErr) throw validationError("Failed to load comps", compErr.message);

    const compIds = (comps ?? []).map((c) => c.id);
    let unitData: Array<Record<string, unknown>> = [];
    if (compIds.length > 0) {
      let q = supabase
        .from("comparable_unit_data")
        .select("*")
        .in("comparable_property_id", compIds);
      if (focusUnitTypeId) q = q.eq("unit_type_id", focusUnitTypeId);
      const { data, error } = await q;
      if (error) throw validationError("Failed to load unit data", error.message);
      unitData = data ?? [];
    }

    const { data: docs, error: docErr } = await supabase
      .from("source_documents")
      .select("id, original_filename, source_type, parse_status")
      .eq("property_id", propertyId);
    if (docErr) throw validationError("Failed to load documents", docErr.message);

    const { data: extractions, error: evErr } = await supabase
      .from("extracted_values")
      .select(
        "id, field_key, review_status, source_document_id, comparable_property_id, normalized_value",
      )
      .eq("organization_id", organizationId);
    if (evErr) throw validationError("Failed to load extractions", evErr.message);

    const candidates: LiveCandidateRow[] = [];

    for (const e of extractions ?? []) {
      if (
        !e.field_key.startsWith("candidate.") &&
        !e.field_key.startsWith("hellodata.comp.") &&
        !e.field_key.startsWith("mls.listing.")
      ) {
        continue;
      }
      const nv = (e.normalized_value ?? {}) as Record<string, unknown>;
      const address = nv.address as
        | { line1?: string; raw?: string; city?: string }
        | undefined;
      candidates.push({
        id: e.id,
        kind: "extraction",
        fieldKey: e.field_key,
        reviewStatus: e.review_status,
        sourceDocumentId: e.source_document_id,
        name: (nv.name as string | undefined) ?? null,
        addressLine1: address?.line1 ?? address?.raw ?? null,
        city: address?.city ?? null,
        rent: typeof nv.rent === "number" ? nv.rent : null,
        sqft: typeof nv.sqft === "number" ? nv.sqft : null,
        distanceMiles:
          typeof nv.distanceMiles === "number" ? nv.distanceMiles : null,
        comparablePropertyId: e.comparable_property_id,
      });
    }

    const compById = new Map((comps ?? []).map((c) => [c.id, c]));
    for (const u of unitData) {
      const comp = compById.get(String(u.comparable_property_id));
      candidates.push({
        id: String(u.id),
        kind: "unit_data",
        unitStatus: String(u.status),
        matchTier: (u.match_tier as LiveCandidateRow["matchTier"]) ?? null,
        sourceType: String(u.source_type ?? "unknown"),
        sourceDocumentId: (u.source_document_id as string | null) ?? null,
        name: comp?.name ?? null,
        addressLine1: comp?.address_line1 ?? null,
        city: comp?.city ?? null,
        rentMin: u.rent_min != null ? Number(u.rent_min) : null,
        rentMax: u.rent_max != null ? Number(u.rent_max) : null,
        sqft: u.sqft_min != null ? Number(u.sqft_min) : null,
        distanceMiles: comp?.distance_miles != null ? Number(comp.distance_miles) : null,
        notes: (u.notes as string | null) ?? null,
        comparablePropertyId: String(u.comparable_property_id),
        comparableUnitDataId: String(u.id),
      });
    }

    const matrix = reconcile855Candidates(candidates);

    return jsonOk({
      propertyId,
      organizationId,
      unitTypeId: focusUnitTypeId,
      unitTypes: unitTypes ?? [],
      documents: docs ?? [],
      reference: {
        subject: PROVIDENCE_855_REFERENCE.subject,
        kpis: PROVIDENCE_855_REFERENCE.kpis,
        includedCount: PROVIDENCE_855_REFERENCE.included.length,
        excludedCount: PROVIDENCE_855_REFERENCE.excluded.length,
      },
      matrix,
      note: "Read-only reconciliation. Approvals require explicit human review actions.",
    });
  } catch (error) {
    return jsonError(error);
  }
}
