import type { ReportRunStatus } from "./types";

const TRANSITIONS: Record<ReportRunStatus, readonly ReportRunStatus[]> = {
  in_progress: ["waiting_on_review"],
  waiting_on_review: ["in_progress", "sent"],
  sent: ["saved_to_drive"],
  saved_to_drive: [],
};

export function canTransitionReportStatus(
  from: ReportRunStatus,
  to: ReportRunStatus,
): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

export function assertReportStatusTransition(
  from: ReportRunStatus,
  to: ReportRunStatus,
): void {
  if (!canTransitionReportStatus(from, to)) {
    throw new Error(`Invalid report status transition: ${from} → ${to}`);
  }
}

export function listAllowedReportTransitions(
  from: ReportRunStatus,
): readonly ReportRunStatus[] {
  return TRANSITIONS[from];
}
