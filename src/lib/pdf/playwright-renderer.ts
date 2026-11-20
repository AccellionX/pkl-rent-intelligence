import type { CanonicalReportPayload } from "@/lib/reports/types";
import type { PdfMode } from "./finalization";
import { buildReportHtml } from "./html-template";

/**
 * Optional Playwright HTML→PDF path.
 * Not assumed available on Vercel. Prefer Railway worker in production:
 * see docs in TASK_10_PDF_GENERATION_REPORT.md.
 *
 * Enable locally with PDF_RENDERER=playwright and playwright installed.
 */
export async function renderReportPdfWithPlaywright(opts: {
  payload: CanonicalReportPayload;
  mode: PdfMode;
  photoDataUrls?: Record<string, string>;
}): Promise<{ bytes: Uint8Array; pageCount: number; engine: "playwright" }> {
  if (process.env.PDF_RENDERER !== "playwright") {
    throw new Error("Playwright renderer disabled (set PDF_RENDERER=playwright)");
  }

  // Dynamic import via Function so TypeScript does not require the optional package.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let playwrightMod: any;
  try {
    const dynamicImport = new Function("m", "return import(m)") as (
      m: string,
    ) => Promise<unknown>;
    playwrightMod = await dynamicImport("playwright");
  } catch {
    throw new Error(
      "playwright package is not installed — use jsPDF renderer or a Railway worker",
    );
  }

  const html = buildReportHtml({
    payload: opts.payload,
    mode: opts.mode,
    photoDataUrls: opts.photoDataUrls,
  });

  const browser = await playwrightMod.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.55in", bottom: "0.55in", left: "0.55in", right: "0.55in" },
    });
    // Page count unknown without parsing; callers may inspect via unpdf.
    return {
      bytes: new Uint8Array(pdfBuffer),
      pageCount: -1,
      engine: "playwright",
    };
  } finally {
    await browser.close();
  }
}
