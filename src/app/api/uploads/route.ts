import { requireOrgMembership, requirePropertyAccess } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";
import {
  sourceTypeFromExplicit,
  validateUploadFile,
} from "@/lib/extraction/file-validation";
import { persistHelloDataParse } from "@/lib/extraction/persist-hellodata";
import { persistMlsParse } from "@/lib/extraction/persist-mls";
import { persistRentometerParse } from "@/lib/extraction/persist";
import {
  persistApartmentsWeeklyParse,
  persistZillowWeeklyParse,
} from "@/lib/extraction/persist-weekly";
import { uuidSchema } from "@/domain/schemas";
import { fingerprintPayload, runIdempotent } from "@/lib/api/idempotency";
import { sha256Hex } from "@/lib/extraction/hash";
import { failStaleParsingDocuments } from "@/lib/uploads/lifecycle";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAuth();
    const form = await request.formData();

    const file = form.get("file");
    const sourceTypeRaw = String(form.get("sourceType") ?? "");
    const organizationId = String(form.get("organizationId") ?? "");
    const propertyId = String(form.get("propertyId") ?? "");
    const reportRunId = String(form.get("reportRunId") ?? "") || null;
    const unitTypeId = String(form.get("unitTypeId") ?? "") || null;
    const replaceDocumentId = String(form.get("replaceDocumentId") ?? "") || null;
    const focusBedsRaw = String(form.get("focusBeds") ?? "");
    const focusBeds = focusBedsRaw ? Number(focusBedsRaw) : null;

    if (!(file instanceof File)) {
      throw validationError("file is required");
    }
    if (!uuidSchema.safeParse(organizationId).success) {
      throw validationError("organizationId must be a UUID");
    }
    if (!uuidSchema.safeParse(propertyId).success) {
      throw validationError("propertyId must be a UUID");
    }

    const sourceType = sourceTypeFromExplicit(sourceTypeRaw);
    if (!sourceType) {
      throw validationError(
        "sourceType must be rentometer_csv, rentometer_xlsx, rentometer_pdf, hellodata_pdf, mls_ri_pdf, mls_ct_pdf, zillow_xlsx, or apartments_xlsx",
      );
    }

    await requireOrgMembership(supabase, user, organizationId);
    const access = await requirePropertyAccess(supabase, user, propertyId);
    if (access.organizationId !== organizationId) {
      throw notFoundError("Property not found in organization");
    }

    if (reportRunId) {
      const { data: report } = await supabase
        .from("report_runs")
        .select("id, property_id, organization_id, status")
        .eq("id", reportRunId)
        .maybeSingle();
      if (
        !report ||
        report.property_id !== propertyId ||
        report.organization_id !== organizationId
      ) {
        throw notFoundError("Report run not found for property");
      }
    }

    let focusBedsFromUnitType: number | null = focusBeds;
    if (unitTypeId) {
      const { data: unitType } = await supabase
        .from("unit_types")
        .select("id, property_id, organization_id, beds")
        .eq("id", unitTypeId)
        .maybeSingle();
      if (
        !unitType ||
        unitType.property_id !== propertyId ||
        unitType.organization_id !== organizationId
      ) {
        throw notFoundError("Unit type not found for property");
      }
      focusBedsFromUnitType = Number(unitType.beds);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateUploadFile({
      filename: file.name,
      byteSize: file.size,
      bytes,
      sourceType,
    });
    if (!validation.ok) {
      throw validationError("File validation failed", validation.errors);
    }

    await failStaleParsingDocuments(supabase, organizationId, propertyId);

    const fingerprint = fingerprintPayload([
      "POST /api/uploads",
      organizationId,
      propertyId,
      sourceType,
      sha256Hex(bytes),
      reportRunId,
      unitTypeId,
      replaceDocumentId,
      file.name,
    ]);

    const outcome = await runIdempotent({
      request,
      organizationId,
      userId: user.id,
      route: "POST /api/uploads",
      supabase,
      fingerprint,
      execute: async () => {
        const data = await processValidatedUpload({
          supabase,
          userId: user.id,
          file,
          sourceType,
          organizationId,
          propertyId,
          reportRunId,
          unitTypeId,
          replaceDocumentId,
          focusBedsFromUnitType,
          bytes,
        });
        return { data, status: 201 };
      },
    });
    return jsonOk(outcome.data, { status: outcome.status });
  } catch (error) {
    return jsonError(error);
  }
}

