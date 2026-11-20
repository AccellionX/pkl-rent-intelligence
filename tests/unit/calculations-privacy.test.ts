import { describe, expect, it } from "vitest";
import { computeApprovedCompStats, flagRentDelta } from "@/lib/calculations";
import {
  assertNoClientProspectPii,
  scanClientReportPayload,
} from "@/lib/privacy/client-report-payload";

describe("calculation stubs and privacy guards", () => {
  it("flags rent deltas above $25", () => {
    const flag = flagRentDelta("Rentometer", 2100, "HelloData", 2130);
    expect(flag.exceedsThreshold).toBe(true);
    expect(flag.absoluteDelta).toBe(30);
  });

  it("does not flag exact $25", () => {
    const flag = flagRentDelta("Rentometer", 2100, "HelloData", 2125);
    expect(flag.exceedsThreshold).toBe(false);
  });

  it("returns empty stats for empty approved sets (formulas implemented)", () => {
    const stats = computeApprovedCompStats([]);
    expect(stats.eligibleGroupedCount).toBe(0);
    expect(stats.blendedAverageRent).toBeNull();
    expect(stats.formulas.blendedAverage).toMatch(/Arithmetic mean/);
  });

  it("detects prospect PII in client payloads", () => {
    const dirty = {
      narrative: "Contact Jane at jane@example.com or 401-555-0100",
      email: "hidden@example.com",
    };
    const result = scanClientReportPayload(dirty);
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(() => assertNoClientProspectPii(dirty)).toThrow(/prospect PII/);
  });

  it("accepts clean client payloads", () => {
    const clean = {
      recommendedLow: 2075,
      recommendedHigh: 2200,
      narrative: "Market rents support the recommended range.",
    };
    expect(scanClientReportPayload(clean).ok).toBe(true);
  });

  it("does not treat private storage paths as phone numbers", () => {
    const withPhotos = {
      property: {
        photoPaths: [
          "684132e2-404a-45ed-941c-f0a2f1c1fdce/properties/be2aeeee-4d8a-480d-90fc-ac8265f15841/manual/1763431645123-task12.jpg",
        ],
        photos: [
          {
            storagePath:
              "684132e2-404a-45ed-941c-f0a2f1c1fdce/properties/be2aeeee-4d8a-480d-90fc-ac8265f15841/reuse/1763431649999-190735ab.jpg",
          },
        ],
      },
    };
    expect(scanClientReportPayload(withPhotos).ok).toBe(true);
  });
});
