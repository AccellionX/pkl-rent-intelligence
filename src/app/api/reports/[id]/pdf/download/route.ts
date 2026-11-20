import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";
import { createSignedPdfDownloadUrl } from "@/lib/pdf/storage";
import { isLiveMode } from "@/lib/supabase/env";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Authorized short-lived signed URL for a stored private PDF.
 * Never returns a permanent public owner link.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    if (!isLiveMode()) throw validationError("This action isn't available right now. Please try again later.");
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();

    const { data: report, error } = await supabase
      .from("report_runs")
      .select("id, organization_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw validationError("Failed to load report", error.message);
    if (!report) throw notFoundError("Report not found");
    await requireOrgMembership(supabase, user, report.organization_id);

    const url = new URL(request.url);
    const versionParam = url.searchParams.get("version");

    let query = supabase
      .from("report_snapshots")
      .select("id, version, generated_file_bucket, generated_file_path")
      .eq("report_run_id", id)
      .not("generated_file_path", "is", null)
      .order("version", { ascending: false })
      .limit(1);

    if (versionParam) {
      query = supabase
        .from("report_snapshots")
        .select("id, version, generated_file_bucket, generated_file_path")
        .eq("report_run_id", id)
        .eq("version", Number(versionParam))
        .not("generated_file_path", "is", null)
        .limit(1);
    }

    const { data: rows, error: snapErr } = await query;
    if (snapErr) throw validationError("Failed to load snapshot PDF", snapErr.message);
    const snap = rows?.[0];
    if (!snap?.generated_file_path) {
      throw notFoundError("No stored final PDF for this report");
    }
    if (snap.generated_file_bucket && snap.generated_file_bucket !== "generated-reports") {
      throw validationError("Unable to download the report file. Please try again.");
    }

    const signedUrl = await createSignedPdfDownloadUrl({
      supabase,
      path: snap.generated_file_path,
      expiresInSeconds: 600,
    });

    return jsonOk({
      version: snap.version,
      expiresInSeconds: 600,
      signedUrl,
      note: "Short-lived authorized URL — not a public owner report link",
    });
  } catch (error) {
    return jsonError(error);
  }
}
