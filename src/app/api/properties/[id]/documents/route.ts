import { requirePropertyAccess } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { validationError } from "@/lib/api/errors";
import {
  labelDocumentCenterStatus,
  labelParseStatus,
  labelSourceType,
} from "@/lib/ui/status-labels";
import {
  hrefForReviewSurface,
  isComparableCandidateFieldKey,
  labelReviewSurface,
  primaryReviewSurface,
  summarizePendingBySurface,
} from "@/lib/uploads/review-routing";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    await requirePropertyAccess(supabase, user, propertyId);

    const { data: documents, error } = await supabase
      .from("source_documents")
      .select(
        "id, original_filename, source_type, property_id, unit_type_id, report_run_id, created_at, parse_status, parse_error, summary_metrics, byte_size, storage_path",
      )
      .eq("property_id", propertyId)
      .is("superseded_by", null)
      .order("created_at", { ascending: false });

    if (error) {
      throw validationError("Failed to list documents", error.message);
    }

    const docIds = (documents ?? []).map((d) => d.id);
    const { data: extractions } =
      docIds.length > 0
        ? await supabase
            .from("extracted_values")
            .select("id, source_document_id, field_key, review_status")
            .in("source_document_id", docIds)
        : { data: [] as Array<{
            id: string;
            source_document_id: string;
            field_key: string;
            review_status: string;
          }> };

    const byDoc = new Map<
      string,
      Array<{ field_key: string; review_status: string }>
    >();
    for (const row of extractions ?? []) {
      const list = byDoc.get(row.source_document_id) ?? [];
      list.push(row);
      byDoc.set(row.source_document_id, list);
    }

    const enriched = (documents ?? []).map((doc) => {
      const rows = byDoc.get(doc.id) ?? [];
      const pending = rows.filter((r) => r.review_status === "pending");
      const pendingBySurface = summarizePendingBySurface(pending);
      const comparablePending = pending.filter((r) =>
        isComparableCandidateFieldKey(r.field_key),
      ).length;
      const primarySurface = primaryReviewSurface(pendingBySurface);

      const remainingReviewCount = pending.length;
      return {
        id: doc.id,
        originalFilename: doc.original_filename,
        sourceType: doc.source_type,
        sourceTypeLabel: labelSourceType(doc.source_type),
        propertyId: doc.property_id,
        unitTypeId: doc.unit_type_id,
        reportRunId: doc.report_run_id,
        uploadedAt: doc.created_at,
        parseStatus: doc.parse_status,
        parseStatusLabel: labelParseStatus(doc.parse_status),
        statusLabel: labelDocumentCenterStatus({
          parseStatus: doc.parse_status,
          remainingReviewCount,
        }),
        parseError: doc.parse_error,
        extractedRowCount: rows.length,
        remainingReviewCount,
        comparablePendingCount: comparablePending,
        pendingBySurface,
        primaryReviewSurface: primarySurface,
        primaryReviewLabel: labelReviewSurface(primarySurface),
        reviewHref: hrefForReviewSurface({
          propertyId,
          surface: primarySurface,
          documentId: doc.id,
          reportRunId: doc.report_run_id,
          unitTypeId: doc.unit_type_id,
        }),
        summaryMetrics: doc.summary_metrics,
        byteSize: doc.byte_size,
        hasOriginalFile: Boolean(doc.storage_path),
        isPropertyLevel: !doc.report_run_id,
      };
    });

    const totalPendingReview = enriched.reduce(
      (sum, d) => sum + d.remainingReviewCount,
      0,
    );

    return jsonOk({
      documents: enriched,
      totalPendingReview,
    });
  } catch (error) {
    return jsonError(error);
  }
}
