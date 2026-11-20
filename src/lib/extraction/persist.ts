import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/domain/database.types";
import { validationError } from "@/lib/api/errors";
import { markSourceDocumentFailed } from "@/lib/uploads/lifecycle";
import { sha256Hex } from "./hash";
import { applyExtractedSubjectIdentity } from "./apply-subject-identity";
import { extractListingUrlsFromText } from "./listing-links";
import { normalizeAddress } from "./normalize";
import {
  parseRentometerPdfBuffer,
  parseRentometerTabular,
} from "./index";
import type {
  RentometerCandidate,
  RentometerParseResult,
  RentometerSourceType,
} from "./types";
import { RENTOMETER_PARSER_VERSION } from "./types";
import { sanitizeStorageFilename } from "./normalize";

const BUCKET = "source-documents";

type Client = SupabaseClient<Database>;

function candidateNormalized(candidate: RentometerCandidate): Json {
  return {
    name: candidate.name,
    address: candidate.address,
    rent: candidate.rent,
    sqft: candidate.sqft,
    psf: candidate.psf,
    beds: candidate.beds,
    baths: candidate.baths,
    distanceMiles: candidate.distanceMiles,
    propertyType: candidate.propertyType,
    listDate: candidate.listDate,
    outlier: candidate.outlier,
    listingUrl: candidate.listingUrl,
    websiteUrl: candidate.listingUrl,
    isSubjectLikely: candidate.isSubjectLikely,
    isBlankRow: candidate.isBlankRow,
    includeAsCompCandidate: candidate.includeAsCompCandidate,
    flags: candidate.flags,
  } as unknown as Json;
}

async function findPriorApprovedAddressNotes(
  supabase: Client,
  organizationId: string,
  propertyId: string,
  addressNormalized: string | null,
): Promise<string | null> {
  if (!addressNormalized) return null;

  const { data: docs } = await supabase
    .from("source_documents")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("property_id", propertyId)
    .in("source_type", ["rentometer_csv", "rentometer_xlsx", "rentometer_pdf"]);

  const docIds = (docs ?? []).map((d) => d.id);
  if (!docIds.length) return null;

  const { data: prior } = await supabase
    .from("extracted_values")
    .select("id, normalized_value, review_status")
    .in("source_document_id", docIds)
    .in("review_status", ["accepted", "overridden"])
    .like("field_key", "candidate.%");

  for (const row of prior ?? []) {
    const normalized = row.normalized_value as { address?: { normalized?: string } } | null;
    if (normalized?.address?.normalized === addressNormalized) {
      return `Prior ${row.review_status} decision exists for this address; new extraction left pending and was not auto-applied`;
    }
  }
  return null;
}

