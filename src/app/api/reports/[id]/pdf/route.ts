import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";
import { assembleReportPayload } from "@/lib/reports/assemble";
import { evaluatePdfFinalization } from "@/lib/pdf/finalization";
import { renderCanonicalReportPdf } from "@/lib/pdf/render";
import {
  uploadGeneratedReportPdf,
} from "@/lib/pdf/storage";
import { loadReportPhotoDataUrls } from "@/lib/photos/load-for-pdf";
import { isLiveMode } from "@/lib/supabase/env";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Draft/preview PDF from live assembly.
 * Always allowed as draft; never silently finalizes without approved comps.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    if (!isLiveMode()) throw validationError("This action isn't available right now. Please try again later.");
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();

    const { data: report, error } = await supabase
      .from("report_runs")
      .select("id, organization_id, status")
      .eq("id", id)
      .maybeSingle();
    if (error) throw validationError("Failed to load report", error.message);
    if (!report) throw notFoundError("Report not found");
    await requireOrgMembership(supabase, user, report.organization_id);

    const body = await request.json().catch(() => ({}));
    const requestedMode = body?.mode === "final" ? "final" : "draft";
    const store = body?.store === true;

    const payload = await assembleReportPayload(supabase, id);
    const check = evaluatePdfFinalization(payload);
    if (requestedMode === "final" && !check.ok) {
      throw validationError("Final PDF blocked", {
        blockers: check.blockers,
        hint: "Use mode=draft for incomplete reports, or approve comps + narrative first",
      });
    }

    const photoDataUrls = await loadReportPhotoDataUrls(
      supabase,
      payload.property.photos ?? [],
    );

    const rendered = await renderCanonicalReportPdf({
      payload,
      mode: requestedMode,
      photoDataUrls,
    });

    let stored: { bucket: string; path: string } | null = null;
    if (store) {
      stored = await uploadGeneratedReportPdf({
        supabase,
        organizationId: report.organization_id,
        reportRunId: id,
        version: 0,
        mode: requestedMode,
        bytes: rendered.bytes,
      });
    }

    // Return base64 for authenticated clients (no public URL).
    const base64 = Buffer.from(rendered.bytes).toString("base64");
    return jsonOk({
      mode: rendered.mode,
      engine: rendered.engine,
      pageCount: rendered.pageCount,
      contentType: "application/pdf",
      filename: `PKL-${payload.property.name.replace(/\s+/g, "-")}-${rendered.mode}.pdf`,
      pdfBase64: base64,
      finalization: check,
      stored,
      note:
        requestedMode === "draft"
          ? "Draft PDF rendered from live assembly; not a finalized snapshot PDF"
          : "Final-mode PDF rendered from live assembly (prefer /pdf/finalize for snapshot-backed finals)",
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** Finalization readiness for UI without generating bytes. */
export async function GET(_request: Request, context: RouteContext) {
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

    const payload = await assembleReportPayload(supabase, id);
    const check = evaluatePdfFinalization(payload);
    return jsonOk({
      assemblyStatus: payload.status,
      finalization: check,
      recommendedRent: {
        low: payload.pricing.recommendedRentLow,
        high: payload.pricing.recommendedRentHigh,
      },
      eligibleGroupedCount: payload.pricing.stats.eligibleGroupedCount,
      narrativeStatus: payload.narrative.document?.status ?? null,
      stale: payload.narrative.stale,
    });
  } catch (error) {
    return jsonError(error);
  }
}
