import { describe, expect, it } from "vitest";
import {
  humanCandidateLabel,
  resolveCandidateRent,
} from "@/lib/comparables/candidate-display";

describe("candidate display", () => {
  it("never surfaces internal extraction keys as property names", () => {
    const { label, missingIdentity } = humanCandidateLabel(
      { name: null, address: null },
      "candidate.row.9",
    );
    expect(label).not.toMatch(/candidate\.row/);
    expect(missingIdentity).toBe(true);
  });

  it("prefers address over field keys", () => {
    const { label, missingIdentity } = humanCandidateLabel(
      { name: null, address: { line1: "100 Example St" } },
      "candidate.row.2",
    );
    expect(label).toBe("100 Example St");
    expect(missingIdentity).toBe(false);
  });

  it("resolves HelloData rent from unitTypes for the focus beds", () => {
    const { rent, missingRent, missingTargetUnitType } = resolveCandidateRent(
      {
        unitTypes: [
          { beds: 2, rent: 2400 },
          { beds: 1, rent: 1850 },
        ],
      },
      1,
    );
    expect(rent).toBe(1850);
    expect(missingRent).toBe(false);
    expect(missingTargetUnitType).toBe(false);
  });

  it("flags missing target unit type distinctly", () => {
    const { missingRent, missingTargetUnitType } = resolveCandidateRent(
      { unitTypes: [{ beds: 2, rent: 2400 }] },
      1,
    );
    expect(missingRent).toBe(true);
    expect(missingTargetUnitType).toBe(true);
  });
});
