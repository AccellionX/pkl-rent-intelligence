/**
 * Shared report readiness model for stepper, progress, preview, and finalization.
 * Classifies items as required | optional | warning (ackable).
 */

import type { GuidedWorkflowSignals, ReportStepId } from "@/lib/reports/guided-workflow";
import type { CanonicalReportPayload } from "@/lib/reports/types";

export type ReadinessClass = "required" | "optional" | "warning";

export type ReadinessItem = {
  key: string;
  class: ReadinessClass;
  message: string;
  stepId?: ReportStepId;
  /** When true, staff may acknowledge and proceed past this warning. */
  acknowledgeable?: boolean;
};

export type ReportReadiness = {
  canApproveNarrative: boolean;
  canFinalize: boolean;
  required: ReadinessItem[];
  warnings: ReadinessItem[];
  optional: ReadinessItem[];
  /** Keys that still block finalization after acknowledgments. */
  blockingKeys: string[];
  progressPercent: number;
};

const REQUIRED_STEPS_FOR_PREVIEW: ReportStepId[] = [
  "comparables",
  "conflicts",
  "pricing",
];

export function evaluateSignalsReadiness(
  signals: GuidedWorkflowSignals,
  acknowledgedKeys: string[] = [],
): ReportReadiness {
  const required: ReadinessItem[] = [];
  const warnings: ReadinessItem[] = [];
  const optional: ReadinessItem[] = [];
  const ack = new Set(acknowledgedKeys);

  if (!signals.hasReportRun) {
    required.push({
      key: "start_report",
      class: "required",
      message: "Start a report for this property, unit type, and reporting period.",
      stepId: "upload",
    });
    return {
      canApproveNarrative: false,
      canFinalize: false,
      required,
      warnings,
      optional,
      blockingKeys: ["start_report"],
      progressPercent: 0,
    };
  }

  if (signals.documentCountForPeriod < 1) {
    required.push({
      key: "upload_docs",
      class: "required",
      message: "Upload at least one source document for this report.",
      stepId: "upload",
    });
  }

  if (signals.includedComparableCount < 1) {
    required.push({
      key: "need_approved_comps",
      class: "required",
      message: "Include at least one approved comparable in the pricing set.",
      stepId: "comparables",
    });
  } else if (signals.pendingComparableReviews > 0) {
    // Remaining candidates may be other unit types or deferred rows — do not hard-block.
    warnings.push({
      key: "defer_pending_comps",
      class: "warning",
      message: `${signals.pendingComparableReviews} comparable listing(s) still pending. Accept, exclude, or acknowledge that they will stay out of this report.`,
      stepId: "comparables",
      acknowledgeable: true,
    });
  }

  if (signals.pendingConflictCount > 0) {
    required.push({
      key: "pending_conflicts",
      class: "required",
      message: `${signals.pendingConflictCount} rent difference(s) still need a verified value.`,
      stepId: "conflicts",
    });
  }

  if (!signals.hasRecommendedRange) {
    required.push({
      key: "rent_range",
      class: "required",
      message: "Set the recommended rent range.",
      stepId: "pricing",
    });
  }

  if (signals.narrativeStale) {
    required.push({
      key: "narrative_stale",
      class: "required",
      message: "Report inputs changed after approval — re-review and approve the narrative.",
      stepId: "preview",
    });
  } else if (!signals.narrativeApproved) {
    required.push({
      key: "narrative_approve",
      class: "required",
      message: "Approve the report narrative before generating the final PDF.",
      stepId: "preview",
    });
  }

  if (!signals.hasPeriodWeeklyData) {
    warnings.push({
      key: "missing_weekly",
      class: "warning",
      message:
        "Weekly marketing figures for this reporting period are missing. Acknowledge before finalizing, or upload the correct-period exports.",
      stepId: "weekly",
      acknowledgeable: true,
    });
  }

  if (signals.subjectPhotoCount < 1) {
    optional.push({
      key: "subject_photos",
      class: "optional",
      message: "Subject photographs are recommended for a complete owner report.",
      stepId: "subject-photos",
    });
  }

  if (
    signals.includedComparableCount > 0 &&
    signals.compsWithSelectedPhotos < 1
  ) {
    optional.push({
      key: "comp_photos",
      class: "optional",
      message: "Comparable photographs are optional but improve the report.",
      stepId: "comp-photos",
    });
  }

  if (!signals.driveConfigured) {
    optional.push({
      key: "drive",
      class: "optional",
      message: "Google Drive backup is not set up — you can still download the PDF.",
      stepId: "download",
    });
  }

  const unackedWarnings = warnings.filter(
    (w) => w.acknowledgeable && !ack.has(w.key),
  );
  const blockingKeys = [
    ...required.map((r) => r.key),
    ...unackedWarnings.map((w) => w.key),
  ];

  const canApproveNarrative =
    signals.hasRecommendedRange &&
    signals.includedComparableCount > 0 &&
    signals.pendingConflictCount === 0 &&
    !signals.narrativeStale;

  const canFinalize = blockingKeys.length === 0;

  const checklist = [
    signals.documentCountForPeriod > 0,
    signals.pendingComparableReviews === 0 && signals.includedComparableCount > 0,
    signals.pendingConflictCount === 0,
    signals.hasPeriodWeeklyData || ack.has("missing_weekly"),
    signals.hasRecommendedRange,
    signals.narrativeApproved && !signals.narrativeStale,
    signals.finalPdfReady,
  ];
  const progressPercent = Math.round(
    (checklist.filter(Boolean).length / checklist.length) * 100,
  );

  return {
    canApproveNarrative,
    canFinalize,
    required,
    warnings,
    optional,
    blockingKeys,
    progressPercent,
  };
}

