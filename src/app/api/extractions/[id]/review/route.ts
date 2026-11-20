import type { Json } from "@/domain/database.types";
import { reviewExtractionSchema } from "@/domain/extraction-schemas";
import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

type CandidateNormalized = {
  name?: string | null;
  address?: {
    raw?: string;
    normalized?: string;
    line1?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
  } | null;
  rent?: number | null;
  sqft?: number | null;
  psf?: number | null;
  beds?: number | null;
  baths?: number | null;
  distanceMiles?: number | null;
  propertyType?: string | null;
  includeAsCompCandidate?: boolean;
  isSubjectLikely?: boolean;
  isSubject?: boolean;
  mlsNumber?: string | null;
  websiteUrl?: string | null;
  listingUrl?: string | null;
  unit?: string | null;
  daysOnMarket?: number | null;
  yearBuilt?: number | null;
  unitTypes?: Array<{
    unitTypeLabel: string;
    beds: number | null;
    rent: number | null;
    sqft: number | null;
    psf: number | null;
    available: boolean;
  }>;
  match?: {
    matchedId?: string | null;
    confidence?: string;
  };
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    const body = await parseJsonBody(request, reviewExtractionSchema);

    const { data: extraction, error } = await supabase
      .from("extracted_values")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw validationError("Failed to load extraction", error.message);
    if (!extraction) throw notFoundError("Extraction not found");

    await requireOrgMembership(supabase, user, extraction.organization_id);

    if (
      extraction.review_status === "accepted" ||
      extraction.review_status === "overridden"
    ) {
      // Durable: allow additional decision records only via overridden path with reason.
      if (body.decision !== "overridden" && body.decision !== "rejected") {
        throw validationError(
          "Extraction already has an approved decision; use overridden/rejected with a reason",
        );
      }
    }

    const original = extraction.normalized_value;
    const chosen =
      (body.chosenNormalizedValue as Json | undefined) ??
      original ??
      ({} as Json);

    const { data: decision, error: decisionError } = await supabase
      .from("review_decisions")
      .insert({
        organization_id: extraction.organization_id,
        extracted_value_id: extraction.id,
        original_normalized_value: original,
        chosen_normalized_value: chosen,
        reason: body.reason,
        reviewer_user_id: user.id,
      })
      .select("*")
      .single();

    if (decisionError) {
      throw validationError("Failed to record review decision", decisionError.message);
    }

    const { data: updated, error: updateError } = await supabase
      .from("extracted_values")
      .update({
        review_status: body.decision,
        normalized_value:
          body.decision === "overridden" || body.decision === "accepted"
            ? chosen
            : extraction.normalized_value,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      throw validationError("Failed to update extraction status", updateError.message);
    }

    let comparablePropertyId: string | null = extraction.comparable_property_id;
    let comparableUnitDataId: string | null = null;

    const candidate = chosen as CandidateNormalized;
    const isRentometerCandidate = extraction.field_key.startsWith("candidate.");
    const isHelloDataComp = extraction.field_key.startsWith("hellodata.comp.");
    const isMlsListing = extraction.field_key.startsWith("mls.listing.");
    const isCompField = isRentometerCandidate || isHelloDataComp || isMlsListing;

    if (
      (body.decision === "accepted" || body.decision === "overridden") &&
      isCompField &&
      candidate.includeAsCompCandidate !== false &&
      !candidate.isSubjectLikely &&
      !candidate.isSubject &&
      body.unitTypeId &&
      (candidate.address?.line1 || candidate.match?.matchedId)
    ) {
      const { data: unitType } = await supabase
        .from("unit_types")
        .select("id, property_id, organization_id, beds, label")
        .eq("id", body.unitTypeId)
        .maybeSingle();

      if (
        !unitType ||
        unitType.organization_id !== extraction.organization_id
      ) {
        throw validationError("unitTypeId is invalid for this organization");
      }

      const { data: document } = await supabase
        .from("source_documents")
        .select("property_id, id")
        .eq("id", extraction.source_document_id)
        .single();

      if (!document || document.property_id !== unitType.property_id) {
        throw validationError("unitTypeId must belong to the document property");
      }

      if (candidate.match?.matchedId) {
        comparablePropertyId = candidate.match.matchedId;
      } else if (extraction.comparable_property_id) {
        comparablePropertyId = extraction.comparable_property_id;
      } else if (candidate.address?.line1) {
        // Property-level comparable membership (shared across unit types).
        const { data: existingComp } = await supabase
          .from("comparable_properties")
          .select("id")
          .eq("subject_property_id", document.property_id)
          .eq("address_line1", candidate.address.line1)
          .eq("city", candidate.address.city ?? "")
          .maybeSingle();

        // MLS identity match by mls_number when address lookup misses
        if (!existingComp && isMlsListing && candidate.mlsNumber) {
          const { data: byMls } = await supabase
            .from("comparable_properties")
            .select("id")
            .eq("subject_property_id", document.property_id)
            .eq("mls_number", candidate.mlsNumber)
            .maybeSingle();
          if (byMls) comparablePropertyId = byMls.id;
        }

        if (existingComp) {
          comparablePropertyId = existingComp.id;
        } else if (!comparablePropertyId) {
          const websiteUrl =
            (typeof candidate.websiteUrl === "string" && candidate.websiteUrl) ||
            (typeof candidate.listingUrl === "string" && candidate.listingUrl) ||
            null;
          const baseNotes = isHelloDataComp
            ? "Created from reviewed HelloData candidate (review-only until approved)"
            : isMlsListing
              ? "Created from reviewed MLS listing (MLS-only comps allowed)"
              : "Created from reviewed Rentometer candidate";
          const { data: createdComp, error: compError } = await supabase
            .from("comparable_properties")
            .insert({
              subject_property_id: document.property_id,
              organization_id: extraction.organization_id,
              name: candidate.name ?? candidate.address.line1,
              address_line1: candidate.address.line1,
              city: candidate.address.city ?? "Unknown",
              state: candidate.address.state ?? (isMlsListing ? "CT" : "RI"),
              postal_code: candidate.address.postalCode ?? null,
              distance_miles: candidate.distanceMiles ?? null,
              mls_number: candidate.mlsNumber ?? null,
              year_built: candidate.yearBuilt ?? null,
              addition_note: body.reason,
              notes: websiteUrl ? `${baseNotes} · Website: ${websiteUrl}` : baseNotes,
            })
            .select("id")
            .single();
          if (compError) {
            throw validationError("Failed to create comparable property", compError.message);
          }
          comparablePropertyId = createdComp.id;
        } else if (isMlsListing && candidate.mlsNumber) {
          await supabase
            .from("comparable_properties")
            .update({
              mls_number: candidate.mlsNumber,
              distance_miles: candidate.distanceMiles ?? undefined,
            })
            .eq("id", comparablePropertyId)
            .is("mls_number", null);
        }
      }

      if (!comparablePropertyId) {
        throw validationError("Could not resolve comparable property for approval");
      }

      const focusBeds = Number(unitType.beds);
      const hdUnit = candidate.unitTypes?.find((u) => u.beds === focusBeds);
      const rent = isHelloDataComp
        ? (hdUnit?.rent ?? null)
        : (candidate.rent ?? null);
      const sqft = isHelloDataComp
        ? (hdUnit?.sqft ?? null)
        : (candidate.sqft ?? null);
      const psf = isHelloDataComp
        ? (hdUnit?.psf ?? (rent && sqft ? rent / sqft : null))
        : (candidate.psf ?? (rent && sqft ? rent / sqft : null));
      const bedsOk =
        !isMlsListing ||
        candidate.beds == null ||
        Number(candidate.beds) === focusBeds;
      const hasAvailableData = isHelloDataComp
        ? Boolean(hdUnit?.available && rent != null)
        : isMlsListing
          ? Boolean(bedsOk && rent != null)
          : rent != null;
      const missingNote = isHelloDataComp && !hasAvailableData
        ? `No ${unitType.label ?? `${focusBeds}BR`} available`
        : isMlsListing && !bedsOk
          ? `MLS listing beds (${candidate.beds}) do not match unit type ${focusBeds}BR`
          : null;

      // Source-specific upsert: MLS never overwrites Rentometer/HelloData approved values.
      const sourceType = isHelloDataComp
        ? "hellodata"
        : isMlsListing
          ? "mls"
          : "rentometer";
      const { data: unitData, error: unitDataError } = await supabase
        .from("comparable_unit_data")
        .upsert(
          {
            comparable_property_id: comparablePropertyId,
            unit_type_id: body.unitTypeId,
            organization_id: extraction.organization_id,
            source_type: sourceType,
            match_tier: body.matchTier ?? null,
            rent_min: rent,
            rent_max: rent,
            sqft_min: sqft,
            sqft_max: sqft,
            psf,
            // Preserve source DOM when present (MLS, Rentometer, HelloData).
            // Do not invent DOM from market-wide HelloData metrics.
            days_on_market: candidate.daysOnMarket ?? null,
            status: "approved",
            has_available_data: hasAvailableData,
            notes: [body.reason, missingNote].filter(Boolean).join(" · "),
            source_document_id: extraction.source_document_id,
          },
          { onConflict: "comparable_property_id,unit_type_id,source_type" },
        )
        .select("id")
        .single();

      if (unitDataError) {
        throw validationError(
          "Failed to upsert comparable unit data",
          unitDataError.message,
        );
      }
      comparableUnitDataId = unitData.id;

      await supabase
        .from("extracted_values")
        .update({ comparable_property_id: comparablePropertyId })
        .eq("id", id);
    }

    return jsonOk({
      extraction: updated,
      decision,
      comparablePropertyId,
      comparableUnitDataId,
      pricingNote:
        "Approved comps are stored separately; unreviewed candidates do not update pricing KPIs",
    });
  } catch (error) {
    return jsonError(error);
  }
}
