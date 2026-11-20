import { describe, expect, it } from "vitest";
import {
  evaluateSignalsReadiness,
  isPreviewComplete,
} from "@/lib/reports/readiness";
import { deriveStepStatus, type GuidedWorkflowSignals } from "@/lib/reports/guided-workflow";

const readyBase: GuidedWorkflowSignals = {
  hasReportRun: true,
  documentCountForPeriod: 2,
  pendingComparableReviews: 0,
  pendingConflictCount: 0,
  subjectPhotoCount: 2,
  compsWithSelectedPhotos: 1,
  includedComparableCount: 3,
  hasPeriodWeeklyData: true,
  hasRecommendedRange: true,
  narrativeApproved: true,
  narrativeStale: false,
  finalPdfReady: false,
  driveConfigured: false,
  driveSaved: false,
};

describe("shared report readiness", () => {
  it("does not mark preview complete from narrative alone", () => {
    const narrativeOnly: GuidedWorkflowSignals = {
      ...readyBase,
      pendingComparableReviews: 5,
      includedComparableCount: 0,
      hasPeriodWeeklyData: false,
    };
    expect(isPreviewComplete(narrativeOnly)).toBe(false);
    expect(deriveStepStatus("preview", narrativeOnly)).toBe("not_started");
  });

  it("marks preview complete only when required upstream work is done", () => {
    expect(isPreviewComplete(readyBase)).toBe(true);
    expect(deriveStepStatus("preview", readyBase)).toBe("completed");
  });

  it("treats missing weekly as acknowledgeable warning, not silent", () => {
    const missingWeekly = { ...readyBase, hasPeriodWeeklyData: false };
    const blocked = evaluateSignalsReadiness(missingWeekly);
    expect(blocked.canFinalize).toBe(false);
    expect(blocked.warnings.some((w) => w.key === "missing_weekly")).toBe(true);

    const acked = evaluateSignalsReadiness(missingWeekly, ["missing_weekly"]);
    expect(acked.canFinalize).toBe(true);
  });

  it("treats leftover pending comps as acknowledgeable when pricing set exists", () => {
    const pending = evaluateSignalsReadiness({
      ...readyBase,
      pendingComparableReviews: 2,
    });
    expect(pending.warnings.some((w) => w.key === "defer_pending_comps")).toBe(true);
    expect(pending.canFinalize).toBe(false);
    const acked = evaluateSignalsReadiness(
      { ...readyBase, pendingComparableReviews: 2 },
      ["defer_pending_comps"],
    );
    expect(acked.canFinalize).toBe(true);
  });

  it("requires approved comps when the pricing set is empty", () => {
    const empty = evaluateSignalsReadiness({
      ...readyBase,
      includedComparableCount: 0,
      pendingComparableReviews: 2,
    });
    expect(empty.required.some((r) => r.key === "need_approved_comps")).toBe(true);
    expect(empty.canFinalize).toBe(false);
  });

  it("keeps stepper progress and finalization rules aligned on ack keys", () => {
    const signals = {
      ...readyBase,
      hasPeriodWeeklyData: false,
      pendingComparableReviews: 3,
      finalPdfReady: false,
    };
    const readiness = evaluateSignalsReadiness(signals);
    expect(readiness.canFinalize).toBe(false);
    expect(readiness.warnings.map((w) => w.key).sort()).toEqual(
      ["defer_pending_comps", "missing_weekly"].sort(),
    );
    const afterAck = evaluateSignalsReadiness(signals, [
      "missing_weekly",
      "defer_pending_comps",
    ]);
    expect(afterAck.canFinalize).toBe(true);
    // Preview still complete when upstream required work is done (acks are finalization-only).
    expect(isPreviewComplete(signals)).toBe(true);
    expect(deriveStepStatus("download", signals)).not.toBe("completed");
  });
});
