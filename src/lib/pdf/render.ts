import type { CanonicalReportPayload } from "@/lib/reports/types";
import { assertNoClientProspectPii } from "@/lib/privacy/client-report-payload";
import { assertCanRenderPdf, type PdfMode } from "./finalization";
import { renderReportPdfWithJsPdf } from "./jspdf-renderer";
import { buildReportHtml } from "./html-template";

export type RenderedReportPdf = {
  bytes: Uint8Array;
  pageCount: number;
  engine: "jspdf" | "playwright";
  mode: PdfMode;
  htmlPreview: string;
};

/**
 * Render a branded PDF from the canonical assembly payload.
 * Default engine: jsPDF (Vercel/Railway compatible, no browser binaries).
 * Optional: PDF_RENDERER=playwright when Chromium is available (local/Railway worker).
 */
export async function renderCanonicalReportPdf(opts: {
  payload: CanonicalReportPayload;
  mode: PdfMode;
  photoDataUrls?: Record<string, string>;
  /** Staff acknowledgments for warn-only readiness items (e.g. missing_weekly). */
  acknowledgedWarningKeys?: string[];
}): Promise<RenderedReportPdf> {
  assertNoClientProspectPii(opts.payload);
  assertCanRenderPdf(opts.payload, opts.mode, opts.acknowledgedWarningKeys ?? []);

  const htmlPreview = buildReportHtml({
    payload: opts.payload,
    mode: opts.mode,
    photoDataUrls: opts.photoDataUrls,
  });

  if (process.env.PDF_RENDERER === "playwright") {
    const { renderReportPdfWithPlaywright } = await import("./playwright-renderer");
    const result = await renderReportPdfWithPlaywright({
      payload: opts.payload,
      mode: opts.mode,
      photoDataUrls: opts.photoDataUrls,
    });
    return {
      bytes: result.bytes,
      pageCount: result.pageCount,
      engine: "playwright",
      mode: opts.mode,
      htmlPreview,
    };
  }

  const result = renderReportPdfWithJsPdf({
    payload: opts.payload,
    mode: opts.mode,
    photoDataUrls: opts.photoDataUrls,
  });
  return {
    bytes: result.bytes,
    pageCount: result.pageCount,
    engine: "jspdf",
    mode: opts.mode,
    htmlPreview,
  };
}
