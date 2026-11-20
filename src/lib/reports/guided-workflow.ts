/**
 * Client-aligned guided report workflow (Task #23 addendum).
 * Property setup is separate and persistent — not a weekly step.
 */

export const REPORT_STEPS = [
  {
    id: "upload",
    number: 1,
    title: "Upload documents",
    shortTitle: "Upload",
    description:
      "Add Rentometer, HelloData, MLS, Zillow, and Apartments.com exports for this reporting period.",
    primaryAction: "Continue to comparable review",
  },
  {
    id: "comparables",
    number: 2,
    title: "Confirm comparable data",
    shortTitle: "Comparables",
    description:
      "Review extracted candidates, correct values, accept or exclude, and choose match tiers.",
    primaryAction: "Continue to subject photos",
  },
  {
    id: "subject-photos",
    number: 3,
    title: "Choose subject photos",
    shortTitle: "Subject photos",
    description:
      "Select or upload photographs of the subject property for this report.",
    primaryAction: "Continue to comparable photos",
  },
  {
    id: "comp-photos",
    number: 4,
    title: "Choose comparable photos",
    shortTitle: "Comp photos",
    description:
      "Pick up to three photos per comparable from MLS extracts or manual uploads.",
    primaryAction: "Continue to rent conflicts",
  },
  {
    id: "conflicts",
    number: 5,
    title: "Resolve rent conflicts",
    shortTitle: "Conflicts",
    description:
      "Compare overlapping source rents and verify differences greater than $25.",
    primaryAction: "Continue to weekly performance",
  },
  {
    id: "weekly",
    number: 6,
    title: "Review weekly performance",
    shortTitle: "Weekly",
    description:
      "Confirm this period’s Zillow and Apartments.com figures and add agent notes.",
    primaryAction: "Continue to pricing",
  },
  {
    id: "pricing",
    number: 7,
    title: "Set pricing recommendation",
    shortTitle: "Pricing",
    description:
      "Review market statistics, set the recommended rent range, and prepare the narrative.",
    primaryAction: "Continue to preview",
  },
  {
    id: "preview",
    number: 8,
    title: "Preview and approve",
    shortTitle: "Preview",
    description:
      "Check the full branded report, resolve remaining items, and approve when ready.",
    primaryAction: "Continue to download",
  },
  {
    id: "download",
    number: 9,
    title: "Download and save",
    shortTitle: "Download",
    description:
      "Generate the final PDF, download it, and back up to Google Drive when configured.",
    primaryAction: "Return to property",
  },
] as const;

export type ReportStepId = (typeof REPORT_STEPS)[number]["id"];

export type StepCompletionStatus =
  | "completed"
  | "in_progress"
  | "needs_attention"
  | "not_started"
  | "optional";

export type GuidedWorkflowSignals = {
  hasReportRun: boolean;
  documentCountForPeriod: number;
  pendingComparableReviews: number;
  pendingConflictCount: number;
  subjectPhotoCount: number;
  compsWithSelectedPhotos: number;
  includedComparableCount: number;
  hasPeriodWeeklyData: boolean;
  hasRecommendedRange: boolean;
  narrativeApproved: boolean;
  narrativeStale: boolean;
  finalPdfReady: boolean;
  driveConfigured: boolean;
  driveSaved: boolean;
};

export function hrefForReportStep(opts: {
  propertyId: string;
  stepId: ReportStepId;
  reportRunId?: string | null;
  unitTypeId?: string | null;
}): string {
  const q = new URLSearchParams();
  if (opts.reportRunId) q.set("reportId", opts.reportRunId);
  if (opts.unitTypeId) q.set("unitTypeId", opts.unitTypeId);
  q.set("step", opts.stepId);
  const qs = q.toString();

  switch (opts.stepId) {
    case "upload":
      return `/upload?buildingId=${opts.propertyId}&${qs}`;
    case "comparables":
    case "comp-photos":
    case "conflicts":
      return `/buildings/${opts.propertyId}/comparables?${qs}`;
    case "subject-photos":
      return `/buildings/${opts.propertyId}?${qs}#photos`;
    case "weekly":
      return `/buildings/${opts.propertyId}/leads?${qs}`;
    case "pricing":
      return `/buildings/${opts.propertyId}/pricing?${qs}`;
    case "preview":
    case "download":
      return `/buildings/${opts.propertyId}/reports?${qs}`;
    default:
      return `/buildings/${opts.propertyId}/reports?${qs}`;
  }
}

/**
 * Derive step status from persisted signals — never from mere navigation.
 * Preview is never "completed" from narrative approval alone.
 */
