import { describe, expect, it } from "vitest";
import { PROVIDENCE_855_REFERENCE } from "@/data/855-providence-reference";
import {
  isReferenceExcludedAddress,
  reconcile855Candidates,
  suggestedTierForAddress,
} from "@/lib/reports/reconcile-855";

describe("855 Providence reference reconciliation", () => {
  it("inventories 15 included comps and excluded set from the reference PDF", () => {
    expect(PROVIDENCE_855_REFERENCE.included).toHaveLength(15);
    expect(PROVIDENCE_855_REFERENCE.kpis.blendedAverage).toBe(1950);
    expect(PROVIDENCE_855_REFERENCE.subject.recommendationLow).toBe(1925);
    expect(PROVIDENCE_855_REFERENCE.excluded.length).toBeGreaterThanOrEqual(4);
  });

  it("suggests reference tiers and flags excluded HelloData names", () => {
    expect(suggestedTierForAddress("630 Oaklawn Ave")).toBe("strongest");
    expect(suggestedTierForAddress("303 Greenwich Ave")).toBe("moderate");
    expect(suggestedTierForAddress("2494 Cranston St a")).toBe("context");
    expect(isReferenceExcludedAddress("Chateau Regale Apartments")).toBe(true);
  });

  it("marks unmatched MLS comps and pending rentometer rows without auto-approving", () => {
    const matrix = reconcile855Candidates([
      {
        id: "e1",
        kind: "extraction",
        fieldKey: "candidate.row.8",
        reviewStatus: "pending",
        addressLine1: "630 Oaklawn Ave",
        rent: 2055,
        sqft: 886,
      },
      {
        id: "u1",
        kind: "unit_data",
        unitStatus: "approved",
        matchTier: null,
        addressLine1: "2494 Cranston St a",
        rentMin: 1480,
        rentMax: 1480,
        sourceType: "rentometer",
      },
      {
        id: "u2",
        kind: "unit_data",
        unitStatus: "approved",
        addressLine1: "40 Sachem Drive",
        name: "Chateau Regale Apartments",
        sourceType: "hellodata",
      },
    ]);

    const oaklawn = matrix.included.find((r) => r.referenceKey === "630-oaklawn");
    expect(oaklawn?.matchQuality).toBe("exact");
    expect(oaklawn?.requiredHumanAction).toMatch(/Accept/i);

    const mls = matrix.included.find((r) => r.referenceKey === "22-agnes");
    expect(mls?.matchQuality).toBe("unmatched");
    expect(mls?.requiredHumanAction).toMatch(/MLS/i);

    const excluded = matrix.excluded.find((r) => r.referenceKey === "hd-no-2br");
    expect(excluded?.currentApprovalStatus).toMatch(/WARNING/i);
    expect(matrix.summary.wronglyApprovedExcluded).toBeGreaterThanOrEqual(1);
  });
});
