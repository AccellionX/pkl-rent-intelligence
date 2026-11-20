import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domain/database.types";

export const GENERATED_REPORTS_BUCKET = "generated-reports";

type Client = SupabaseClient<Database>;

export function generatedReportStoragePath(opts: {
  organizationId: string;
  reportRunId: string;
  version: number;
  mode: "draft" | "final";
}): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${opts.organizationId}/reports/${opts.reportRunId}/${opts.mode}-v${opts.version}-${stamp}.pdf`;
}

export async function uploadGeneratedReportPdf(opts: {
  supabase: Client;
  organizationId: string;
  reportRunId: string;
  version: number;
  mode: "draft" | "final";
  bytes: Uint8Array;
}): Promise<{ bucket: string; path: string }> {
  const path = generatedReportStoragePath(opts);
  const upload = await opts.supabase.storage
    .from(GENERATED_REPORTS_BUCKET)
    .upload(path, opts.bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (upload.error) {
    throw new Error(`PDF storage upload failed: ${upload.error.message}`);
  }
  return { bucket: GENERATED_REPORTS_BUCKET, path };
}

/**
 * Attach final PDF path to an existing snapshot without mutating payload.
 * Only generated_file_* fields are updatable per immutability trigger design.
 */
export async function attachPdfToSnapshot(opts: {
  supabase: Client;
  snapshotId: string;
  bucket: string;
  path: string;
}): Promise<void> {
  const { error } = await opts.supabase
    .from("report_snapshots")
    .update({
      generated_file_bucket: opts.bucket,
      generated_file_path: opts.path,
    })
    .eq("id", opts.snapshotId);
  if (error) {
    throw new Error(`Failed to attach PDF to snapshot: ${error.message}`);
  }
}

export async function createSignedPdfDownloadUrl(opts: {
  supabase: Client;
  path: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const { data, error } = await opts.supabase.storage
    .from(GENERATED_REPORTS_BUCKET)
    .createSignedUrl(opts.path, opts.expiresInSeconds ?? 60 * 10);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to create signed PDF URL");
  }
  return data.signedUrl;
}
