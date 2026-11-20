import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { CanonicalReportPayload } from "@/lib/reports/types";
import { sectionsToPlainText } from "@/lib/reports/narrative-document";
import { PDF_BRAND } from "./brand";
import type { PdfMode } from "./finalization";
import { money, num, psf } from "./format";

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

function drawHeader(doc: jsPDF, title: string, subtitle: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
  doc.rect(0, 0, w, 56, "F");
  doc.setFillColor(PDF_BRAND.gold.r, PDF_BRAND.gold.g, PDF_BRAND.gold.b);
  doc.rect(0, 56, w, 3, "F");
  doc.setTextColor(PDF_BRAND.gold.r, PDF_BRAND.gold.g, PDF_BRAND.gold.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(PDF_BRAND.company.toUpperCase(), PDF_BRAND.marginPt, 22);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text(title, PDF_BRAND.marginPt, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(220, 226, 235);
  doc.text(subtitle, PDF_BRAND.marginPt, 52);
}

function drawFooters(doc: jsPDF, payload: CanonicalReportPayload, mode: PdfMode) {
  const pageCount = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 150, 160);
    const label = `${payload.property.name} · ${payload.unitType.label} · ${PDF_BRAND.company} · Page ${i} of ${pageCount}`;
    doc.text(label, PDF_BRAND.marginPt, h - 22);
    if (mode === "draft") {
      doc.setTextColor(PDF_BRAND.danger.r, PDF_BRAND.danger.g, PDF_BRAND.danger.b);
      doc.text("DRAFT / INCOMPLETE", w - PDF_BRAND.marginPt - 110, h - 22);
    }
  }
}

function ensureSpace(doc: DocWithTable, y: number, need: number): number {
  const h = doc.internal.pageSize.getHeight();
  if (y + need < h - 40) return y;
  doc.addPage();
  drawHeader(
    doc,
    "Rental Pricing Analysis",
    doc.getNumberOfPages() > 1 ? "Continued" : "",
  );
  return 72;
}

function labelSource(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("rentometer")) return "Rentometer";
  if (s.includes("hellodata") || s.includes("hello")) return "HelloData";
  if (s.includes("mls")) return "MLS";
  return source;
}

function labelMatch(tier: string | null | undefined): string {
  if (tier === "strongest") return "Strongest";
  if (tier === "moderate") return "Moderate";
  if (tier === "context") return "Context";
  return "—";
}

