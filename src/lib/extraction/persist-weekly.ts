import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/domain/database.types";
import { sha256Hex } from "./hash";
import { sanitizeStorageFilename } from "./normalize";
import { applyExtractedSubjectIdentity } from "./apply-subject-identity";
import { parseApartmentsXlsxBuffer } from "./apartments-xlsx";
import { parseZillowXlsxBuffer } from "./zillow-xlsx";
import { KNOWN_PROPERTY_ALIASES } from "./weekly-property-match";
import {
  APARTMENTS_PARSER_VERSION,
  ZILLOW_PARSER_VERSION,
  type ApartmentsParseResult,
  type ZillowParseResult,
} from "./weekly-types";

const SOURCE_BUCKET = "source-documents";
type Client = SupabaseClient<Database>;

function aliasesForAddress(addressLine1: string): string[] {
  const key = addressLine1.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  for (const [addr, aliases] of Object.entries(KNOWN_PROPERTY_ALIASES)) {
    if (key.includes(addr) || addr.includes(key)) return aliases;
  }
  // loose 855 / veterans
  if (/855/.test(key) && /providence/.test(key)) {
    return KNOWN_PROPERTY_ALIASES["855 providence st"] ?? [];
  }
  if (/30/.test(key) && /veterans/.test(key)) {
    return KNOWN_PROPERTY_ALIASES["30 veterans memorial parkway"] ?? [];
  }
  return [];
}

