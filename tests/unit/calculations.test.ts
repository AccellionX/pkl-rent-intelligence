import { describe, expect, it } from "vitest";
import {
  averageSameAddressUnits,
  computeApprovedCompStats,
  flagRentDelta,
  isValidRent,
  isValidSqft,
  monthlyComparableRent,
  rentPerSquareFoot,
} from "@/lib/calculations";
import {
  assertNoClientProspectPii,
  scanClientReportPayload,
} from "@/lib/privacy/client-report-payload";

describe("deterministic approved-comp calculations", () => {
  it("flags rent deltas above $25 but not exact $25", () => {
    expect(flagRentDelta("A", 2100, "B", 2130).exceedsThreshold).toBe(true);
    expect(flagRentDelta("A", 2100, "B", 2125).exceedsThreshold).toBe(false);
  });

  it("computes monthly rent midpoint for ranges and rejects invalid rents", () => {
    expect(monthlyComparableRent(2000, 2200)).toBe(2100);
    expect(monthlyComparableRent(2050, 2050)).toBe(2050);
    expect(monthlyComparableRent(null, null)).toBeNull();
    expect(isValidRent(0)).toBe(false);
    expect(isValidRent(-100)).toBe(false);
  });

  it("never fabricates $/sqft from missing or invalid sqft", () => {
    expect(rentPerSquareFoot(2100, null)).toBeNull();
    expect(isValidSqft(50)).toBe(false);
    expect(rentPerSquareFoot(2100, 50)).toBeNull();
    expect(rentPerSquareFoot(2100, 700)).toBe(3);
  });

  it("groups same-address units as one comparable without merging different buildings", () => {
    const grouped = averageSameAddressUnits([
      {
        addressKey: "100 harbor view",
        buildingKey: "b1",
        unitTypeKey: "1br",
        rent: 2000,
        sqft: 800,
        daysOnMarket: 10,
      },
      {
        addressKey: "100 harbor view",
        buildingKey: "b1",
        unitTypeKey: "1br",
        rent: 2200,
        sqft: 820,
        daysOnMarket: 20,
      },
      {
        addressKey: "100 harbor view",
        buildingKey: "b2-different-building",
        unitTypeKey: "1br",
        rent: 2500,
        sqft: 900,
        daysOnMarket: 15,
      },
    ]);
    expect(grouped).toHaveLength(2);
    const sameBuilding = grouped.find((g) => g.buildingKey === "b1")!;
    expect(sameBuilding.rent).toBe(2100);
    expect(sameBuilding.unitCount).toBe(2);
  });

  it("computes blended / source averages only from eligible approved rows", () => {
    const stats = computeApprovedCompStats([
      {
        comparablePropertyId: "a",
        addressKey: "addr-a",
        buildingKey: "a",
        unitTypeKey: "1br",
        source: "rentometer",
        rentMin: 2000,
        rentMax: 2000,
        sqftMin: 800,
        sqftMax: 800,
        psf: 2.5,
        daysOnMarket: 12,
        distanceMiles: 0.5,
        matchTier: "strongest",
        hasAvailableData: true,
      },
      {
        comparablePropertyId: "b",
        addressKey: "addr-b",
        buildingKey: "b",
        unitTypeKey: "1br",
        source: "hellodata",
        rentMin: 2200,
        rentMax: 2200,
        sqftMin: 850,
        sqftMax: 850,
        psf: 2.59,
        daysOnMarket: 18,
        distanceMiles: 0.8,
        matchTier: "moderate",
        hasAvailableData: true,
      },
      {
        comparablePropertyId: "c",
        addressKey: "addr-c",
        buildingKey: "c",
        unitTypeKey: "1br",
        source: "rentometer",
        rentMin: 9999,
        rentMax: 9999,
        sqftMin: null,
        sqftMax: null,
        psf: null,
        daysOnMarket: null,
        distanceMiles: null,
        matchTier: "context",
        hasAvailableData: true,
        eligibleForStats: false, // unresolved conflict
      },
      {
        comparablePropertyId: "d",
        addressKey: "addr-d",
        buildingKey: "d",
        unitTypeKey: "1br",
        source: "hellodata",
        rentMin: null,
        rentMax: null,
        sqftMin: null,
        sqftMax: null,
        psf: null,
        daysOnMarket: null,
        distanceMiles: null,
        matchTier: "moderate",
        hasAvailableData: false, // missing unit type
      },
    ]);

    expect(stats.eligibleGroupedCount).toBe(2);
    expect(stats.blendedAverageRent).toBe(2100);
    expect(stats.rangeLow).toBe(2000);
    expect(stats.rangeHigh).toBe(2200);
    expect(stats.rentometerSetAverage).toBe(2000);
    expect(stats.hellodataSetAverage).toBe(2200);
    expect(stats.averageDaysOnMarket).toBe(15);
  });

  it("keeps prospect PII out of client payloads", () => {
    const dirty = {
      narrative: "Contact Jane at jane@example.com or 401-555-0100",
    };
    expect(scanClientReportPayload(dirty).ok).toBe(false);
    expect(() => assertNoClientProspectPii(dirty)).toThrow(/prospect PII/);
    expect(
      scanClientReportPayload({
        recommendedLow: 2075,
        narrative: "Market rents support the recommended range.",
      }).ok,
    ).toBe(true);
  });
});