export async function persistRentometerParse(opts: {
  supabase: Client;
  organizationId: string;
  propertyId: string;
  reportRunId?: string | null;
  unitTypeId?: string | null;
  sourceType: RentometerSourceType;
  filename: string;
  contentType: string | null;
  bytes: Uint8Array;
  uploadedBy: string;
  subjectAddress?: string | null;
  replaceDocumentId?: string | null;
}): Promise<{
  documentId: string;
  parse: RentometerParseResult;
  extractionCount: number;
  storagePath: string;
}> {
  const contentSha = sha256Hex(opts.bytes);
  const safeName = sanitizeStorageFilename(opts.filename);
  const storagePath = `${opts.organizationId}/properties/${opts.propertyId}/rentometer/${Date.now()}-${safeName}`;

  const upload = await opts.supabase.storage
    .from(BUCKET)
    .upload(storagePath, opts.bytes, {
      contentType: opts.contentType ?? "application/octet-stream",
      upsert: false,
    });

  if (upload.error) {
    throw validationError(`Storage upload failed: ${upload.error.message}`);
  }

  const fileFormat =
    opts.sourceType === "rentometer_csv"
      ? "csv"
      : opts.sourceType === "rentometer_xlsx"
        ? "xlsx"
        : "pdf";

  const { data: document, error: docError } = await opts.supabase
    .from("source_documents")
    .insert({
      organization_id: opts.organizationId,
      property_id: opts.propertyId,
      report_run_id: opts.reportRunId ?? null,
      unit_type_id: opts.unitTypeId ?? null,
      source_type: opts.sourceType,
      file_format: fileFormat,
      storage_bucket: BUCKET,
      storage_path: storagePath,
      original_filename: opts.filename,
      byte_size: opts.bytes.byteLength,
      content_type: opts.contentType,
      parse_status: "parsing",
      content_sha256: contentSha,
      parser_version: RENTOMETER_PARSER_VERSION,
      uploaded_by: opts.uploadedBy,
      warnings: [],
      summary_metrics: {},
    })
    .select("*")
    .single();

  if (docError || !document) {
    await opts.supabase.storage.from(BUCKET).remove([storagePath]);
    throw validationError(docError?.message ?? "Failed to create source document record");
  }

  if (opts.replaceDocumentId) {
    await opts.supabase
      .from("source_documents")
      .update({ superseded_by: document.id })
      .eq("id", opts.replaceDocumentId)
      .eq("organization_id", opts.organizationId);
  }

  let parse: RentometerParseResult;
  try {
    if (opts.sourceType === "rentometer_pdf") {
      parse = await parseRentometerPdfBuffer({
        filename: opts.filename,
        bytes: opts.bytes,
      });
    } else if (opts.sourceType === "rentometer_csv") {
      const text = new TextDecoder("utf-8").decode(opts.bytes);
      parse = parseRentometerTabular({
        filename: opts.filename,
        sourceType: "rentometer_csv",
        text,
        subjectAddress: opts.subjectAddress,
      });
    } else {
      parse = parseRentometerTabular({
        filename: opts.filename,
        sourceType: "rentometer_xlsx",
        buffer: opts.bytes.buffer.slice(
          opts.bytes.byteOffset,
          opts.bytes.byteOffset + opts.bytes.byteLength,
        ) as ArrayBuffer,
        subjectAddress: opts.subjectAddress,
      });
    }
  } catch (error) {
    await markSourceDocumentFailed(
      opts.supabase,
      document.id,
      error instanceof Error ? error.message : "Parse failed",
    );
    throw validationError(
      "Could not parse this Rentometer file. Check the export format and retry.",
      { documentId: document.id, retryable: true },
    );
  }

  if (
    parse.kind === "tabular" &&
    parse.warnings.some((w) => w.code === "unsupported_layout")
  ) {
    await markSourceDocumentFailed(
      opts.supabase,
      document.id,
      "Unsupported Rentometer tabular layout",
      {
        warnings: parse.warnings as unknown as Json,
        externalReportId: parse.reportIdFromFilename,
      },
    );
    throw validationError(
      "This file doesn’t match a supported Rentometer layout. Use an official Rentometer CSV/XLSX/PDF export and try again.",
      { documentId: document.id, retryable: true },
    );
  }

  const extractionRows: Database["public"]["Tables"]["extracted_values"]["Insert"][] =
    [];

  if (parse.kind === "tabular") {
    for (const candidate of parse.candidates) {
      const priorNote = await findPriorApprovedAddressNotes(
        opts.supabase,
        opts.organizationId,
        opts.propertyId,
        candidate.address?.normalized ?? null,
      );
      extractionRows.push({
        organization_id: opts.organizationId,
        source_document_id: document.id,
        report_run_id: opts.reportRunId ?? null,
        field_key: `candidate.row.${candidate.rowIndex}`,
        raw_value: JSON.stringify(candidate.raw),
        normalized_value: candidateNormalized(candidate),
        confidence: candidate.includeAsCompCandidate ? 0.9 : 0.4,
        uncertainty_notes: [
          ...candidate.flags.map((f) => f.message),
          priorNote,
        ]
          .filter(Boolean)
          .join("; ") || null,
        row_ref: candidate.rowRef,
        review_status: "pending",
      });
    }
  } else {
    extractionRows.push({
      organization_id: opts.organizationId,
      source_document_id: document.id,
      report_run_id: opts.reportRunId ?? null,
      field_key: "summary.metrics",
      raw_value: parse.textExcerpt,
      normalized_value: parse.summary as unknown as Json,
      confidence: 0.85,
      uncertainty_notes:
        "PDF summary statistics only — not curated approved-comp KPIs",
      page_ref: "1",
      review_status: "pending",
    });
    for (const listing of parse.supplementalListings) {
      extractionRows.push({
        organization_id: opts.organizationId,
        source_document_id: document.id,
        report_run_id: opts.reportRunId ?? null,
        field_key: `pdf.supplemental.${listing.rowRef}`,
        raw_value: JSON.stringify(listing.raw),
        normalized_value: candidateNormalized(listing),
        confidence: 0.55,
        uncertainty_notes:
          "PDF listing table is supplementary reference; not an approved comparable",
        page_ref: listing.rowRef,
        row_ref: listing.rowRef,
        review_status: "pending",
      });
    }
  }

  if (extractionRows.length) {
    const { error: extractError } = await opts.supabase
      .from("extracted_values")
      .insert(extractionRows);
    if (extractError) {
      await markSourceDocumentFailed(
        opts.supabase,
        document.id,
        extractError.message,
      );
      throw validationError(
        "Could not save extracted candidates from this file. Retry the upload.",
        { documentId: document.id, retryable: true },
      );
    }
  }

  const summaryMetrics =
    parse.kind === "pdf" ? (parse.summary as unknown as Json) : {};
  const externalReportId =
    parse.kind === "pdf"
      ? parse.summary.reportId ?? parse.reportIdFromFilename
      : parse.reportIdFromFilename;

  await opts.supabase
    .from("source_documents")
    .update({
      parse_status: "needs_review",
      parse_error: null,
      warnings: parse.warnings as unknown as Json,
      summary_metrics: summaryMetrics,
      external_report_id: externalReportId,
      parser_version: RENTOMETER_PARSER_VERSION,
    })
    .eq("id", document.id);

  if (parse.kind === "pdf" && parse.summary.subjectAddressRaw) {
    await applyExtractedSubjectIdentity({
      supabase: opts.supabase,
      propertyId: opts.propertyId,
      organizationId: opts.organizationId,
      proposal: {
        address: normalizeAddress(parse.summary.subjectAddressRaw),
        listingLinks: extractListingUrlsFromText(parse.textExcerpt ?? ""),
      },
    });
  }

  return {
    documentId: document.id,
    parse,
    extractionCount: extractionRows.length,
    storagePath,
  };
}
