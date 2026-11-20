import { describe, expect, it } from "vitest";
import {
  hrefForReviewSurface,
  isComparableCandidateFieldKey,
  reviewSurfaceForFieldKey,
  summarizePendingBySurface,
} from "@/lib/uploads/review-routing";

describe("extraction review routing", () => {
  it("routes comparable candidates separately from weekly/subject rows", () => {
    expect(reviewSurfaceForFieldKey("hellodata.comp.0")).toBe(
      "comparable_candidates",
    );
    expect(reviewSurfaceForFieldKey("candidate.3")).toBe("comparable_candidates");
    expect(reviewSurfaceForFieldKey("mls.listing.1")).toBe(
      "comparable_candidates",
    );
    expect(reviewSurfaceForFieldKey("hellodata.subject.building.0")).toBe(
      "subject_identity",
    );
    expect(reviewSurfaceForFieldKey("hellodata.market.1BR")).toBe(
      "market_metrics",
    );
    expect(reviewSurfaceForFieldKey("zillow.weekly.snapshot")).toBe(
      "weekly_performance",
    );
    expect(reviewSurfaceForFieldKey("mls.summary")).toBe("mls_summary");
  });

  it("keeps comparable pending counts distinct from total extractions", () => {
    const summary = summarizePendingBySurface([
      { field_key: "hellodata.comp.0" },
      { field_key: "hellodata.subject.building.0" },
      { field_key: "zillow.weekly.0" },
    ]);
    expect(summary.comparable_candidates).toBe(1);
    expect(summary.subject_identity).toBe(1);
    expect(summary.weekly_performance).toBe(1);
    expect(isComparableCandidateFieldKey("hellodata.comp.0")).toBe(true);
    expect(isComparableCandidateFieldKey("zillow.weekly.0")).toBe(false);
  });

  it("provides working review hrefs for each surface", () => {
    expect(
      hrefForReviewSurface({
        propertyId: "prop-1",
        surface: "comparable_candidates",
        documentId: "doc-1",
      }),
    ).toContain("/buildings/prop-1/comparables");
    expect(
      hrefForReviewSurface({
        propertyId: "prop-1",
        surface: "weekly_performance",
        documentId: "doc-2",
      }),
    ).toBe("/buildings/prop-1/leads?documentId=doc-2");
    expect(
      hrefForReviewSurface({
        propertyId: "prop-1",
        surface: "subject_identity",
        documentId: "doc-3",
      }),
    ).toBe("/buildings/prop-1?documentId=doc-3");
  });

  it("never routes Review information back to Data Uploads", () => {
    const href = hrefForReviewSurface({
      propertyId: "prop-1",
      surface: "other",
      documentId: "doc-9",
    });
    expect(href).toContain("/buildings/prop-1");
    expect(href).not.toContain("/upload");
  });
});