async function processValidatedUpload(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  file: File;
  sourceType: NonNullable<ReturnType<typeof sourceTypeFromExplicit>>;
  organizationId: string;
  propertyId: string;
  reportRunId: string | null;
  unitTypeId: string | null;
  replaceDocumentId: string | null;
  focusBedsFromUnitType: number | null;
  bytes: Uint8Array;
}) {
  const {
    supabase,
    userId,
    file,
    sourceType,
    organizationId,
    propertyId,
    reportRunId,
    unitTypeId,
    replaceDocumentId,
    focusBedsFromUnitType,
    bytes,
  } = opts;
    if (sourceType === "hellodata_pdf") {
      const result = await persistHelloDataParse({
        supabase,
        organizationId,
        propertyId,
        reportRunId,
        unitTypeId,
        filename: file.name,
        contentType: file.type || null,
        bytes,
        uploadedBy: userId,
        replaceDocumentId,
        focusBeds: focusBedsFromUnitType,
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

      return (        {
          document,
          extractions: extractions ?? [],
          parseSummary: {
            kind: "hellodata_pdf",
            extractionCount: result.extractionCount,
            matchSummary: result.matchSummary,
            conflictCount: result.conflictCount,
            storagePath: result.storagePath,
          },
        });
    }

    if (sourceType === "mls_ri_pdf" || sourceType === "mls_ct_pdf") {
      const result = await persistMlsParse({
        supabase,
        organizationId,
        propertyId,
        reportRunId,
        unitTypeId,
        filename: file.name,
        contentType: file.type || null,
        bytes,
        uploadedBy: userId,
        replaceDocumentId,
        sourceType,
        focusBeds: focusBedsFromUnitType,
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

      return (        {
          document,
          extractions: extractions ?? [],
          parseSummary: {
            kind: sourceType,
            dialect: result.dialect,
            extractionCount: result.extractionCount,
            listingCount: result.listingCount,
            matchSummary: result.matchSummary,
            conflictCount: result.conflictCount,
            photoStoredCount: result.photoStoredCount,
            geocodeAttempted: result.geocodeAttempted,
            geocodeOk: result.geocodeOk,
            storagePath: result.storagePath,
          },
        });
    }

    if (sourceType === "zillow_xlsx") {
      const result = await persistZillowWeeklyParse({
        supabase,
        organizationId,
        propertyId,
        reportRunId,
        filename: file.name,
        contentType: file.type || null,
        bytes,
        uploadedBy: userId,
        replaceDocumentId,
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
      return (        {
          document,
          extractions: extractions ?? [],
          parseSummary: {
            kind: "zillow_xlsx",
            dialect: result.parse.dialect,
            snapshotCount: result.parse.snapshots.length,
            weeklyMetricIds: result.weeklyMetricIds,
            warnings: result.parse.warnings,
            storagePath: result.storagePath,
          },
        });
    }

    if (sourceType === "apartments_xlsx") {
      const result = await persistApartmentsWeeklyParse({
        supabase,
        organizationId,
        propertyId,
        reportRunId,
        filename: file.name,
        contentType: file.type || null,
        bytes,
        uploadedBy: userId,
        replaceDocumentId,
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
      return (        {
          document,
          extractions: extractions ?? [],
          parseSummary: {
            kind: "apartments_xlsx",
            dialect: result.parse.dialect,
            weekStart: result.parse.weekStart,
            weekEnd: result.parse.weekEnd,
            phoneCalls: result.parse.phoneCalls,
            emails: result.parse.emails,
            tours: result.parse.tours,
            applications: result.parse.applications,
            weeklyMetricId: result.weeklyMetricId,
            piiColumnsOmitted: result.parse.piiColumnsOmitted,
            warnings: result.parse.warnings,
            storagePath: result.storagePath,
          },
        });
    }

    const { data: property } = await supabase
      .from("properties")
      .select("address_line1, city, state, postal_code")
      .eq("id", propertyId)
      .single();

    const subjectAddress = property
      ? `${property.address_line1}, ${property.city}, ${property.state} ${property.postal_code}`
      : null;

    const result = await persistRentometerParse({
      supabase,
      organizationId,
      propertyId,
      reportRunId,
      unitTypeId,
      sourceType,
      filename: file.name,
      contentType: file.type || null,
      bytes,
      uploadedBy: userId,
      subjectAddress,
      replaceDocumentId,
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
      .order("row_ref", { ascending: true });

    return (      {
        document,
        extractions: extractions ?? [],
        parseSummary: {
          kind: result.parse.kind,
          extractionCount: result.extractionCount,
          warningCount: result.parse.warnings.length,
          storagePath: result.storagePath,
          candidateCount:
            result.parse.kind === "tabular" ? result.parse.candidateCount : 0,
          reportId:
            result.parse.kind === "pdf"
              ? result.parse.summary.reportId
              : result.parse.reportIdFromFilename,
        },
      });

}