/** Simple rent-range chart from approved payload values only — no invented points. */
function drawRentRangeChart(
  doc: DocWithTable,
  payload: CanonicalReportPayload,
  margin: number,
  contentW: number,
  startY: number,
): number {
  const chart = payload.pricing.chart;
  const comps = chart.compMonthlyRents.filter((n) => Number.isFinite(n));
  const subject = chart.subjectRents.filter((n) => Number.isFinite(n));
  if (comps.length === 0 && subject.length === 0) return startY;

  let y = ensureSpace(doc, startY, 130);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
  doc.text("Rent comparison", margin, y);
  y += 14;

  // Incomplete draft: subject-only is not a market comparison chart.
  if (comps.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(PDF_BRAND.muted.r, PDF_BRAND.muted.g, PDF_BRAND.muted.b);
    const msg = doc.splitTextToSize(
      "Comparable rent comparison will appear here after you review and approve comparable properties. The subject asking rent alone is not shown as a market chart.",
      contentW,
    );
    doc.text(msg, margin, y);
    return y + msg.length * 12 + 8;
  }

  const chartH = 90;
  const chartX = margin;
  const chartY = y;
  const chartW = contentW;

  doc.setDrawColor(230, 234, 240);
  doc.setFillColor(PDF_BRAND.surface.r, PDF_BRAND.surface.g, PDF_BRAND.surface.b);
  doc.roundedRect(chartX, chartY, chartW, chartH, 4, 4, "FD");

  const values = [
    ...comps,
    ...subject,
    chart.rangeLow,
    chart.rangeHigh,
    chart.blendedAverage,
    chart.recommendedLow,
    chart.recommendedHigh,
  ].filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const minV = Math.min(...values) * 0.92;
  const maxV = Math.max(...values) * 1.05;
  const span = Math.max(maxV - minV, 1);
  const barW = Math.min(28, (chartW - 40) / Math.max(comps.length + subject.length, 1));

  const toY = (v: number) => chartY + chartH - 12 - ((v - minV) / span) * (chartH - 28);

  // Recommended range band (light gold outline)
  if (chart.recommendedLow != null && chart.recommendedHigh != null) {
    const y1 = toY(chart.recommendedHigh);
    const y2 = toY(chart.recommendedLow);
    doc.setDrawColor(PDF_BRAND.gold.r, PDF_BRAND.gold.g, PDF_BRAND.gold.b);
    doc.setFillColor(255, 248, 230);
    doc.rect(chartX + 8, y1, chartW - 16, Math.max(y2 - y1, 2), "FD");
  }

  // Comp bars
  comps.forEach((rent, i) => {
    const x = chartX + 16 + i * (barW + 6);
    const top = toY(rent);
    const h = chartY + chartH - 12 - top;
    doc.setFillColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
    doc.rect(x, top, barW, Math.max(h, 1), "F");
  });

  // Subject bars (gold)
  subject.forEach((rent, i) => {
    const x = chartX + 16 + (comps.length + i) * (barW + 6);
    const top = toY(rent);
    const h = chartY + chartH - 12 - top;
    doc.setFillColor(PDF_BRAND.gold.r, PDF_BRAND.gold.g, PDF_BRAND.gold.b);
    doc.rect(x, top, barW, Math.max(h, 1), "F");
  });

  // Blended average line
  if (chart.blendedAverage != null) {
    const ly = toY(chart.blendedAverage);
    doc.setDrawColor(PDF_BRAND.gold.r, PDF_BRAND.gold.g, PDF_BRAND.gold.b);
    doc.setLineWidth(1);
    doc.line(chartX + 8, ly, chartX + chartW - 8, ly);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(PDF_BRAND.muted.r, PDF_BRAND.muted.g, PDF_BRAND.muted.b);
  doc.text(
    `Comparable rents (navy) · Subject asking (gold) · Recommended band ${money(chart.recommendedLow)}–${money(chart.recommendedHigh)} · Blended ${money(chart.blendedAverage)}`,
    margin,
    chartY + chartH + 12,
  );
  return chartY + chartH + 24;
}

/**
 * Deployment-safe Letter PDF renderer driven solely by CanonicalReportPayload.
 * Section order mirrors the 855 Providence reference structure.
 */
export function renderReportPdfWithJsPdf(opts: {
  payload: CanonicalReportPayload;
  mode: PdfMode;
  photoDataUrls?: Record<string, string>;
}): { bytes: Uint8Array; pageCount: number } {
  const { payload, mode } = opts;
  const photoDataUrls = opts.photoDataUrls ?? {};
  const doc = new jsPDF({ unit: "pt", format: PDF_BRAND.pageFormat }) as DocWithTable;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = PDF_BRAND.marginPt;
  const contentW = pageWidth - margin * 2;

  const subtitle = `${payload.property.addressLine1}, ${payload.property.city}, ${payload.property.state} ${payload.property.postalCode} · ${payload.report.periodStart} – ${payload.report.periodEnd} · Prepared by ${payload.report.preparedBy ?? PDF_BRAND.company}`;
  drawHeader(doc, "Rental Pricing Analysis", subtitle);

  let y = 78;
  if (mode === "draft") {
    doc.setFillColor(255, 243, 205);
    doc.rect(0, 59, pageWidth, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(122, 91, 0);
    doc.text("DRAFT / INCOMPLETE — Not a finalized owner report", margin, 71);
    y = 92;
  }

  // --- Page 1 style: subject ---
  doc.setTextColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(payload.property.name, margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(PDF_BRAND.muted.r, PDF_BRAND.muted.g, PDF_BRAND.muted.b);
  doc.text(
    `${payload.unitType.label} · ${payload.unitType.beds} bed / ${payload.unitType.baths} bath`,
    margin,
    y,
  );
  y += 18;

  doc.setFillColor(PDF_BRAND.surface.r, PDF_BRAND.surface.g, PDF_BRAND.surface.b);
  doc.roundedRect(margin, y, contentW, 64, 6, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
  doc.text("Subject property", margin + 12, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(PDF_BRAND.ink.r, PDF_BRAND.ink.g, PDF_BRAND.ink.b);
  doc.text(
    `Built ${num(payload.property.yearBuilt)}  ·  Units/stories ${num(payload.property.unitCount)} / ${num(payload.property.stories)}  ·  Photos: ${payload.property.photoPaths.length ? `${payload.property.photoPaths.length} on file` : "Photo to be added"}`,
    margin + 12,
    y + 34,
  );
  const amenityLine = doc.splitTextToSize(
    `Amenities: ${payload.property.amenities.join(", ") || "—"}`,
    contentW - 24,
  );
  doc.text(amenityLine, margin + 12, y + 50);
  y += 78;

  const subjectPaths = payload.property.photoPaths.slice(0, 3);
  const subjectUrls = subjectPaths
    .map((p) => photoDataUrls[p])
    .filter((u): u is string => Boolean(u));
  if (subjectUrls.length > 0) {
    const gap = 8;
    const imgW =
      subjectUrls.length === 1
        ? Math.min(260, contentW * 0.45)
        : (contentW - gap * (subjectUrls.length - 1)) / subjectUrls.length;
    const imgH = imgW / (4 / 3);
    let x = margin;
    for (const subjectDataUrl of subjectUrls) {
      try {
        const format = subjectDataUrl.includes("image/png") ? "PNG" : "JPEG";
        doc.addImage(subjectDataUrl, format, x, y, imgW, imgH);
      } catch {
        // Keep layout if one image decode fails — never substitute demo art.
      }
      x += imgW + gap;
    }
    y += imgH + 12;
  } else if (!payload.property.photoPaths.length) {
    doc.setDrawColor(184, 192, 204);
    doc.setFillColor(238, 241, 245);
    doc.roundedRect(margin, y, 180, 120, 4, 4, "FD");
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 135);
    doc.text("Photo to be added", margin + 48, y + 64);
    y += 132;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
  doc.text("Where it is listed", margin, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(PDF_BRAND.ink.r, PDF_BRAND.ink.g, PDF_BRAND.ink.b);
  const links = Object.entries(payload.property.listingLinks);
  if (!links.length) {
    doc.text("• No listing links on file", margin, y);
    y += 12;
  } else {
    for (const [k, v] of links) {
      const line = doc.splitTextToSize(`• ${k}: ${v}`, contentW);
      doc.text(line, margin, y);
      y += line.length * 11 + 2;
    }
  }
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Unit currently available", margin, y);
  y += 6;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Unit", "Bed / bath", "Sq ft", "Status", "Asking rent", "$ / sq ft"]],
    body:
      payload.availableUnits.length > 0
        ? payload.availableUnits.map((u) => [
            u.unitNumber,
            `${payload.unitType.beds} bd / ${payload.unitType.baths} ba`,
            num(u.sqft),
            u.status,
            money(u.askingRent),
            u.askingRent != null && u.sqft
              ? psf(u.askingRent / u.sqft)
              : "—",
          ])
        : [["—", "—", "—", "—", "—", "—"]],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: {
      fillColor: [PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b],
      textColor: 255,
    },
    alternateRowStyles: {
      fillColor: [PDF_BRAND.surface.r, PDF_BRAND.surface.g, PDF_BRAND.surface.b],
    },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 18;

  // Recommendation block
  y = ensureSpace(doc, y, 120);
  doc.setFillColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
  doc.roundedRect(margin, y, contentW, 52, 6, 6, "F");
  doc.setTextColor(PDF_BRAND.gold.r, PDF_BRAND.gold.g, PDF_BRAND.gold.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("OUR RECOMMENDATION", margin + 12, y + 16);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text(
    `${money(payload.pricing.recommendedRentLow)} – ${money(payload.pricing.recommendedRentHigh)} / month`,
    margin + 12,
    y + 36,
  );
  y += 66;

  const stats = payload.pricing.stats;
  const kpis: Array<[string, string]> = [
    ["Blended average", money(stats.blendedAverageRent)],
    ["Avg $/sq ft", psf(stats.averagePsf)],
    ["Comp rent range", `${money(stats.rangeLow)}–${money(stats.rangeHigh)}`],
    ["Avg days on market", num(stats.averageDaysOnMarket)],
  ];
  const kpiW = (contentW - 18) / 4;
  kpis.forEach(([label, value], i) => {
    const x = margin + i * (kpiW + 6);
    doc.setFillColor(PDF_BRAND.surface.r, PDF_BRAND.surface.g, PDF_BRAND.surface.b);
    doc.roundedRect(x, y, kpiW, 44, 4, 4, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(PDF_BRAND.muted.r, PDF_BRAND.muted.g, PDF_BRAND.muted.b);
    doc.text(label, x + 6, y + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
    doc.text(value, x + 6, y + 30);
  });
  y += 56;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(PDF_BRAND.muted.r, PDF_BRAND.muted.g, PDF_BRAND.muted.b);
  const sourceAvgLine = doc.splitTextToSize(
    `Source averages — Rentometer ${money(stats.rentometerSetAverage)} · HelloData ${money(stats.hellodataSetAverage)} · MLS ${money(stats.mlsSetAverage)} · Buildings in pricing set ${stats.eligibleGroupedCount}`,
    contentW,
  );
  doc.text(sourceAvgLine, margin, y);
  y += sourceAvgLine.length * 10 + 6;

  // Unit-type market averages (accepted HelloData etc.) — never substitutes listing Avg DOM
  if (payload.pricing.marketStats?.length) {
    y = ensureSpace(doc, y, 40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
    doc.text("Unit-type market averages (reviewed)", margin, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(PDF_BRAND.ink.r, PDF_BRAND.ink.g, PDF_BRAND.ink.b);
    for (const m of payload.pricing.marketStats) {
      const line = `${m.sourceLabel} ${m.unitTypeLabel}: ${m.daysOnMarket != null ? `${m.daysOnMarket} days on market` : "— days on market"}${m.askingRent != null ? ` · asking ${money(m.askingRent)}` : ""}${m.listings != null ? ` · ${m.listings} listings` : ""}`;
      const wrapped = doc.splitTextToSize(line, contentW);
      y = ensureSpace(doc, y, wrapped.length * 11 + 2);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 11 + 2;
    }
    y += 6;
  }

  // Rent-range chart from actual approved values only
  y = drawRentRangeChart(doc, payload, margin, contentW, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
  doc.text("Pricing narrative", margin, y);
  y += 12;
  const narrative = payload.narrative.document
    ? sectionsToPlainText(payload.narrative.document.sections)
    : "Narrative not yet approved.";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(PDF_BRAND.ink.r, PDF_BRAND.ink.g, PDF_BRAND.ink.b);
  const narrativeLines = doc.splitTextToSize(narrative, contentW);
  for (const line of narrativeLines) {
    y = ensureSpace(doc, y, 14);
    doc.text(line, margin, y);
    y += 11;
  }
  y += 14;

  // Methodology
  y = ensureSpace(doc, y, 80);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
  doc.text("Pricing methodology", margin, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(PDF_BRAND.ink.r, PDF_BRAND.ink.g, PDF_BRAND.ink.b);
  for (const step of payload.comparables.methodology) {
    const wrapped = doc.splitTextToSize(`• ${step}`, contentW);
    y = ensureSpace(doc, y, wrapped.length * 11 + 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 11 + 2;
  }
  y += 10;

  // Comp table
  y = ensureSpace(doc, y, 80);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
  doc.text("The comparables side by side", margin, y);
  y += 6;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Property", "Source", "Match", "Sq ft", "Rent", "$/sf", "Days", "Dist"]],
    body:
      payload.comparables.approvedIncluded.length > 0
        ? payload.comparables.approvedIncluded.map((c) => [
            c.name,
            labelSource(c.sourceType),
            labelMatch(c.matchTier),
            c.sqftMin != null && c.sqftMax != null && c.sqftMin !== c.sqftMax
              ? `${c.sqftMin}–${c.sqftMax}`
              : num(c.sqftMin ?? c.sqftMax),
            c.rentMin != null && c.rentMax != null && c.rentMin !== c.rentMax
              ? `${money(c.rentMin)}–${money(c.rentMax)}`
              : money(c.monthlyRent),
            psf(c.psf),
            num(c.daysOnMarket),
            c.distanceMiles != null ? `${c.distanceMiles} mi` : "—",
          ])
        : [["No approved comparables in the pricing set", "—", "—", "—", "—", "—", "—", "—"]],
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: {
      fillColor: [PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b],
      textColor: 255,
    },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 16;

  // Comp cards
  const byTier = {
    strongest: payload.comparables.approvedIncluded.filter((c) => c.matchTier === "strongest"),
    moderate: payload.comparables.approvedIncluded.filter((c) => c.matchTier === "moderate"),
    context: payload.comparables.approvedIncluded.filter((c) => c.matchTier === "context"),
    other: payload.comparables.approvedIncluded.filter(
      (c) => !c.matchTier || !["strongest", "moderate", "context"].includes(c.matchTier),
    ),
  };

  const renderCards = (title: string, comps: typeof payload.comparables.approvedIncluded) => {
    if (!comps.length) return;
    y = ensureSpace(doc, y, 40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
    doc.text(title, margin, y);
    y += 14;
    for (const c of comps) {
      y = ensureSpace(doc, y, 90);
      doc.setDrawColor(230, 234, 240);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, y, contentW, 78, 5, 5, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
      doc.text(`${c.name}  (${c.matchTier ?? "match"})`, margin + 10, y + 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(PDF_BRAND.muted.r, PDF_BRAND.muted.g, PDF_BRAND.muted.b);
      doc.text(
        `${c.addressLine1}, ${c.city}, ${c.state} · ${c.distanceMiles ?? "—"} mi · ${c.sourceType}`,
        margin + 10,
        y + 28,
      );
      doc.setTextColor(PDF_BRAND.ink.r, PDF_BRAND.ink.g, PDF_BRAND.ink.b);
      doc.text(
        `Rent ${money(c.monthlyRent)} · ${psf(c.psf)} · Days on market ${num(c.daysOnMarket)} · Photos: ${c.photoPaths.length ? `${c.photoPaths.length} on file` : "Photo to be added"}`,
        margin + 10,
        y + 42,
      );
      const note = doc.splitTextToSize(c.notes ?? "", contentW - 20);
      if (note.length && note[0]) {
        doc.text(note.slice(0, 2), margin + 10, y + 56);
      }
      y += 88;
    }
  };

  renderCards("Comparable properties — Strongest matches", byTier.strongest);
  renderCards("Moderate matches", byTier.moderate);
  renderCards("Context only", [...byTier.context, ...byTier.other]);

  // Excluded
  y = ensureSpace(doc, y, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
  doc.text("Reviewed and excluded", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(PDF_BRAND.ink.r, PDF_BRAND.ink.g, PDF_BRAND.ink.b);
  const excludedLines = [
    ...payload.comparables.approvedExcludedFromStats.map(
      (c) => `• ${c.name} — ${c.exclusionReason ?? "excluded from stats"}`,
    ),
  ];
  if (payload.comparables.rejectedOrUnreviewedOmittedCount > 0) {
    excludedLines.push(
      `• ${payload.comparables.rejectedOrUnreviewedOmittedCount} listing(s) still awaiting review or excluded earlier were omitted from pricing`,
    );
  }
  if (!excludedLines.length) excludedLines.push("• None listed");
  for (const line of excludedLines) {
    y = ensureSpace(doc, y, 14);
    const wrapped = doc.splitTextToSize(line, contentW);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 11 + 2;
  }

  // Weekly
  y = ensureSpace(doc, y, 100);
  const latest = payload.weekly.latestWeek;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
  doc.text(
    latest
      ? `Weekly listing update — ${latest.weekStart} – ${latest.weekEnd}`
      : "Weekly listing update",
    margin,
    y,
  );
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(PDF_BRAND.muted.r, PDF_BRAND.muted.g, PDF_BRAND.muted.b);
  doc.text(payload.weekly.scopeNote, margin, y);
  y += 10;
  if (latest) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Metric", "This week", "Listing to date"]],
      body: [
        [
          "Zillow impressions",
          num(latest.zillow.weekly.impressions),
          num(latest.zillow.listingToDate.impressions),
        ],
        [
          "Zillow listing views",
          num(latest.zillow.weekly.listingViews),
          num(latest.zillow.listingToDate.listingViews),
        ],
        [
          "Zillow total leads",
          num(latest.zillow.weekly.totalLeads),
          num(latest.zillow.listingToDate.totalLeads),
        ],
        ["Apartments.com phones", num(latest.apartments.phoneCalls), "—"],
        ["Apartments.com emails", num(latest.apartments.emails), "—"],
        [
          "Apartments.com tours / apps",
          `${num(latest.apartments.tours)} / ${num(latest.apartments.applications)}`,
          "—",
        ],
      ],
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: {
        fillColor: [PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b],
        textColor: 255,
      },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 14;

    y = ensureSpace(doc, y, 90);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(PDF_BRAND.navy.r, PDF_BRAND.navy.g, PDF_BRAND.navy.b);
    doc.text("Tours and prospect feedback", margin, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(PDF_BRAND.ink.r, PDF_BRAND.ink.g, PDF_BRAND.ink.b);
    doc.text(
      `Tours scheduled ${num(latest.agent.toursScheduled)} · completed ${num(latest.agent.toursCompleted)} · applications ${num(latest.agent.applicationsReceived)}`,
      margin,
      y,
    );
    y += 12;
    const agentBits = [
      `Agent weekly comments (not AI): ${latest.agent.weeklyComments ?? "—"}`,
      `Prospect feedback summary: ${latest.agent.prospectFeedbackSummary ?? "—"}`,
      `Actions planned: ${latest.agent.actionsPlannedNextWeek ?? "—"}`,
    ];
    for (const bit of agentBits) {
      y = ensureSpace(doc, y, 20);
      const lines = doc.splitTextToSize(bit, contentW);
      doc.text(lines, margin, y);
      y += lines.length * 11 + 4;
    }
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(PDF_BRAND.ink.r, PDF_BRAND.ink.g, PDF_BRAND.ink.b);
    const missingWeek = doc.splitTextToSize(
      `No weekly marketing data for this reporting period (${payload.report.periodStart} – ${payload.report.periodEnd}). Figures from other weeks are not shown as current-week performance.`,
      contentW,
    );
    doc.text(missingWeek, margin, y);
    y += missingWeek.length * 11 + 8;
  }

  y = ensureSpace(doc, y, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(PDF_BRAND.muted.r, PDF_BRAND.muted.g, PDF_BRAND.muted.b);
  const sources = doc.splitTextToSize(
    "Sources and footnotes come from reviewed report inputs. Prospect contact details are not included.",
    contentW,
  );
  doc.text(sources, margin, y);

  drawFooters(doc, payload, mode);
  const arrayBuffer = doc.output("arraybuffer");
  return {
    bytes: new Uint8Array(arrayBuffer),
    pageCount: doc.getNumberOfPages(),
  };
}
