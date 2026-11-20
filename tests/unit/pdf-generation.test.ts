import { describe, expect, it } from "vitest";
import { computeApprovedCompStats } from "@/lib/calculations";
import { evaluatePdfFinalization } from "@/lib/pdf/finalization";
import { renderReportPdfWithJsPdf } from "@/lib/pdf/jspdf-renderer";
import { buildReportHtml } from "@/lib/pdf/html-template";
import { scanClientReportPayload } from "@/lib/privacy/client-report-payload";
import { generatePricingReportPdf } from "@/lib/pdf-report";
import {
  veteransBuilding,
  veteransComparables,
  veteransRecommendation,
  veteransUnits,
} from "@/data/veterans";
import type { CanonicalReportPayload } from "@/lib/reports/types";
import { extractText, getDocumentProxy } from "unpdf";

function incompletePayload(): CanonicalReportPayload {
  const stats = computeApprovedCompStats([]);
  return {
    schemaVersion: 1,
    assembledAt: "2026-11-17T00:00:00.000Z",
    status: "incomplete",
    organization: { id: "org", name: "PKL" },
    report: {
      id: "rep",
      title: "855 Providence 2BR",
      status: "in_progress",
      periodStart: "2026-11-03",
      periodEnd: "2026-11-10",
      preparedBy: "PKL",
      recommendedRentLow: 1925,
      recommendedRentHigh: 2000,
    },
    property: {
      id: "prop",
      name: "855 Providence St",
      marketingName: null,
      addressLine1: "855 Providence St",
      addressLine2: null,
      city: "West Warwick",
      state: "RI",
      postalCode: "02893",
      yearBuilt: 1975,
      stories: 3,
      unitCount: 12,
      amenities: ["In-unit washer/dryer"],
      listingLinks: {},
      photoPaths: [],
    },
    unitType: { id: "ut", label: "2BR", beds: 2, baths: 1, description: null },
    availableUnits: [
      { id: "u7", unitNumber: "7", sqft: 900, askingRent: 2000, status: "available" },
    ],
    pricing: {
      recommendedRentLow: 1925,
      recommendedRentHigh: 2000,
      recommendationSource: "manual_pkl",
      stats,
      chart: {
        subjectRents: [2000],
        compMonthlyRents: [],
        rangeLow: null,
        rangeHigh: null,
        blendedAverage: null,
      },
    },
    comparables: {
      approvedIncluded: [],
      approvedExcludedFromStats: [],
      rejectedOrUnreviewedOmittedCount: 0,
      methodology: ["deterministic"],
    },
    weekly: {
      scopeNote: "Weekly platform metrics are property-wide, not unit-type allocations.",
      weeks: [
        {
          weekStart: "2026-11-04",
          weekEnd: "2026-11-10",
          metricScope: "property",
          zillow: {
            weekly: {
              impressions: 6575,
              listingViews: 237,
              totalLeads: 10,
              phoneLeads: 0,
              emailLeads: 10,
              adImpressions: null,
              adClicks: null,
            },
            listingToDate: {
              impressions: 37419,
              listingViews: 1045,
              totalLeads: 28,
              phoneLeads: null,
              emailLeads: null,
            },
            conversionWeek: 0.0422,
            conversionToDate: 0.0268,
          },
          apartments: {
            phoneCalls: 1,
            emails: 1,
            totalLeads: 2,
            tours: null,
            applications: null,
          },
          agent: {
            toursScheduled: 1,
            toursCompleted: 0,
            applicationsReceived: 0,
            weeklyComments: "Agent notes only",
            prospectFeedbackSummary: null,
            actionsPlannedNextWeek: "Schedule tour",
          },
        },
      ],
      latestWeek: null,
    },
    quality: {
      pendingConflictCount: 0,
      blockedComparableCount: 0,
      missingUnitTypeCount: 0,
      warnings: ["No eligible approved comps"],
      blockers: [],
      provenance: [],
    },
    narrative: {
      document: {
        schemaVersion: 1,
        status: "approved",
        sections: {
          pricingExplanation: "PKL recommends $1,925–$2,000.",
          compComparison: "No eligible comps yet.",
          marketContext: "West Warwick 2BR context.",
          weeklyPerformance: "10 Zillow leads this week.",
          suggestedActions: "Schedule tour.",
        },
        originalSections: {
          pricingExplanation: "PKL recommends $1,925–$2,000.",
          compComparison: "No eligible comps yet.",
          marketContext: "West Warwick 2BR context.",
          weeklyPerformance: "10 Zillow leads this week.",
          suggestedActions: "Schedule tour.",
        },
        inputFingerprint: "abc1234567890fingerprint",
        model: "deterministic-test-draft",
        generatedAt: "2026-11-17T12:00:00.000Z",
        approvedAt: "2026-11-17T12:05:00.000Z",
        approvedBy: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        editedBy: null,
        userEdited: false,
        agentWeeklyCommentsRef: "Agent notes only",
        warnings: [],
      },
      stale: false,
      inputFingerprint: "abc1234567890fingerprint",
    },
    privacyNote:
      "Prospect names, emails, and phone numbers are excluded from this payload and from Claude prompts",
  };
}

