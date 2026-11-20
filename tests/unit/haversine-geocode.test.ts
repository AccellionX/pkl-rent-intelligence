import { describe, expect, it } from "vitest";
import { haversineMiles } from "@/lib/geo/haversine";
import { buildGeocodeCacheKey } from "@/lib/geo/geocode";

describe("haversineMiles", () => {
  it("computes known Providence→Norwich distance approximately", () => {
    // Providence, RI ≈ 41.8240, -71.4128
    // Norwich, CT ≈ 41.5243, -72.0759
    const miles = haversineMiles(41.824, -71.4128, 41.5243, -72.0759);
    expect(miles).toBeGreaterThan(35);
    expect(miles).toBeLessThan(55);
  });

  it("is deterministic and symmetric", () => {
    const a = haversineMiles(41.82, -71.41, 41.52, -72.08);
    const b = haversineMiles(41.52, -72.08, 41.82, -71.41);
    expect(a).toBe(b);
    expect(haversineMiles(41.82, -71.41, 41.52, -72.08)).toBe(a);
  });

  it("returns ~0 for identical points", () => {
    expect(haversineMiles(41.8, -71.4, 41.8, -71.4)).toBe(0);
  });

  it("rejects invalid coordinates instead of fabricating", () => {
    expect(() => haversineMiles(999, 0, 0, 0)).toThrow(/Invalid coordinates/);
  });
});

describe("geocode cache key", () => {
  it("normalizes addresses for cache hits", () => {
    const a = buildGeocodeCacheKey({
      line1: "10 S. 3rd Avenue",
      city: "Norwich",
      state: "CT",
      postalCode: "06380",
    });
    const b = buildGeocodeCacheKey({
      line1: "10 S 3rd Avenue",
      city: "Norwich",
      state: "CT",
      postalCode: "06380",
    });
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });
});
