import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/domain/database.types";
import { detectRentConflict } from "./conflicts";
import { sha256Hex } from "./hash";
import { parseHelloDataPdfBuffer } from "./hellodata-pdf";
import { applyExtractedSubjectIdentity } from "./apply-subject-identity";
import { HELLODATA_PARSER_VERSION } from "./hellodata-types";
import { extractListingUrlsFromText } from "./listing-links";
import { matchComparableProperty } from "./matching";
import { sanitizeStorageFilename } from "./normalize";

const BUCKET = "source-documents";
type Client = SupabaseClient<Database>;

export async function persistHelloDataParse(opts: {
  supabase: Client;
  organizationId: string;
  propertyId: string;
  reportRunId?: string | null;
  unitTypeId?: string | null;
  filename: string;
  contentType: string | null;
  bytes: Uint8Array;
  uploadedBy: string;
  replaceDocumentId?: string | null;
  /** Preferred unit-type beds for conflict comparison, e.g. 1 or 2. */
  focusBeds?: number | null;
}): Promise<{
  documentId: string;
  extractionCount: number;
  matchSummary: {
    exact: number;
    strong: number;
    weak: number;
    ambiguous: number;
    none: number;
  };
  conflictCount: number;
  storagePath: string;
}> {
  const contentSha = sha256Hex(opts.bytes);
  const safeName = sanitizeStorageFilename(opts.filename);
  const storagePath = `${opts.organizationId}/properties/${opts.propertyId}/hellodata/${Date.now()}-${safeName}`;

  const upload = await opts.supabase.storage.from(BUCKET).upload(storagePath, opts.bytes, {
    contentType: opts.contentType ?? "application/pdf",
    upsert: false,
  });
  if (upload.error) {
    throw new Error(`Storage upload failed: ${upload.error.message}`);
  }

  const { data: document, error: docError } = await opts.supabase
    .from("source_documents")
    .insert({
      organization_id: opts.organizationId,
      property_id: opts.propertyId,
      report_run_id: opts.reportRunId ?? null,
      unit_type_id: opts.unitTypeId ?? null,
      source_type: "hellodata_pdf",
      file_format: "pdf",
      storage_bucket: BUCKET,
      storage_path: storagePath,
      original_filename: opts.filename,
      byte_size: opts.bytes.byteLength,
      content_type: opts.contentType,
      parse_status: "parsing",
      content_sha256: contentSha,
      parser_version: HELLODATA_PARSER_VERSION,
      uploaded_by: opts.uploadedBy,
      warnings: [],
      summary_metrics: {},
    })
    .select("*")
    .single();

  if (docError || !document) {
    await opts.supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(docError?.message ?? "Failed to create source_documents row");
  }

  if (opts.replaceDocumentId) {
    await opts.supabase
      .from("source_documents")
      .update({ superseded_by: document.id })
      .eq("id", opts.replaceDocumentId)
      .eq("organization_id", opts.organizationId);
  }

  let parse;
  try {
    parse = await parseHelloDataPdfBuffer({
      filename: opts.filename,
      bytes: opts.bytes,
    });
  } catch (error) {
    const { markSourceDocumentFailed } = await import("@/lib/uploads/lifecycle");
    const { validationError } = await import("@/lib/api/errors");
    await markSourceDocumentFailed(
      opts.supabase,
      document.id,
      error instanceof Error ? error.message : "Parse failed",
    );
    throw validationError(
      "Could not parse this HelloData PDF. Check the export and retry.",
      { documentId: document.id, retryable: true },
    );
  }

  const { data: existingComps } = await opts.supabase
    .from("comparable_properties")
    .select("id, name, address_line1, city, state, postal_code")
    .eq("subject_property_id", opts.propertyId)
    .eq("is_active", true);

  const known = (existingComps ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    addressRaw: c.address_line1,
    city: c.city,
    state: c.state,
    postalCode: c.postal_code,
  }));

  const matchSummary = { exact: 0, strong: 0, weak: 0, ambiguous: 0, none: 0 };
  const extractionRows: Database["public"]["Tables"]["extracted_values"]["Insert"][] = [];

  // Subject market/subject rows are stored for audit but never as approved comps.
  extractionRows.push({
    organization_id: opts.organizationId,
    source_document_id: document.id,
    report_run_id: opts.reportRunId ?? null,
    field_key: "hellodata.subject",
    raw_value: parse.subjectName,
    normalized_value: {
      name: parse.subjectName,
      address: parse.subjectAddress,
      reportDate: parse.reportDate,
      dateRange: parse.dateRange,
      ignoredForCompEnrichment: true,
    } as unknown as Json,
    confidence: 0.9,
    uncertainty_notes: "HelloData subject property — ignored for comparable enrichment",
    page_ref: "Executive Summary",
    review_status: "pending",
  });

  for (const metric of parse.marketMetrics) {
    extractionRows.push({
      organization_id: opts.organizationId,
      source_document_id: document.id,
      report_run_id: opts.reportRunId ?? null,
      field_key: `hellodata.market.${metric.unitTypeLabel}`,
      raw_value: metric.rawBlock,
      normalized_value: metric as unknown as Json,
      confidence: 0.85,
      uncertainty_notes: "Market-wide trailing metric — not a property-specific approved-comp KPI",
      page_ref: "Unit Type Metrics",
      review_status: "pending",
    });
  }

  let idx = 0;
  for (const building of parse.buildings) {
    const match = building.isSubject
      ? {
          confidence: "none" as const,
          matchedId: null,
          score: 0,
          reason: "Subject building ignored for matching",
          ambiguousIds: [] as string[],
        }
      : matchComparableProperty(
          {
            id: `incoming-${idx}`,
            name: building.name,
            addressRaw: building.address?.raw ?? building.address?.line1,
            city: building.address?.city,
            state: building.address?.state,
            postalCode: building.address?.postalCode,
          },
          known,
        );

    matchSummary[match.confidence] += 1;

    extractionRows.push({
      organization_id: opts.organizationId,
      source_document_id: document.id,
      report_run_id: opts.reportRunId ?? null,
      field_key: building.isSubject
        ? `hellodata.subject.building.${idx}`
        : `hellodata.comp.${idx}`,
      raw_value: building.rawBlock,
      normalized_value: {
        ...building,
        match,
        includeAsCompCandidate: !building.isSubject && match.confidence !== "ambiguous",
        requiresHumanMatchResolution: match.confidence === "ambiguous" || match.confidence === "weak",
      } as unknown as Json,
      confidence:
        match.confidence === "exact" || match.confidence === "strong" ? 0.9 : 0.55,
      uncertainty_notes: [
        building.isSubject ? "Subject ignored for enrichment" : null,
        match.reason,
        ...building.unitTypes.flatMap((u) => u.flags.map((f) => f.message)),
      ]
        .filter(Boolean)
        .join("; "),
      page_ref: building.pageRef,
      row_ref: String(idx),
      comparable_property_id: match.matchedId,
      review_status: "pending",
    });
    idx += 1;
  }

  if (extractionRows.length) {
    const { error: extractError } = await opts.supabase
      .from("extracted_values")
      .insert(extractionRows);
    if (extractError) {
      await opts.supabase
        .from("source_documents")
        .update({ parse_status: "failed", parse_error: extractError.message })
        .eq("id", document.id);
      throw new Error(`Failed to store HelloData extractions: ${extractError.message}`);
    }
  }

  // Detect rent conflicts vs approved Rentometer unit data when focus beds provided.
  let conflictCount = 0;
  const focusBeds = opts.focusBeds ?? null;
  if (focusBeds != null) {
    const { data: approvedUnitData } = await opts.supabase
      .from("comparable_unit_data")
      .select("id, comparable_property_id, rent_min, rent_max, source_type, status")
      .eq("organization_id", opts.organizationId)
      .eq("status", "approved");

    for (const building of parse.comparableBuildings) {
      const match = matchComparableProperty(
        {
          id: building.name,
          name: building.name,
          addressRaw: building.address?.raw ?? building.address?.line1,
          city: building.address?.city,
          state: building.address?.state,
          postalCode: building.address?.postalCode,
        },
        known,
      );
      if (!match.matchedId) continue;
      const hdUnit = building.unitTypes.find((u) => u.beds === focusBeds && u.rent != null);
      const approved = (approvedUnitData ?? []).find(
        (u) => u.comparable_property_id === match.matchedId,
      );
      if (!hdUnit?.rent || !approved?.rent_min) continue;
      const leftRent = approved.rent_min;
      const conflict = detectRentConflict(
        {
          source: approved.source_type || "rentometer",
          rent: leftRent,
          isRange: approved.rent_max != null && approved.rent_max !== approved.rent_min,
        },
        {
          source: "hellodata",
          rent: hdUnit.rent,
        },
      );
      if (conflict?.exceedsThreshold) {
        const { error: conflictError } = await opts.supabase
          .from("source_value_conflicts")
          .insert({
            organization_id: opts.organizationId,
            property_id: opts.propertyId,
            unit_type_id: opts.unitTypeId ?? null,
            comparable_property_id: match.matchedId,
            field_key: "rent",
            left_source: conflict.left.source,
            right_source: conflict.right.source,
            left_value: {
              rent: conflict.left.rent,
              asOf: null,
            } as unknown as Json,
            right_value: {
              rent: conflict.right.rent,
              unitType: hdUnit.unitTypeLabel,
              reportDate: parse.reportDate,
            } as unknown as Json,
            absolute_delta: conflict.absoluteDelta,
            status: "pending",
          });
        if (!conflictError) conflictCount += 1;
      }
    }
  }

  await opts.supabase
    .from("source_documents")
    .update({
      parse_status: "needs_review",
      parse_error: null,
      warnings: parse.warnings as unknown as Json,
      summary_metrics: {
        reportDate: parse.reportDate,
        dateRange: parse.dateRange,
        comparableBuildingCount: parse.comparableBuildings.length,
        marketMetricCount: parse.marketMetrics.length,
        matchSummary,
        conflictCount,
        documentListingLinkCount: parse.documentListingLinks.all.length,
        subjectWebsiteUrl:
          parse.buildings.find((b) => b.isSubject)?.websiteUrl ?? null,
      } as unknown as Json,
      parser_version: HELLODATA_PARSER_VERSION,
      external_report_id: parse.reportDate,
    })
    .eq("id", document.id);

  // Subject identity must use subject-associated links only.
  // Never copy comparable (or document-wide) websites into the subject property.
  const subjectBuilding = parse.buildings.find((b) => b.isSubject);
  const subjectListingLinks = subjectBuilding?.websiteUrl
    ? extractListingUrlsFromText(subjectBuilding.websiteUrl)
    : { all: [] as string[], zillow: null, apartments: null, websites: [] as string[] };

  await applyExtractedSubjectIdentity({
    supabase: opts.supabase,
    propertyId: opts.propertyId,
    organizationId: opts.organizationId,
    proposal: {
      marketingName: parse.subjectName,
      address: parse.subjectAddress,
      listingLinks: subjectListingLinks,
    },
  });

  return {
    documentId: document.id,
    extractionCount: extractionRows.length,
    matchSummary,
    conflictCount,
    storagePath,
  };
}
