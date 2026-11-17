import { describe, expect, it } from "vitest";
import {
  averageSameAddressUnits,
  computeApprovedCompStats,
  flagRentDelta,
} from "@/lib/calculations";
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

  it("does not flag small rent deltas", () => {
    const flag = flagRentDelta("Rentometer", 2100, "HelloData", 2120);
    expect(flag.exceedsThreshold).toBe(false);
  });

  it("keeps full pricing formulas unimplemented", () => {
    expect(() => averageSameAddressUnits([])).toThrow(/not implemented yet/);
    expect(() => computeApprovedCompStats([])).toThrow(/not implemented yet/);
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
});
