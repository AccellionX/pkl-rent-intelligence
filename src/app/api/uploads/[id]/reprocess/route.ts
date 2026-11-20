import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";
import { persistHelloDataParse } from "@/lib/extraction/persist-hellodata";
import { persistMlsParse } from "@/lib/extraction/persist-mls";
import { persistRentometerParse } from "@/lib/extraction/persist";
import {
  persistApartmentsWeeklyParse,
  persistZillowWeeklyParse,
} from "@/lib/extraction/persist-weekly";
import type { RentometerSourceType } from "@/lib/extraction/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();

    const { data: existing, error } = await supabase
      .from("source_documents")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw validationError("Failed to load document", error.message);
    if (!existing) throw notFoundError("Document not found");

    await requireOrgMembership(supabase, user, existing.organization_id);

    const supported =
      existing.source_type === "rentometer_csv" ||
      existing.source_type === "rentometer_xlsx" ||
      existing.source_type === "rentometer_pdf" ||
      existing.source_type === "hellodata_pdf" ||
      existing.source_type === "mls_ri_pdf" ||
      existing.source_type === "mls_ct_pdf" ||
      existing.source_type === "zillow_xlsx" ||
      existing.source_type === "apartments_xlsx";

    if (!supported) {
      throw validationError(
        "Only Rentometer, HelloData, MLS, Zillow, and Apartments.com documents can be reprocessed",
      );
    }

    const downloaded = await supabase.storage
      .from(existing.storage_bucket)
      .download(existing.storage_path);

    if (downloaded.error || !downloaded.data) {
      throw validationError(
        "Could not download stored file for reprocessing",
        downloaded.error?.message,
      );
    }

    const buffer = new Uint8Array(await downloaded.data.arrayBuffer());

    if (existing.source_type === "zillow_xlsx") {
      const result = await persistZillowWeeklyParse({
        supabase,
        organizationId: existing.organization_id,
        propertyId: existing.property_id,
        reportRunId: existing.report_run_id,
        filename: existing.original_filename,
        contentType: existing.content_type,
        bytes: buffer,
        uploadedBy: user.id,
        replaceDocumentId: existing.id,
      });
      const { data: document } = await supabase
        .from("source_documents")
        .select("*")
        .eq("id", result.documentId)
        .single();
      return jsonOk({
        replacedDocumentId: existing.id,
        document,
        parseSummary: {
          kind: "zillow_xlsx",
          weeklyMetricIds: result.weeklyMetricIds,
        },
      });
    }

    if (existing.source_type === "apartments_xlsx") {
      const result = await persistApartmentsWeeklyParse({
        supabase,
        organizationId: existing.organization_id,
        propertyId: existing.property_id,
        reportRunId: existing.report_run_id,
        filename: existing.original_filename,
        contentType: existing.content_type,
        bytes: buffer,
        uploadedBy: user.id,
        replaceDocumentId: existing.id,
      });
      const { data: document } = await supabase
        .from("source_documents")
        .select("*")
        .eq("id", result.documentId)
        .single();
      return jsonOk({
        replacedDocumentId: existing.id,
        document,
        parseSummary: {
          kind: "apartments_xlsx",
          weeklyMetricId: result.weeklyMetricId,
        },
      });
    }

    if (
      existing.source_type === "hellodata_pdf" ||
      existing.source_type === "mls_ri_pdf" ||
      existing.source_type === "mls_ct_pdf"
    ) {
      let focusBeds: number | null = null;
      if (existing.unit_type_id) {
        const { data: unitType } = await supabase
          .from("unit_types")
          .select("beds")
          .eq("id", existing.unit_type_id)
          .maybeSingle();
        focusBeds = unitType ? Number(unitType.beds) : null;
      }

      if (existing.source_type === "hellodata_pdf") {
        const result = await persistHelloDataParse({
          supabase,
          organizationId: existing.organization_id,
          propertyId: existing.property_id,
          reportRunId: existing.report_run_id,
          unitTypeId: existing.unit_type_id,
          filename: existing.original_filename,
          contentType: existing.content_type,
          bytes: buffer,
          uploadedBy: user.id,
          replaceDocumentId: existing.id,
          focusBeds,
        });

        const { data: document } = await supabase
          .from("source_documents")
          .select("*")
          .eq("id", result.documentId)
          .single();

        const { data: extractions } = await supabase
          .from("extracted_values")
          .select("*")
          .eq("source_document_id", result.documentId)
          .order("created_at", { ascending: true });

        return jsonOk({
          replacedDocumentId: existing.id,
          document,
          extractions: extractions ?? [],
          matchSummary: result.matchSummary,
          conflictCount: result.conflictCount,
          note: "Prior review decisions were not overwritten; new candidates remain pending; finalized snapshots unchanged",
        });
      }

      const result = await persistMlsParse({
        supabase,
        organizationId: existing.organization_id,
        propertyId: existing.property_id,
        reportRunId: existing.report_run_id,
        unitTypeId: existing.unit_type_id,
        filename: existing.original_filename,
        contentType: existing.content_type,
        bytes: buffer,
        uploadedBy: user.id,
        replaceDocumentId: existing.id,
        sourceType: existing.source_type,
        focusBeds,
      });

      const { data: document } = await supabase
        .from("source_documents")
        .select("*")
        .eq("id", result.documentId)
        .single();

      const { data: extractions } = await supabase
        .from("extracted_values")
        .select("*")
        .eq("source_document_id", result.documentId)
        .order("created_at", { ascending: true });

      return jsonOk({
        replacedDocumentId: existing.id,
        document,
        extractions: extractions ?? [],
        matchSummary: result.matchSummary,
        conflictCount: result.conflictCount,
        listingCount: result.listingCount,
        photoStoredCount: result.photoStoredCount,
        note: "Prior review decisions were not overwritten; new candidates remain pending; finalized snapshots unchanged",
      });
    }

    const { data: property } = await supabase
      .from("properties")
      .select("address_line1, city, state, postal_code")
      .eq("id", existing.property_id)
      .single();

    const subjectAddress = property
      ? `${property.address_line1}, ${property.city}, ${property.state} ${property.postal_code}`
      : null;

    const result = await persistRentometerParse({
      supabase,
      organizationId: existing.organization_id,
      propertyId: existing.property_id,
      reportRunId: existing.report_run_id,
      unitTypeId: existing.unit_type_id,
      sourceType: existing.source_type as RentometerSourceType,
      filename: existing.original_filename,
      contentType: existing.content_type,
      bytes: buffer,
      uploadedBy: user.id,
      subjectAddress,
      replaceDocumentId: existing.id,
    });

    const { data: document } = await supabase
      .from("source_documents")
      .select("*")
      .eq("id", result.documentId)
      .single();

    const { data: extractions } = await supabase
      .from("extracted_values")
      .select("*")
      .eq("source_document_id", result.documentId)
      .order("created_at", { ascending: true });

    return jsonOk({
      replacedDocumentId: existing.id,
      document,
      extractions: extractions ?? [],
      note: "Prior review decisions were not overwritten; new candidates remain pending",
    });
  } catch (error) {
    return jsonError(error);
  }
}
