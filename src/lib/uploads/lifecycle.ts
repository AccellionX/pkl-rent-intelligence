/**
 * Consistent failed-upload lifecycle helpers.
 * Failed documents stay for audit/retry with parse_status=failed;
 * incomplete extraction rows are not left in a reviewable state.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domain/database.types";
import { validationError } from "@/lib/api/errors";

type Client = SupabaseClient<Database>;

export function toUserUploadError(error: unknown, fallback: string): never {
  if (error && typeof error === "object" && "status" in error) throw error;
  const message = error instanceof Error ? error.message : fallback;
  throw validationError(message.slice(0, 500));
}

/** Mark a source document failed and clear any incomplete extraction rows for that document. */
export async function markSourceDocumentFailed(
  supabase: Client,
  documentId: string,
  parseError: string,
  extras?: { warnings?: unknown; externalReportId?: string | null },
): Promise<void> {
  await supabase
    .from("source_documents")
    .update({
      parse_status: "failed",
      parse_error: parseError.slice(0, 4000),
      ...(extras?.warnings != null ? { warnings: extras.warnings as never } : {}),
      ...(extras?.externalReportId !== undefined
        ? { external_report_id: extras.externalReportId }
        : {}),
    })
    .eq("id", documentId);

  // Remove any partial extractions that never reached a reviewable completed parse.
  await supabase
    .from("extracted_values")
    .delete()
    .eq("source_document_id", documentId)
    .eq("review_status", "pending");
}

/**
 * Storage object cleanup only when the document row could not be created
 * or the upload is not useful for audit (pre-document failure).
 */
export async function removeOrphanStorageObject(
  supabase: Client,
  bucket: string,
  storagePath: string,
): Promise<void> {
  try {
    await supabase.storage.from(bucket).remove([storagePath]);
  } catch {
    /* best-effort */
  }
}

/** Stale parsing rows older than maxAgeMs → failed (safe recovery). */
export async function failStaleParsingDocuments(
  supabase: Client,
  organizationId: string,
  propertyId: string,
  maxAgeMs = 30 * 60 * 1000,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const { data } = await supabase
    .from("source_documents")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("property_id", propertyId)
    .eq("parse_status", "parsing")
    .lt("created_at", cutoff);

  const ids = (data ?? []).map((d) => d.id);
  if (!ids.length) return 0;

  await supabase
    .from("source_documents")
    .update({
      parse_status: "failed",
      parse_error: "Processing timed out or was interrupted. Retry the upload.",
    })
    .in("id", ids);

  return ids.length;
}
