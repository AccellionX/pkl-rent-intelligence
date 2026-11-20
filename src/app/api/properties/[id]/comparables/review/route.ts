import { requirePropertyAccess } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { validationError } from "@/lib/api/errors";
import {
  humanCandidateLabel,
  resolveCandidateBeds,
  resolveCandidateRent,
  resolveCandidateSqft,
  type CandidateNormalized,
} from "@/lib/comparables/candidate-display";
import { sortPendingCandidatesForReview } from "@/lib/comparables/review-sort";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * Property-scoped comparable review payload for customer workflows.
 * Does not inject any hardcoded reference property content.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    const access = await requirePropertyAccess(supabase, user, propertyId);
    const organizationId = access.organizationId;

    const unitTypeIdParam = new URL(request.url).searchParams.get("unitTypeId");

    const { data: property, error: propErr } = await supabase
      .from("properties")
      .select("id, name, address_line1, city, state, postal_code")
      .eq("id", propertyId)
      .maybeSingle();
    if (propErr) throw validationError("Failed to load property", propErr.message);
    if (!property) throw validationError("Property not found");

    const { data: unitTypes, error: utErr } = await supabase
      .from("unit_types")
      .select("id, label, beds, baths")
      .eq("property_id", propertyId)
      .order("beds", { ascending: true });
    if (utErr) throw validationError("Failed to load unit types", utErr.message);

    const focusUnitTypeId =
      unitTypeIdParam ??
      unitTypes?.find((u) => Number(u.beds) === 2)?.id ??
      unitTypes?.[0]?.id ??
      null;

    const { data: docs, error: docErr } = await supabase
      .from("source_documents")
      .select("id, original_filename, source_type, parse_status")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });
    if (docErr) throw validationError("Failed to load documents", docErr.message);

    const docIds = (docs ?? []).map((d) => d.id);
    let extractions: Array<Record<string, unknown>> = [];
    if (docIds.length) {
      const { data, error } = await supabase
        .from("extracted_values")
        .select(
          "id, field_key, review_status, source_document_id, comparable_property_id, normalized_value, created_at",
        )
        .in("source_document_id", docIds)
        .order("created_at", { ascending: false });
      if (error) throw validationError("Failed to load extractions", error.message);
      extractions = data ?? [];
    }

    const focusBeds =
      unitTypes?.find((u) => u.id === focusUnitTypeId)?.beds != null
        ? Number(unitTypes.find((u) => u.id === focusUnitTypeId)?.beds)
        : null;

    const pendingCandidates = sortPendingCandidatesForReview(
      extractions
        .filter((e) => {
          const key = String(e.field_key ?? "");
          const isComp =
            key.startsWith("candidate.") ||
            key.startsWith("hellodata.comp.") ||
            key.startsWith("mls.listing.");
          return isComp && e.review_status === "pending";
        })
        .map((e) => {
          const nv = (e.normalized_value ?? {}) as CandidateNormalized;
          const fieldKey = String(e.field_key);
          const sourceType = fieldKey.startsWith("hellodata.")
            ? "hellodata"
            : fieldKey.startsWith("mls.listing.")
              ? "mls"
              : "rentometer";
          const websiteUrl =
            (typeof nv.websiteUrl === "string" && nv.websiteUrl) ||
            (typeof nv.listingUrl === "string" && nv.listingUrl) ||
            null;
          const { label, missingIdentity } = humanCandidateLabel(nv, fieldKey);
          const rentInfo = resolveCandidateRent(nv, focusBeds);
          const beds = resolveCandidateBeds(nv, focusBeds);
          const sqft = resolveCandidateSqft(nv, focusBeds);
          const daysOnMarket =
            typeof nv.daysOnMarket === "number" ? nv.daysOnMarket : null;
          return {
            id: String(e.id),
            kind: "extraction" as const,
            fieldKey,
            reviewStatus: String(e.review_status),
            sourceType,
            label,
            missingIdentity,
            missingRent: rentInfo.missingRent,
            missingTargetUnitType: rentInfo.missingTargetUnitType,
            addressLine1: nv.address?.line1 ?? null,
            addressRaw: nv.address?.raw ?? null,
            city: nv.address?.city ?? null,
            state: nv.address?.state ?? null,
            postalCode: nv.address?.postalCode ?? null,
            rent: rentInfo.rent,
            sqft,
            beds,
            daysOnMarket,
            distanceMiles:
              typeof nv.distanceMiles === "number" ? nv.distanceMiles : null,
            mlsNumber: nv.mlsNumber ?? null,
            websiteUrl,
          };
        }),
      focusBeds,
    );

    // Market metrics (unit-type averages) — separate from listing comps.
    const pendingMarketMetrics = extractions
      .filter((e) => {
        const key = String(e.field_key ?? "");
        return key.startsWith("hellodata.market.") && e.review_status === "pending";
      })
      .map((e) => {
        const nv = (e.normalized_value ?? {}) as Record<string, unknown>;
        return {
          id: String(e.id),
          fieldKey: String(e.field_key),
          unitTypeLabel: String(
            nv.unitTypeLabel ?? String(e.field_key).replace("hellodata.market.", ""),
          ),
          daysOnMarket: typeof nv.daysOnMarket === "number" ? nv.daysOnMarket : null,
          askingRent: typeof nv.askingRent === "number" ? nv.askingRent : null,
          listings: typeof nv.listings === "number" ? nv.listings : null,
          avgSqft: typeof nv.avgSqft === "number" ? nv.avgSqft : null,
          reviewStatus: String(e.review_status),
        };
      });

    const acceptedMarketMetrics = extractions
      .filter((e) => {
        const key = String(e.field_key ?? "");
        return key.startsWith("hellodata.market.") && e.review_status === "accepted";
      })
      .map((e) => {
        const nv = (e.normalized_value ?? {}) as Record<string, unknown>;
        return {
          id: String(e.id),
          fieldKey: String(e.field_key),
          unitTypeLabel: String(
            nv.unitTypeLabel ?? String(e.field_key).replace("hellodata.market.", ""),
          ),
          daysOnMarket: typeof nv.daysOnMarket === "number" ? nv.daysOnMarket : null,
          askingRent: typeof nv.askingRent === "number" ? nv.askingRent : null,
          listings: typeof nv.listings === "number" ? nv.listings : null,
          avgSqft: typeof nv.avgSqft === "number" ? nv.avgSqft : null,
          reviewStatus: String(e.review_status),
        };
      });

    const { data: comps, error: compErr } = await supabase
      .from("comparable_properties")
      .select("*")
      .eq("subject_property_id", propertyId)
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (compErr) throw validationError("Failed to load comps", compErr.message);

    const compIds = (comps ?? []).map((c) => c.id);
    let unitData: Array<Record<string, unknown>> = [];
    if (compIds.length) {
      let q = supabase
        .from("comparable_unit_data")
        .select("*")
        .in("comparable_property_id", compIds);
      if (focusUnitTypeId) q = q.eq("unit_type_id", focusUnitTypeId);
      const { data, error } = await q;
      if (error) throw validationError("Failed to load unit data", error.message);
      unitData = data ?? [];
    }

    const compById = new Map((comps ?? []).map((c) => [c.id, c]));
    const unitRows = unitData.map((u) => {
      const comp = compById.get(String(u.comparable_property_id));
      return {
        id: String(u.id),
        kind: "unit_data" as const,
        status: String(u.status),
        matchTier: (u.match_tier as string | null) ?? null,
        sourceType: String(u.source_type ?? "unknown"),
        label: comp?.name ?? comp?.address_line1 ?? "Comparable",
        addressLine1: comp?.address_line1 ?? null,
        city: comp?.city ?? null,
        comparablePropertyId: String(u.comparable_property_id),
        rentMin: u.rent_min != null ? Number(u.rent_min) : null,
        rentMax: u.rent_max != null ? Number(u.rent_max) : null,
        sqft: u.sqft_min != null ? Number(u.sqft_min) : null,
        daysOnMarket: u.days_on_market != null ? Number(u.days_on_market) : null,
        distanceMiles:
          comp?.distance_miles != null ? Number(comp.distance_miles) : null,
        notes: (u.notes as string | null) ?? null,
        hasAvailableData: Boolean(u.has_available_data),
      };
    });

    const approved = unitRows.filter((u) => u.status === "approved");
    const rejected = unitRows.filter((u) => u.status === "rejected");

    return jsonOk({
      propertyId,
      organizationId,
      property: {
        id: property.id,
        name: property.name,
        addressLine1: property.address_line1,
        city: property.city,
        state: property.state,
        postalCode: property.postal_code,
      },
      unitTypeId: focusUnitTypeId,
      unitTypes: unitTypes ?? [],
      documents: docs ?? [],
      pendingCandidates,
      pendingMarketMetrics,
      acceptedMarketMetrics,
      approvedUnits: approved,
      excludedUnits: rejected,
      summary: {
        pendingCount: pendingCandidates.length,
        approvedCount: approved.length,
        excludedCount: rejected.length,
        documentCount: (docs ?? []).length,
        pendingMarketMetricCount: pendingMarketMetrics.length,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