async function loadProperty(supabase: Client, propertyId: string) {
  const { data, error } = await supabase
    .from("properties")
    .select("id, organization_id, name, marketing_name, address_line1, city, state")
    .eq("id", propertyId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Property not found");
  return data;
}

export async function persistZillowWeeklyParse(opts: {
  supabase: Client;
  organizationId: string;
  propertyId: string;
  reportRunId?: string | null;
  filename: string;
  contentType: string | null;
  bytes: Uint8Array;
  uploadedBy: string;
  replaceDocumentId?: string | null;
  /** Prefer this week_start when multiple weekly sheets match */
  focusWeekStart?: string | null;
}): Promise<{
  documentId: string;
  parse: ZillowParseResult;
  weeklyMetricIds: string[];
  storagePath: string;
}> {
  const property = await loadProperty(opts.supabase, opts.propertyId);
  const aliases = aliasesForAddress(property.address_line1);
  const parse = parseZillowXlsxBuffer({
    filename: opts.filename,
    bytes: opts.bytes,
    property: {
      name: property.name,
      marketingName: property.marketing_name,
      addressLine1: property.address_line1,
      city: property.city,
      state: property.state,
      aliases,
    },
  });

  const contentSha = sha256Hex(opts.bytes);
  const safeName = sanitizeStorageFilename(opts.filename);
  const storagePath = `${opts.organizationId}/properties/${opts.propertyId}/zillow/${Date.now()}-${safeName}`;

  const upload = await opts.supabase.storage
    .from(SOURCE_BUCKET)
    .upload(storagePath, opts.bytes, {
      contentType:
        opts.contentType ??
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });
  if (upload.error) throw new Error(`Storage upload failed: ${upload.error.message}`);

  const { data: document, error: docError } = await opts.supabase
    .from("source_documents")
    .insert({
      organization_id: opts.organizationId,
      property_id: opts.propertyId,
      report_run_id: opts.reportRunId ?? null,
      source_type: "zillow_xlsx",
      file_format: "xlsx",
      storage_bucket: SOURCE_BUCKET,
      storage_path: storagePath,
      original_filename: opts.filename,
      byte_size: opts.bytes.byteLength,
      content_type: opts.contentType,
      parse_status: "needs_review",
      content_sha256: contentSha,
      parser_version: ZILLOW_PARSER_VERSION,
      uploaded_by: opts.uploadedBy,
      warnings: parse.warnings as unknown as Json,
      summary_metrics: {
        dialect: parse.dialect,
        sheetNames: parse.sheetNames,
        snapshotCount: parse.snapshots.length,
        weeklyCount: parse.snapshots.filter((s) => s.windowType === "last_7_days").length,
        hasListingToDate: Boolean(parse.listingToDate),
      } as unknown as Json,
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

  const extractionRows = parse.snapshots.map((snap, i) => ({
    organization_id: opts.organizationId,
    source_document_id: document.id,
    report_run_id: opts.reportRunId ?? null,
    field_key: `zillow.snapshot.${i}`,
    raw_value: snap.propertyNameRaw,
    normalized_value: snap as unknown as Json,
    page_ref: snap.sheetName,
    row_ref: snap.weekStart ?? snap.windowType,
    confidence: snap.matchConfidence === "exact" || snap.matchConfidence === "strong" ? 0.9 : 0.4,
    uncertainty_notes:
      snap.matchConfidence === "ambiguous" || snap.matchConfidence === "none"
        ? snap.matchReason
        : null,
    review_status: "pending" as const,
  }));

  if (extractionRows.length) {
    const { error } = await opts.supabase.from("extracted_values").insert(extractionRows);
    if (error) {
      await opts.supabase
        .from("source_documents")
        .update({ parse_status: "failed", parse_error: error.message })
        .eq("id", document.id);
      throw new Error(error.message);
    }
  }

  const weeklyMetricIds: string[] = [];
  const weeklySnaps = parse.snapshots.filter(
    (s) =>
      s.windowType === "last_7_days" &&
      s.weekStart &&
      s.weekEnd &&
      (s.matchConfidence === "exact" || s.matchConfidence === "strong"),
  );

  for (const snap of weeklySnaps) {
    if (opts.focusWeekStart && snap.weekStart !== opts.focusWeekStart) continue;
    const zillowMetrics = {
      windowType: snap.windowType,
      asOfDate: snap.asOfDate,
      propertyNameRaw: snap.propertyNameRaw,
      city: snap.city,
      state: snap.state,
      metrics: snap.metrics,
      listingToDate: parse.listingToDate?.metrics ?? null,
      sourceDocumentId: document.id,
      parserVersion: ZILLOW_PARSER_VERSION,
      sheetName: snap.sheetName,
      matchConfidence: snap.matchConfidence,
    };

    const { data: existing } = await opts.supabase
      .from("weekly_metrics")
      .select("id, apartments_metrics, staff_notes, tours_scheduled, tours_completed, applications_received")
      .eq("property_id", opts.propertyId)
      .eq("week_start", snap.weekStart!)
      .maybeSingle();

    if (existing) {
      const { data: updated, error } = await opts.supabase
        .from("weekly_metrics")
        .update({
          week_end: snap.weekEnd!,
          zillow_metrics: zillowMetrics as unknown as Json,
          zillow_document_id: document.id,
          // Preserve apartments + agent fields on re-upload
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      weeklyMetricIds.push(updated.id);
    } else {
      const { data: inserted, error } = await opts.supabase
        .from("weekly_metrics")
        .insert({
          organization_id: opts.organizationId,
          property_id: opts.propertyId,
          week_start: snap.weekStart!,
          week_end: snap.weekEnd!,
          zillow_metrics: zillowMetrics as unknown as Json,
          apartments_metrics: {} as Json,
          zillow_document_id: document.id,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      weeklyMetricIds.push(inserted.id);
    }
  }

  const matchedName = parse.snapshots.find(
    (s) => s.matchConfidence === "exact" || s.matchConfidence === "strong",
  )?.propertyNameRaw;
  if (matchedName) {
    await applyExtractedSubjectIdentity({
      supabase: opts.supabase,
      propertyId: opts.propertyId,
      organizationId: opts.organizationId,
      proposal: { marketingName: matchedName },
    });
  }

  return {
    documentId: document.id,
    parse,
    weeklyMetricIds,
    storagePath,
  };
}

export async function persistApartmentsWeeklyParse(opts: {
  supabase: Client;
  organizationId: string;
  propertyId: string;
  reportRunId?: string | null;
  filename: string;
  contentType: string | null;
  bytes: Uint8Array;
  uploadedBy: string;
  replaceDocumentId?: string | null;
}): Promise<{
  documentId: string;
  parse: ApartmentsParseResult;
  weeklyMetricId: string | null;
  storagePath: string;
}> {
  await loadProperty(opts.supabase, opts.propertyId);
  const parse = parseApartmentsXlsxBuffer({
    filename: opts.filename,
    bytes: opts.bytes,
  });

  const contentSha = sha256Hex(opts.bytes);
  const safeName = sanitizeStorageFilename(opts.filename);
  const storagePath = `${opts.organizationId}/properties/${opts.propertyId}/apartments/${Date.now()}-${safeName}`;

  const upload = await opts.supabase.storage
    .from(SOURCE_BUCKET)
    .upload(storagePath, opts.bytes, {
      contentType:
        opts.contentType ??
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });
  if (upload.error) throw new Error(`Storage upload failed: ${upload.error.message}`);

  const { data: document, error: docError } = await opts.supabase
    .from("source_documents")
    .insert({
      organization_id: opts.organizationId,
      property_id: opts.propertyId,
      report_run_id: opts.reportRunId ?? null,
      source_type: "apartments_xlsx",
      file_format: "xlsx",
      storage_bucket: SOURCE_BUCKET,
      storage_path: storagePath,
      original_filename: opts.filename,
      byte_size: opts.bytes.byteLength,
      content_type: opts.contentType,
      parse_status: "needs_review",
      content_sha256: contentSha,
      parser_version: APARTMENTS_PARSER_VERSION,
      uploaded_by: opts.uploadedBy,
      warnings: parse.warnings as unknown as Json,
      summary_metrics: {
        dialect: parse.dialect,
        weekStart: parse.weekStart,
        weekEnd: parse.weekEnd,
        phoneCalls: parse.phoneCalls,
        emails: parse.emails,
        tours: parse.tours,
        applications: parse.applications,
        totalLeads: parse.totalLeads,
        eventCount: parse.events.length,
        piiColumnsOmitted: parse.piiColumnsOmitted,
      } as unknown as Json,
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

  const { error: extError } = await opts.supabase.from("extracted_values").insert({
    organization_id: opts.organizationId,
    source_document_id: document.id,
    report_run_id: opts.reportRunId ?? null,
    field_key: "apartments.summary",
    raw_value: parse.dateRangeRaw,
    normalized_value: {
      weekStart: parse.weekStart,
      weekEnd: parse.weekEnd,
      totalLeads: parse.totalLeads,
      phoneCalls: parse.phoneCalls,
      emails: parse.emails,
      tours: parse.tours,
      applications: parse.applications,
      propertyNameFromReport: parse.propertyNameFromReport,
      events: parse.events,
      piiColumnsOmitted: parse.piiColumnsOmitted,
      metricScope: "property",
    } as unknown as Json,
    page_ref: "Lead Summary",
    row_ref: parse.weekStart,
    confidence: 0.85,
    uncertainty_notes: parse.warnings.map((w) => w.message).join("; ") || null,
    review_status: "pending",
  });
  if (extError) {
    await opts.supabase
      .from("source_documents")
      .update({ parse_status: "failed", parse_error: extError.message })
      .eq("id", document.id);
    throw new Error(extError.message);
  }

  let weeklyMetricId: string | null = null;
  if (parse.weekStart && parse.weekEnd) {
    const apartmentsMetrics = {
      metrics: {
        totalLeads: parse.totalLeads,
        phoneCalls: parse.phoneCalls,
        emails: parse.emails,
        tours: parse.tours,
        applications: parse.applications,
      },
      events: parse.events,
      propertyNameFromReport: parse.propertyNameFromReport,
      sourceDocumentId: document.id,
      parserVersion: APARTMENTS_PARSER_VERSION,
      dateRangeRaw: parse.dateRangeRaw,
      metricScope: "property",
      weekStartSource: parse.weekStart,
      weekEndSource: parse.weekEnd,
    };

    // Prefer same week_end (Zillow “as of” often aligns to Apartments end date
    // even when Zillow last-7 start is one day off).
    const { data: byEnd } = await opts.supabase
      .from("weekly_metrics")
      .select("id, week_start, zillow_metrics")
      .eq("property_id", opts.propertyId)
      .eq("week_end", parse.weekEnd)
      .maybeSingle();
    const { data: byStart } = byEnd
      ? { data: null }
      : await opts.supabase
          .from("weekly_metrics")
          .select("id, week_start, zillow_metrics")
          .eq("property_id", opts.propertyId)
          .eq("week_start", parse.weekStart)
          .maybeSingle();
    const existing = byEnd ?? byStart;

    if (existing) {
      const { data: updated, error } = await opts.supabase
        .from("weekly_metrics")
        .update({
          // Keep canonical week_start if Zillow already created the row
          week_end: parse.weekEnd,
          apartments_metrics: apartmentsMetrics as unknown as Json,
          apartments_document_id: document.id,
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      weeklyMetricId = updated.id;
    } else {
      const { data: inserted, error } = await opts.supabase
        .from("weekly_metrics")
        .insert({
          organization_id: opts.organizationId,
          property_id: opts.propertyId,
          week_start: parse.weekStart,
          week_end: parse.weekEnd,
          zillow_metrics: {} as Json,
          apartments_metrics: apartmentsMetrics as unknown as Json,
          apartments_document_id: document.id,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      weeklyMetricId = inserted.id;
    }
  }

  if (parse.propertyNameFromReport) {
    await applyExtractedSubjectIdentity({
      supabase: opts.supabase,
      propertyId: opts.propertyId,
      organizationId: opts.organizationId,
      proposal: { marketingName: parse.propertyNameFromReport },
    });
  }

  return {
    documentId: document.id,
    parse,
    weeklyMetricId,
    storagePath,
  };
}