/**
 * Preview is complete only when required upstream steps are done AND narrative is approved.
 * Narrative approval alone must not mark preview complete.
 */
export function isPreviewComplete(signals: GuidedWorkflowSignals): boolean {
  if (!signals.narrativeApproved || signals.narrativeStale) return false;
  if (signals.includedComparableCount < 1) return false;
  if (signals.pendingConflictCount > 0) return false;
  if (!signals.hasRecommendedRange) return false;
  return true;
}

export function isPricingComplete(signals: GuidedWorkflowSignals): boolean {
  if (signals.narrativeStale) return false;
  return signals.hasRecommendedRange && !signals.narrativeApproved
    ? true // range set, narrative still open → in_progress handled by caller
    : signals.hasRecommendedRange;
}

export function evaluatePayloadReadiness(
  payload: CanonicalReportPayload,
  acknowledgedKeys: string[] = [],
): ReportReadiness {
  const signals: GuidedWorkflowSignals = {
    hasReportRun: true,
    documentCountForPeriod: 1,
    pendingComparableReviews: 0,
    pendingConflictCount: payload.quality.pendingConflictCount,
    subjectPhotoCount: payload.property.photoPaths.length,
    compsWithSelectedPhotos: payload.comparables.approvedIncluded.filter(
      (c) => c.photoPaths.length > 0,
    ).length,
    includedComparableCount: payload.comparables.approvedIncluded.length,
    hasPeriodWeeklyData: payload.weekly.weeks.length > 0,
    hasRecommendedRange: payload.pricing.recommendationSource === "manual_pkl",
    narrativeApproved: payload.narrative.document?.status === "approved",
    narrativeStale:
      payload.narrative.stale || payload.narrative.document?.status === "stale",
    finalPdfReady: false,
    driveConfigured: true,
    driveSaved: false,
  };

  const readiness = evaluateSignalsReadiness(signals, acknowledgedKeys);

  // Payload-specific hard blockers with staff-facing copy
  if (payload.pricing.stats.eligibleGroupedCount < 1) {
    readiness.required.push({
      key: "eligible_comps",
      class: "required",
      message:
        "No approved comparables are ready for pricing. Accept or complete comparable review first.",
      stepId: "comparables",
    });
  }
  if (payload.status === "blocked_conflicts") {
    readiness.required.push({
      key: "blocked_conflicts",
      class: "required",
      message: "Unresolved rent differences are blocking final pricing.",
      stepId: "conflicts",
    });
  }

  readiness.blockingKeys = [
    ...readiness.required.map((r) => r.key),
    ...readiness.warnings
      .filter((w) => w.acknowledgeable && !acknowledgedKeys.includes(w.key))
      .map((w) => w.key),
  ];
  readiness.canFinalize = readiness.blockingKeys.length === 0;

  return readiness;
}

export { REQUIRED_STEPS_FOR_PREVIEW };
