import { describe, expect, it } from "vitest";
import { sortPendingCandidatesForReview } from "@/lib/comparables/review-sort";

describe("sortPendingCandidatesForReview", () => {
  it("surfaces rentometer rows with rent ahead of MLS without matching beds", () => {
    const sorted = sortPendingCandidatesForReview(
      [
        { sourceType: "mls", rent: 1500, beds: 1, id: "mls" },
        { sourceType: "hellodata", rent: null, beds: null, id: "hd" },
        { sourceType: "rentometer", rent: 2000, beds: 2, id: "rm" },
        { sourceType: "rentometer", rent: null, beds: 2, id: "rm-empty" },
      ],
      2,
    );
    expect(sorted.map((r) => r.id)).toEqual(["rm", "mls", "hd", "rm-empty"]);
  });
});