export function deriveStepStatus(
  stepId: ReportStepId,
  signals: GuidedWorkflowSignals,
): StepCompletionStatus {
  if (!signals.hasReportRun) return "not_started";

  switch (stepId) {
    case "upload":
      if (signals.documentCountForPeriod > 0) return "completed";
      return "not_started";
    case "comparables":
      if (signals.pendingComparableReviews > 0) return "needs_attention";
      if (signals.includedComparableCount > 0) return "completed";
      if (signals.documentCountForPeriod > 0) return "in_progress";
      return "not_started";
    case "subject-photos":
      if (signals.subjectPhotoCount > 0) return "completed";
      return "optional";
    case "comp-photos":
      if (signals.includedComparableCount === 0) return "not_started";
      if (signals.compsWithSelectedPhotos >= Math.min(1, signals.includedComparableCount)) {
        return "completed";
      }
      return "optional";
    case "conflicts":
      if (signals.pendingConflictCount > 0) return "needs_attention";
      return "completed";
    case "weekly":
      if (signals.hasPeriodWeeklyData) return "completed";
      return "needs_attention";
    case "pricing":
      if (signals.narrativeStale) return "needs_attention";
      // Pricing step completes when range is set; narrative lives on Preview.
      if (signals.hasRecommendedRange) return "completed";
      return "not_started";
    case "preview": {
      // Narrative approval alone is never enough — need comps + range + no conflicts/stale.
      if (signals.pendingConflictCount > 0) return "needs_attention";
      if (signals.includedComparableCount < 1 || !signals.hasRecommendedRange) {
        return "not_started";
      }
      if (signals.narrativeStale) return "needs_attention";
      if (signals.narrativeApproved) return "completed";
      return "in_progress";
    }
    case "download":
      if (signals.finalPdfReady && (signals.driveSaved || !signals.driveConfigured)) {
        return "completed";
      }
      if (signals.finalPdfReady) return "in_progress";
      if (signals.narrativeApproved) return "in_progress";
      return "not_started";
    default:
      return "not_started";
  }
}

export function labelStepStatus(status: StepCompletionStatus): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "in_progress":
      return "In progress";
    case "needs_attention":
      return "Needs attention";
    case "optional":
      return "Optional";
    default:
      return "Not started";
  }
}

export function nextRecommendedStep(
  signals: GuidedWorkflowSignals,
): ReportStepId | null {
  if (!signals.hasReportRun) return null;
  for (const step of REPORT_STEPS) {
    const status = deriveStepStatus(step.id, signals);
    if (status === "needs_attention" || status === "not_started" || status === "in_progress") {
      if (step.id === "subject-photos" || step.id === "comp-photos") continue;
      return step.id;
    }
  }
  return "download";
}

export function preflightIssues(
  signals: GuidedWorkflowSignals,
  acknowledgedKeys: string[] = [],
): string[] {
  // Lazy import avoided — keep messages aligned with readiness module.
  const issues: string[] = [];
  if (!signals.hasReportRun) {
    issues.push("Start a report for this property, unit type, and reporting period.");
    return issues;
  }
  if (signals.includedComparableCount < 1) {
    issues.push("Include at least one approved comparable in the pricing set.");
  } else if (
    signals.pendingComparableReviews > 0 &&
    !acknowledgedKeys.includes("defer_pending_comps")
  ) {
    issues.push(
      `${signals.pendingComparableReviews} comparable listing(s) still pending — review them or acknowledge deferral before finalizing.`,
    );
  }
  if (signals.pendingConflictCount > 0) {
    issues.push(
      `${signals.pendingConflictCount} rent difference(s) still need a verified value.`,
    );
  }
  if (!signals.hasPeriodWeeklyData && !acknowledgedKeys.includes("missing_weekly")) {
    issues.push(
      "Weekly marketing figures for this reporting period are missing (acknowledge to continue, or upload the correct-period exports).",
    );
  }
  if (!signals.hasRecommendedRange) {
    issues.push("Set the recommended rent range before finalizing.");
  }
  if (signals.narrativeStale) {
    issues.push("Report inputs changed after approval — re-review and approve the narrative.");
  } else if (!signals.narrativeApproved) {
    issues.push("Approve the report narrative before generating the final PDF.");
  }
  if (signals.subjectPhotoCount === 0) {
    issues.push("Subject photographs are optional but recommended for a complete report.");
  }
  if (signals.driveConfigured === false) {
    issues.push(
      "Google Drive backup is not set up — you can still download the PDF.",
    );
  }
  return issues;
}