describe("PDF generation (Task #10)", () => {
  it("blocks finalization when eligible approved comps are zero", () => {
    const payload = incompletePayload();
    payload.weekly.latestWeek = payload.weekly.weeks[0]!;
    const check = evaluatePdfFinalization(payload);
    expect(check.ok).toBe(false);
    expect(check.modeAllowed).toEqual(["draft"]);
    expect(check.blockers.join(" ")).toMatch(/approved comparable/i);
  });

  it("renders a draft Letter PDF with DRAFT label and weekly figures", async () => {
    const payload = incompletePayload();
    payload.weekly.latestWeek = payload.weekly.weeks[0]!;
    const { bytes, pageCount } = renderReportPdfWithJsPdf({
      payload,
      mode: "draft",
    });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(pageCount).toBeGreaterThanOrEqual(1);

    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const joined = Array.isArray(text) ? text.join("\n") : String(text);
    expect(joined).toMatch(/DRAFT/);
    expect(joined).toMatch(/855 Providence/);
    expect(joined).toMatch(/1,925|1925/);
    expect(joined).toMatch(/6575|6,575/);
    expect(joined).toMatch(/Agent notes only/);
    expect(joined).not.toMatch(/jane@example\.com/i);
  });

  it("HTML template escapes unsafe markup from narrative text", () => {
    const payload = incompletePayload();
    payload.weekly.latestWeek = payload.weekly.weeks[0]!;
    payload.narrative.document!.sections.pricingExplanation =
      "<script>alert(1)</script> Hold current asking through month-end.";
    const html = buildReportHtml({ payload, mode: "draft" });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("rejects client payloads that still contain prospect PII", () => {
    const payload = incompletePayload();
    const dirty = {
      ...payload,
      weekly: {
        ...payload.weekly,
        weeks: [
          {
            ...payload.weekly.weeks[0]!,
            agentNotes: "Call jane@example.com at 401-555-0100",
          },
        ],
      },
    };
    expect(scanClientReportPayload(dirty).ok).toBe(false);
    expect(scanClientReportPayload(payload).violations).toEqual([]);
  });

  it("keeps Veterans demo fixture available for secondary regression", () => {
    expect(veteransBuilding.name).toMatch(/Veterans/i);
    expect(veteransRecommendation.low).toBeLessThanOrEqual(veteransRecommendation.high);
    expect(veteransComparables.length).toBeGreaterThan(0);
    expect(veteransUnits.some((u) => u.status === "available")).toBe(true);
    expect(typeof generatePricingReportPdf).toBe("function");
  });
});
