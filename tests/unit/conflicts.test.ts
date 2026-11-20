import { describe, expect, it } from "vitest";
import { detectNumericConflict, detectRentConflict } from "@/lib/extraction/conflicts";
import { flagRentDelta } from "@/lib/calculations";

describe("$25 rent conflict rule", () => {
  it("does not flag an exact $25 difference", () => {
    const flag = flagRentDelta("Rentometer", 2100, "HelloData", 2125);
    expect(flag.absoluteDelta).toBe(25);
    expect(flag.exceedsThreshold).toBe(false);

    const conflict = detectRentConflict(
      { source: "rentometer", rent: 2100 },
      { source: "hellodata", rent: 2125 },
    );
    expect(conflict).toBeNull();
  });

  it("flags differences strictly greater than $25", () => {
    const conflict = detectRentConflict(
      { source: "rentometer", rent: 2100 },
      { source: "hellodata", rent: 2130 },
    );
    expect(conflict?.exceedsThreshold).toBe(true);
    expect(conflict?.absoluteDelta).toBe(30);
  });

  it("does not auto-compare rent ranges", () => {
    const conflict = detectRentConflict(
      { source: "rentometer", rent: 2100, isRange: true, rentMin: 2000, rentMax: 2200 },
      { source: "hellodata", rent: 2300 },
    );
    expect(conflict?.comparable).toBe(false);
    expect(conflict?.exceedsThreshold).toBe(false);
  });

  it("supports numeric metadata conflicts with thresholds", () => {
    const sqft = detectNumericConflict({
      fieldKey: "sqft",
      leftSource: "rentometer",
      rightSource: "hellodata",
      leftValue: 800,
      rightValue: 900,
      threshold: 50,
    });
    expect(sqft?.exceedsThreshold).toBe(true);
  });
});
