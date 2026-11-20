import { describe, expect, it } from "vitest";
import { renderReportPdfWithJsPdf } from "@/lib/pdf/jspdf-renderer";
import type { CanonicalReportPayload } from "@/lib/reports/types";

describe("PDF rent-range chart", () => {
  it("renders chart and market DOM labels from approved values", () => {
    const payload = {
      schemaVersion: 1,
      assembledAt: "2026-11-19T00:00:00.000Z",
      status: "ready",
      organization: { id: "org", name: "PKL" },
      report: {
        id: "r1",
        title: "Test",
        status: "in_progress",
        periodStart: "2026-11-12",
        periodEnd: "2026-11-19",
        preparedBy: "Staff",
        recommendedRentLow: 1750,
        recommendedRentHigh: 1950,
      },
      property: {
        id: "p1",
        name: "Test Property",
        marketingName: null,
        addressLine1: "1 Main",
        addressLine2: null,
        city: "Providence",
        state: "RI",
        postalCode: "02903",
        yearBuilt: null,
        unitCount: null,
        stories: null,
        amenities: ["Gym"],
        listingLinks: {},
        photoPaths: [],
        photos: [],
      },
      unitType: { id: "u1", label: "1 Bedroom", beds: 1, baths: 1, description: null },
      availableUnits: [
        {
          id: "unit1",
          unitNumber: "101",
          sqft: 700,
          askingRent: 1800,
          status: "available",
        },
      ],
      pricing: {
        recommendedRentLow: 1750,
        recommendedRentHigh: 1950,
        recommendationSource: "manual_pkl",
        stats: {
          blendedAverageRent: 2000,
          averagePsf: 2.2,
          rangeLow: 1850,
          rangeHigh: 2200,
          averageDaysOnMarket: 30,
          rentometerSetAverage: 2000,
          hellodataSetAverage: null,
          mlsSetAverage: null,
          eligibleGroupedCount: 2,
          formulas: {
            monthlyRent: "m",
            sameAddress: "s",
            blendedAverage: "b",
            psf: "p",
            rounding: "r",
          },
        },
        chart: {
          subjectRents: [1800],
          compMonthlyRents: [1850, 2200],
          rangeLow: 1850,
          rangeHigh: 2200,
          blendedAverage: 2000,
          recommendedLow: 1750,
          recommendedHigh: 1950,
        },
        marketStats: [
          {
            unitTypeLabel: "1 BRs",
            daysOnMarket: 48,
            askingRent: 2216,
            listings: 24,
            sourceLabel: "HelloData",
          },
        ],
      },
      comparables: {
        approvedIncluded: [
          {
            comparablePropertyId: "c1",
            name: "100 Example",
            addressLine1: "100 Example",
            city: "Providence",
            state: "RI",
            matchTier: "moderate",
            sourceType: "rentometer",
            rentMin: 1850,
            rentMax: 1850,
            monthlyRent: 1850,
            sqftMin: 800,
            sqftMax: 800,
            psf: 2.3,
            daysOnMarket: 12,
            distanceMiles: 1,
            notes: null,
            photoPaths: [],
            includedInStats: true,
            exclusionReason: null,
          },
        ],
        approvedExcludedFromStats: [],
        rejectedOrUnreviewedOmittedCount: 0,
        methodology: ["Staff-approved comps only."],
      },
      weekly: {
        scopeNote: "Weekly platform metrics are property-wide, not unit-type allocations.",
        weeks: [],
        latestWeek: null,
      },
      quality: {
        pendingConflictCount: 0,
        blockedComparableCount: 0,
        missingUnitTypeCount: 0,
        warnings: [],
        blockers: [],
        provenance: [],
      },
      narrative: {
        document: {
          schemaVersion: 1,
          status: "approved",
          sections: {
            pricingExplanation: "Approved narrative.",
            compComparison: "",
            marketContext: "",
            weeklyPerformance: "",
            suggestedActions: "",
          },
          originalSections: {
            pricingExplanation: "Approved narrative.",
            compComparison: "",
            marketContext: "",
            weeklyPerformance: "",
            suggestedActions: "",
          },
          inputFingerprint: "fp",
          model: null,
          generatedAt: "2026-11-19T00:00:00.000Z",
          approvedAt: "2026-11-19T00:00:00.000Z",
          approvedBy: "user",
          editedBy: null,
          userEdited: false,
          agentWeeklyCommentsRef: null,
          warnings: [],
        },
        stale: false,
        inputFingerprint: "fp",
      },
      privacyNote: "Prospect contact details are not included in owner reports.",
    } as unknown as CanonicalReportPayload;

    const { bytes, pageCount } = renderReportPdfWithJsPdf({
      payload,
      mode: "final",
    });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(pageCount).toBeGreaterThanOrEqual(1);
    const latin = Buffer.from(bytes).toString("latin1");
    expect(latin).toMatch(/Rent comparison/);
    expect(latin).toMatch(/Pricing methodology/);
    expect(latin).toMatch(/Unit-type market averages/);
    expect(latin).toMatch(/48/);
    expect(latin).not.toMatch(/Eligible groups/);
    expect(latin).not.toMatch(/candidate\.row/);
  });

  it("explains empty comparable chart instead of subject-only bars", () => {
    const payload = {
      schemaVersion: 1,
      assembledAt: "2026-11-19T00:00:00.000Z",
      status: "ready",
      organization: { id: "org", name: "PKL" },
      report: {
        id: "r1",
        title: "Test",
        status: "in_progress",
        periodStart: "2026-11-03",
        periodEnd: "2026-11-10",
        preparedBy: "Staff",
        recommendedRentLow: null,
        recommendedRentHigh: null,
      },
      property: {
        id: "p1",
        name: "Test Property",
        marketingName: null,
        addressLine1: "1 Main",
        addressLine2: null,
        city: "Providence",
        state: "RI",
        postalCode: "02903",
        yearBuilt: null,
        unitCount: null,
        stories: null,
        amenities: [],
        listingLinks: {},
        photoPaths: [],
        photos: [],
      },
      unitType: { id: "u1", label: "2 Bedroom", beds: 2, baths: 1, description: null },
      availableUnits: [
        {
          id: "unit1",
          unitNumber: "7",
          sqft: 900,
          askingRent: 2000,
          status: "available",
        },
      ],
      pricing: {
        recommendedRentLow: null,
        recommendedRentHigh: null,
        recommendationSource: "manual_pkl",
        stats: {
          blendedAverageRent: null,
          averagePsf: null,
          rangeLow: null,
          rangeHigh: null,
          averageDaysOnMarket: null,
          rentometerSetAverage: null,
          hellodataSetAverage: null,
          mlsSetAverage: null,
          eligibleGroupedCount: 0,
          formulas: {
            monthlyRent: "m",
            sameAddress: "s",
            blendedAverage: "b",
            psf: "p",
            rounding: "r",
          },
        },
        chart: {
          subjectRents: [2000],
          compMonthlyRents: [],
          rangeLow: null,
          rangeHigh: null,
          blendedAverage: null,
          recommendedLow: null,
          recommendedHigh: null,
        },
        marketStats: [],
      },
      comparables: {
        approvedIncluded: [],
        approvedExcludedFromStats: [],
        rejectedOrUnreviewedOmittedCount: 0,
        methodology: [],
      },
      weekly: {
        scopeNote: "Weekly platform metrics are property-wide, not unit-type allocations.",
        weeks: [],
        latestWeek: null,
      },
      quality: {
        pendingConflictCount: 0,
        blockedComparableCount: 0,
        missingUnitTypeCount: 0,
        warnings: [],
        blockers: [],
        provenance: [],
      },
      narrative: {
        document: null,
        stale: false,
        inputFingerprint: "fp",
      },
      privacyNote: "Prospect contact details are not included in owner reports.",
    } as unknown as CanonicalReportPayload;

    const { bytes } = renderReportPdfWithJsPdf({ payload, mode: "draft" });
    const latin = Buffer.from(bytes).toString("latin1");
    expect(latin).toMatch(/Comparable rent comparison will appear/);
    expect(latin).not.toMatch(/Comparable rents \(navy\)/);
  });
});
