import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/domain/database.types";
import { distanceMilesBetweenAddresses } from "@/lib/geo/geocode";
import { detectRentConflict } from "./conflicts";
import { sha256Hex } from "./hash";
import { matchComparableProperty } from "./matching";
import { parseMlsPdfBuffer } from "./mls-detect";
import { attachMlsPhotoCandidates, getPngBytesFromCandidate } from "./mls-photos";
import {
  MLS_CT_PARSER_VERSION,
  MLS_RI_PARSER_VERSION,
  type MlsListing,
} from "./mls-types";
import { sanitizeStorageFilename } from "./normalize";
import { mapWithConcurrency } from "@/lib/photos/list-filter";
import { uploadWithRetry } from "@/lib/storage/retry";

const SOURCE_BUCKET = "source-documents";
const PHOTO_BUCKET = "report-photos";
const MLS_PHOTO_UPLOAD_CONCURRENCY = 4;
type Client = SupabaseClient<Database>;

function listingDisplayName(listing: MlsListing): string {
  const base = listing.addressLine1 ?? listing.mlsNumber ?? "MLS listing";
  return listing.unit ? `${base} #${listing.unit}` : base;
}

function listingNormalized(listing: MlsListing, index: number): Json {
  return {
    name: listingDisplayName(listing),
    mlsNumber: listing.mlsNumber,
    address: {
      raw: [listing.addressLine1, listing.unit ? `#${listing.unit}` : null, listing.city, listing.state, listing.postalCode]
        .filter(Boolean)
        .join(", "),
      line1: listing.addressLine1,
      unit: listing.unit,
      city: listing.city,
      state: listing.state,
      postalCode: listing.postalCode,
      normalized: null,
    },
    rent: listing.listRent,
    sqft: listing.sqft,
    psf: listing.psf,
    beds: listing.beds,
    baths: listing.baths,
    bathsRaw: listing.bathsRaw,
    daysOnMarket: listing.daysOnMarket,
    listDate: listing.listDate,
    yearBuilt: listing.yearBuilt,
    propertyType: listing.propertyType,
    parking: listing.parking,
    utilitiesTenant: listing.utilitiesTenant,
    amenities: listing.amenities,
    description: listing.description,
    availability: listing.availability,
    status: listing.status,
    includeAsCompCandidate: true,
    isSubjectLikely: false,
    isSubject: false,
    distanceMiles: null,
    distanceFlagged: false,
    geocodeStatus: null,
    recordSource: listing.recordSource,
    pageRefs: listing.pageRefs,
    photoCount: listing.photoCandidates.filter((p) => !p.rejectedAsNonProperty).length,
    flags: listing.flags,
    match: null,
    index,
  } as unknown as Json;
}

