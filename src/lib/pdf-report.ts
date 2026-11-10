import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Building, Comparable, PricingRecommendation, Unit } from "@/data/types";
import { reportMeta } from "@/data/veterans";
import { formatCurrency, formatPsf } from "./utils";

function money(n: number) {
  return formatCurrency(n);
}

export function generatePricingReportPdf(opts: {
  building: Building;
  units: Unit[];
  comps: Comparable[];
  recommendation: PricingRecommendation;
  preparedBy?: string;
}) {
  const { building, units, comps, recommendation } = opts;
  const preparedBy = opts.preparedBy ?? reportMeta.preparedBy;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;

  // Header bar
  doc.setFillColor(11, 31, 58);
  doc.rect(0, 0, pageWidth, 72, "F");
  doc.setFillColor(201, 162, 39);
  doc.rect(0, 72, pageWidth, 3, "F");

  doc.setTextColor(201, 162, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PKL MANAGEMENT LLC", margin, 28);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(reportMeta.title, margin, 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(220, 226, 235);
  doc.text(
    `${preparedBy}  •  ${reportMeta.preparedDate}  •  Marketed as “${building.marketingName ?? building.name}”`,
    margin,
    64,
  );

  let y = 100;
  doc.setTextColor(11, 31, 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(building.name, margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80, 90, 105);
  doc.text(
    `${building.address}, ${building.city}, ${building.state} ${building.zip}`,
    margin,
    y,
  );
  y += 24;

  // Subject property summary
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 70, 6, 6, "F");
  doc.setTextColor(11, 31, 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Subject property", margin + 14, y + 18);

  const subjectFacts = [
    ["Built", String(building.yearBuilt ?? "—")],
    ["Units / stories", `${building.unitCount} / ${building.stories ?? "—"}`],
    ["Bed / bath", "1 / 1"],
    [
      "Sq ft (available)",
      units.length
        ? `${Math.min(...units.map((u) => u.sqft))}–${Math.max(...units.map((u) => u.sqft))}`
        : "—",
    ],
    [
      "Current asking",
      units.length
        ? `${money(Math.min(...units.map((u) => u.askingRent)))}–${money(Math.max(...units.map((u) => u.askingRent)))}`
        : "—",
    ],
  ];

  let fx = margin + 14;
  subjectFacts.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 110, 125);
    doc.text(label, fx, y + 38);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(11, 31, 58);
    doc.text(value, fx, y + 52);
    fx += 100;
  });
  y += 90;

  // Available units table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(11, 31, 58);
  doc.text("Units currently available", margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Unit", "Bed / bath", "Sq ft", "Available", "Asking rent", "$ / sq ft"]],
    body: units.map((u) => [
      u.unitNumber,
      `${u.beds} bd / ${u.baths} ba`,
      String(u.sqft),
      u.availableDate ? "Now" : "—",
      money(u.askingRent),
      formatPsf(u.askingRent / u.sqft),
    ]),
    styles: { fontSize: 9, cellPadding: 6, textColor: [40, 50, 65] },
    headStyles: {
      fillColor: [11, 31, 58],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;

  // Recommendation
  doc.setFillColor(11, 31, 58);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 56, 6, 6, "F");
  doc.setTextColor(201, 162, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("OUR RECOMMENDATION", margin + 14, y + 18);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(
    `${money(recommendation.low)} – ${money(recommendation.high)} / month`,
    margin + 14,
    y + 40,
  );
  y += 72;

  // KPI strip
  const kpis = [
    ["Blended avg (9 comps)", money(recommendation.blendedAverage)],
    ["Avg rent / sq ft", formatPsf(recommendation.averagePsf)],
    [
      "Comp rent range",
      `${money(recommendation.rangeLow)}–${money(recommendation.rangeHigh)}`,
    ],
    ["Avg 1BR DOM", `${recommendation.avgDaysOnMarket} days`],
  ];
  const kpiW = (pageWidth - margin * 2 - 18) / 4;
  kpis.forEach(([label, value], i) => {
    const x = margin + i * (kpiW + 6);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, kpiW, 48, 4, 4, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 110, 125);
    doc.text(label, x + 8, y + 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(11, 31, 58);
    doc.text(value, x + 8, y + 34);
  });
  y += 64;

  // Narrative
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(11, 31, 58);
  doc.text("Pricing narrative", margin, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 70, 85);
  const narrativeLines = doc.splitTextToSize(
    recommendation.narrative,
    pageWidth - margin * 2,
  );
  doc.text(narrativeLines, margin, y);
  y += narrativeLines.length * 12 + 16;

  // New page for comps
  doc.addPage();
  doc.setFillColor(11, 31, 58);
  doc.rect(0, 0, pageWidth, 48, "F");
  doc.setFillColor(201, 162, 39);
  doc.rect(0, 48, pageWidth, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Comparable properties", margin, 30);

  autoTable(doc, {
    startY: 68,
    margin: { left: margin, right: margin },
    head: [
      [
        "Property",
        "Built",
        "Units",
        "Sq ft",
        "Rent",
        "$/sf",
        "DOM",
        "Dist",
        "Match",
      ],
    ],
    body: comps.map((c) => [
      c.name,
      c.yearBuilt ? String(c.yearBuilt) : "—",
      c.units ? String(c.units) : "—",
      c.sqftMin === c.sqftMax ? String(c.sqftMin) : `${c.sqftMin}–${c.sqftMax}`,
      c.rentMin === c.rentMax
        ? money(c.rentMin)
        : `${money(c.rentMin)}–${money(c.rentMax)}`,
      formatPsf(c.psf),
      c.daysOnMarket != null ? String(c.daysOnMarket) : "—",
      `${c.distanceMiles} mi`,
      c.match,
    ]),
    styles: { fontSize: 8, cellPadding: 5, textColor: [40, 50, 65] },
    headStyles: {
      fillColor: [11, 31, 58],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  let cy = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(11, 31, 58);
  doc.text("What we are doing this week", margin, cy);
  cy += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 70, 85);
  recommendation.actions.forEach((action, idx) => {
    const lines = doc.splitTextToSize(`${idx + 1}. ${action}`, pageWidth - margin * 2);
    doc.text(lines, margin, cy);
    cy += lines.length * 12 + 4;
  });

  cy += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 130, 145);
  const sourceLines = doc.splitTextToSize(
    `Sources: ${reportMeta.sources} Prepared for the owner of ${building.name} by ${reportMeta.company}.`,
    pageWidth - margin * 2,
  );
  doc.text(sourceLines, margin, cy);

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 150, 160);
    doc.text(
      `PKL Rent Intelligence  •  Page ${i} of ${pageCount}`,
      margin,
      doc.internal.pageSize.getHeight() - 24,
    );
    doc.text("CONFIDENTIAL — SAMPLE DEMO", pageWidth - margin - 130, doc.internal.pageSize.getHeight() - 24);
  }

  const filename = `PKL-Pricing-${building.name.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
}
