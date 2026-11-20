import { describe, expect, it } from "vitest";
import {
  REPORT_STEPS,
  deriveStepStatus,
  nextRecommendedStep,
  preflightIssues,
  type GuidedWorkflowSignals,
} from "@/lib/reports/guided-workflow";

const base: GuidedWorkflowSignals = {
  hasReportRun: true,
  documentCountForPeriod: 0,
  pendingComparableReviews: 0,
  pendingConflictCount: 0,
  subjectPhotoCount: 0,
  compsWithSelectedPhotos: 0,
  includedComparableCount: 0,
  hasPeriodWeeklyData: false,
  hasRecommendedRange: false,
  narrativeApproved: false,
  narrativeStale: false,
  finalPdfReady: false,
  driveConfigured: false,
  driveSaved: false,
};

describe("guided report workflow", () => {
  it("uses the client addendum nine-step order", () => {
    expect(REPORT_STEPS.map((s) => s.id)).toEqual([
      "upload",
      "comparables",
      "subject-photos",
      "comp-photos",
      "conflicts",
      "weekly",
      "pricing",
      "preview",
      "download",
    ]);
  });

  it("derives completion from persisted signals, not navigation", () => {
    expect(deriveStepStatus("upload", base)).toBe("not_started");
    expect(
      deriveStepStatus("upload", { ...base, documentCountForPeriod: 2 }),
    ).toBe("completed");
    expect(
      deriveStepStatus("comparables", {
        ...base,
        documentCountForPeriod: 1,
        pendingComparableReviews: 2,
      }),
    ).toBe("needs_attention");
    expect(deriveStepStatus("conflicts", base)).toBe("completed");
    expect(
      deriveStepStatus("conflicts", { ...base, pendingConflictCount: 1 }),
    ).toBe("needs_attention");
  });

  it("recommends the first incomplete required step", () => {
    expect(nextRecommendedStep(base)).toBe("upload");
    expect(
      nextRecommendedStep({
        ...base,
        documentCountForPeriod: 1,
        pendingComparableReviews: 3,
      }),
    ).toBe("comparables");
  });

  it("lists preflight issues without inventing values", () => {
    const issues = preflightIssues(base);
    expect(issues.some((i) => /weekly marketing figures/i.test(i))).toBe(true);
    expect(issues.some((i) => /recommended rent range/i.test(i))).toBe(true);
  });
});