export async function persistMlsParse(opts: {
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
  sourceType: "mls_ri_pdf" | "mls_ct_pdf";
  focusBeds?: number | null;
  extractPhotos?: boolean;
  geocodeDistances?: boolean;
}): Promise<{
  documentId: string;
  extractionCount: number;
  listingCount: number;
  matchSummary: {
    exact: number;
    strong: number;
    weak: number;
    ambiguous: number;
    none: number;
  };
  conflictCount: number;
  photoStoredCount: number;
  geocodeAttempted: number;
  geocodeOk: number;
  storagePath: string;
  dialect: string;
}> {
  const contentSha = sha256Hex(opts.bytes);
  const vendor = opts.sourceType === "mls_ct_pdf" ? "mls-ct" : "mls-ri";
  const safeName = sanitizeStorageFilename(opts.filename);
  const storagePath = `${opts.organizationId}/properties/${opts.propertyId}/${vendor}/${Date.now()}-${safeName}`;

  try {
    await uploadWithRetry(() =>
      opts.supabase.storage.from(SOURCE_BUCKET).upload(storagePath, opts.bytes, {
        contentType: opts.contentType ?? "application/pdf",
        upsert: false,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Storage upload failed";
    throw new Error(
      message.includes("fetch failed") || /network|timeout/i.test(message)
        ? "Could not store the MLS file securely. Check your connection and try again."
        : `Could not store the MLS file: ${message}`,
    );
  }

  const parserVersion =
    opts.sourceType === "mls_ct_pdf" ? MLS_CT_PARSER_VERSION : MLS_RI_PARSER_VERSION;

  const { data: document, error: docError } = await opts.supabase
    .from("source_documents")
    .insert({
      organization_id: opts.organizationId,
      property_id: opts.propertyId,
      report_run_id: opts.reportRunId ?? null,
      unit_type_id: opts.unitTypeId ?? null,
      source_type: opts.sourceType,
      file_format: "pdf",
      storage_bucket: SOURCE_BUCKET,
      storage_path: storagePath,
      original_filename: opts.filename,
      byte_size: opts.bytes.byteLength,
      content_type: opts.contentType,
      parse_status: "parsing",
      content_sha256: contentSha,
      parser_version: parserVersion,
      uploaded_by: opts.uploadedBy,
      warnings: [],
      summary_metrics: {},
    })
    .select("*")
    .single();

  if (docError || !document) {
    await opts.supabase.storage.from(SOURCE_BUCKET).remove([storagePath]);
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
    parse = await parseMlsPdfBuffer({
      filename: opts.filename,
      bytes: opts.bytes,
      dialectHint: opts.sourceType,
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
      "Could not parse this MLS PDF. Check the RI/CT export and retry.",
      { documentId: document.id, retryable: true },
    );
  }

  if (opts.extractPhotos !== false) {
    try {
      const withPhotos = await attachMlsPhotoCandidates({
        bytes: opts.bytes,
        listings: parse.listings,
      });
      parse = { ...parse, listings: withPhotos.listings };
    } catch {
      // Photo extraction is best-effort; listings still reviewable.
    }
  }

  const { data: subject } = await opts.supabase
    .from("properties")
    .select("id, address_line1, city, state, postal_code, latitude, longitude")
    .eq("id", opts.propertyId)
    .single();

  const { data: existingComps } = await opts.supabase
    .from("comparable_properties")
    .select("id, name, address_line1, city, state, postal_code, mls_number")
    .eq("subject_property_id", opts.propertyId)
    .eq("is_active", true);

  const known = (existingComps ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    addressRaw: c.address_line1,
    city: c.city,
    state: c.state,
    postalCode: c.postal_code,
    mlsNumber: c.mls_number,
  }));

  const matchSummary = { exact: 0, strong: 0, weak: 0, ambiguous: 0, none: 0 };
  let conflictCount = 0;
  let photoStoredCount = 0;
  let geocodeAttempted = 0;
  let geocodeOk = 0;

  const { data: approvedUnits } = await opts.supabase
    .from("comparable_unit_data")
    .select(
      "id, comparable_property_id, rent_min, rent_max, source_type, status, unit_type_id",
    )
    .eq("organization_id", opts.organizationId)
    .eq("status", "approved");

  const extractionRows: Array<{
    organization_id: string;
    source_document_id: string;
    report_run_id: string | null;
    field_key: string;
    raw_value: string | null;
    normalized_value: Json;
    page_ref: string | null;
    row_ref: string | null;
    confidence: number | null;
    uncertainty_notes: string | null;
    review_status: "pending";
    comparable_property_id: string | null;
  }> = [];

  for (let i = 0; i < parse.listings.length; i++) {
    const listing = parse.listings[i]!;
    const match = matchComparableProperty(
      {
        id: listing.mlsNumber ?? `mls-${i}`,
        name: listingDisplayName(listing),
        addressRaw: listing.addressLine1,
        city: listing.city,
        state: listing.state,
        postalCode: listing.postalCode,
        mlsNumber: listing.mlsNumber,
      },
      known,
    );
    matchSummary[match.confidence] += 1;

    let distanceMiles: number | null = null;
    let distanceFlagged = false;
    let geocodeStatus: string | null = null;

    if (opts.geocodeDistances !== false && listing.addressLine1 && subject) {
      geocodeAttempted += 1;
      const dist = await distanceMilesBetweenAddresses({
        supabase: opts.supabase,
        subject: {
          line1: subject.address_line1,
          city: subject.city,
          state: subject.state,
          postalCode: subject.postal_code,
          latitude: subject.latitude,
          longitude: subject.longitude,
        },
        comparable: {
          line1: listing.addressLine1,
          city: listing.city,
          state: listing.state,
          postalCode: listing.postalCode,
        },
      });
      distanceMiles = dist.miles;
      distanceFlagged = dist.flagged;
      geocodeStatus =
        dist.comparable?.status ?? dist.subject?.status ?? (dist.miles != null ? "ok" : "failed");
      if (dist.miles != null && !dist.flagged) geocodeOk += 1;
    }

    const normalized = listingNormalized(listing, i) as Record<string, unknown>;
    normalized.distanceMiles = distanceMiles;
    normalized.distanceFlagged = distanceFlagged;
    normalized.geocodeStatus = geocodeStatus;
    normalized.match = {
      matchedId: match.matchedId,
      confidence: match.confidence,
      score: match.score,
      reason: match.reason,
      ambiguousIds: match.ambiguousIds,
    };

    const uncertainty = [
      ...listing.flags.map((f) => f.message),
      distanceFlagged ? "Distance geocode uncertain or failed" : null,
      match.confidence === "ambiguous" ? "Address match ambiguous" : null,
    ]
      .filter(Boolean)
      .join("; ");

    extractionRows.push({
      organization_id: opts.organizationId,
      source_document_id: document.id,
      report_run_id: opts.reportRunId ?? null,
      field_key: `mls.listing.${i}`,
      raw_value: listing.rawSnippets[0] ?? null,
      normalized_value: normalized as Json,
      page_ref: listing.pageRefs.join(","),
      row_ref: listing.mlsNumber,
      confidence:
        match.confidence === "exact" || match.confidence === "strong" ? 0.85 : 0.6,
      uncertainty_notes: uncertainty || null,
      review_status: "pending",
      comparable_property_id: match.matchedId,
    });

    // Conflicts vs approved rents when rents differ > $25
    if (listing.listRent != null && match.matchedId) {
      const peers = (approvedUnits ?? []).filter(
        (u) => u.comparable_property_id === match.matchedId && u.rent_min != null,
      );
      for (const peer of peers) {
        const peerRent = Number(peer.rent_min);
        const conflict = detectRentConflict(
          {
            source: peer.source_type || "approved",
            rent: peerRent,
            isRange: peer.rent_max != null && peer.rent_max !== peer.rent_min,
          },
          {
            source: "mls",
            rent: listing.listRent,
          },
        );
        if (!conflict?.exceedsThreshold) continue;
        const { error: conflictError } = await opts.supabase
          .from("source_value_conflicts")
          .insert({
            organization_id: opts.organizationId,
            property_id: opts.propertyId,
            unit_type_id: peer.unit_type_id ?? opts.unitTypeId ?? null,
            comparable_property_id: match.matchedId,
            field_key: "rent",
            left_source: conflict.left.source,
            right_source: conflict.right.source,
            left_value: { rent: conflict.left.rent } as unknown as Json,
            right_value: {
              rent: conflict.right.rent,
              mlsNumber: listing.mlsNumber,
            } as unknown as Json,
            absolute_delta: conflict.absoluteDelta,
            status: "pending",
          });
        if (!conflictError) conflictCount += 1;
      }
    }

    // Store listing photos only when attached to a comparable — never as subject
    // photos. Unmatched MLS listings keep bytes in storage after review creates
    // the comparable; orphan null-comparable rows previously inflated subject
    // photo counts on the PDF ("21 on file").
    if (!match.matchedId) {
      continue;
    }
    const photoJobs = listing.photoCandidates
      .map((photo, photoIndex) => ({ photo, photoIndex }))
      .filter(({ photo }) => !photo.rejectedAsNonProperty);

    const storedFlags = await mapWithConcurrency(
      photoJobs,
      MLS_PHOTO_UPLOAD_CONCURRENCY,
      async ({ photo, photoIndex }) => {
        const png = getPngBytesFromCandidate(photo);
        if (!png || !photo.contentSha256) return false;
        const photoPath = `${opts.organizationId}/properties/${opts.propertyId}/mls/${document.id}/${listing.mlsNumber ?? i}/${photo.contentSha256.slice(0, 16)}.png`;
        try {
          await uploadWithRetry(() =>
            opts.supabase.storage.from(PHOTO_BUCKET).upload(photoPath, png, {
              contentType: "image/png",
              upsert: false,
            }),
          );
        } catch {
          // Per-photo failure must not block the listing review row.
          return false;
        }
        const { error: photoRowError } = await opts.supabase.from("report_photos").insert({
          organization_id: opts.organizationId,
          property_id: opts.propertyId,
          comparable_property_id: match.matchedId,
          report_run_id: opts.reportRunId ?? null,
          source_document_id: document.id,
          source: "mls",
          storage_bucket: PHOTO_BUCKET,
          storage_path: photoPath,
          sort_order: photoIndex,
          content_sha256: photo.contentSha256,
          width: photo.width,
          height: photo.height,
          alt_text: listingDisplayName(listing),
          crop_metadata: { page: photo.page, imageKey: photo.imageKey } as Json,
        });
        return !photoRowError;
      },
    );
    photoStoredCount += storedFlags.filter(Boolean).length;
  }

  // Document summary extraction (not a listing)
  extractionRows.push({
    organization_id: opts.organizationId,
    source_document_id: document.id,
    report_run_id: opts.reportRunId ?? null,
    field_key: "mls.summary",
    raw_value: null,
    normalized_value: {
      ...parse.summary,
      dedupedMlsNumbers: parse.dedupedMlsNumbers,
      listingCount: parse.listings.length,
      warnings: parse.warnings,
    } as unknown as Json,
    page_ref: "1",
    row_ref: null,
    confidence: 0.9,
    uncertainty_notes: null,
    review_status: "pending",
    comparable_property_id: null,
  });

  if (extractionRows.length) {
    const { error: insertError } = await opts.supabase
      .from("extracted_values")
      .insert(extractionRows);
    if (insertError) {
      await opts.supabase
        .from("source_documents")
        .update({
          parse_status: "failed",
          parse_error: insertError.message,
        })
        .eq("id", document.id);
      throw new Error(insertError.message);
    }
  }

  await opts.supabase
    .from("source_documents")
    .update({
      parse_status: "needs_review",
      warnings: [...parse.warnings, ...parse.listings.flatMap((l) => l.flags)] as unknown as Json,
      summary_metrics: {
        dialect: parse.dialect,
        listingCount: parse.listings.length,
        dedupedMlsNumbers: parse.dedupedMlsNumbers,
        averageListRent: parse.summary.averageListRent,
        photoStoredCount,
        geocodeAttempted,
        geocodeOk,
        matchSummary,
        conflictCount,
      } as unknown as Json,
      external_report_id: parse.summary.reportDate,
    })
    .eq("id", document.id);

  return {
    documentId: document.id,
    extractionCount: extractionRows.length,
    listingCount: parse.listings.length,
    matchSummary,
    conflictCount,
    photoStoredCount,
    geocodeAttempted,
    geocodeOk,
    storagePath,
    dialect: parse.dialect,
  };
}
