import { describe, expect, it } from "vitest";
import {
  filterPhotosForGallery,
  mapWithConcurrency,
} from "@/lib/photos/list-filter";

describe("filterPhotosForGallery", () => {
  const rows = [
    { id: "s1", source: "upload", comparable_property_id: null },
    { id: "orphan", source: "mls", comparable_property_id: null },
    { id: "c1", source: "mls", comparable_property_id: "comp-a" },
    { id: "c2", source: "upload", comparable_property_id: "comp-b" },
  ];

  it("returns only subject uploads for the default gallery", () => {
    expect(filterPhotosForGallery(rows, null).map((r) => r.id)).toEqual(["s1"]);
  });

  it("scopes comparable gallery to one comparable id", () => {
    expect(filterPhotosForGallery(rows, "comp-a").map((r) => r.id)).toEqual(["c1"]);
  });

  it("never includes MLS orphans in the subject gallery", () => {
    const flood = Array.from({ length: 120 }, (_, i) => ({
      id: `mls-${i}`,
      source: "mls",
      comparable_property_id: null as string | null,
    }));
    expect(filterPhotosForGallery([...rows, ...flood], null).map((r) => r.id)).toEqual(["s1"]);
  });
});

describe("mapWithConcurrency", () => {
  it("preserves order while limiting concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
