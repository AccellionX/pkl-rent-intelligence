/**
 * Report workspace entry helpers — keep guided journey as the only primary path.
 */

export type ReportLifecycleStatus = string;

export function isDraftReportStatus(status: ReportLifecycleStatus | null | undefined): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "in_progress" || s === "waiting_on_review" || s === "";
}

export function isFinalizedReportStatus(
  status: ReportLifecycleStatus | null | undefined,
): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "sent" || s === "saved_to_drive";
}

/** Local calendar YYYY-MM-DD — avoids UTC off-by-one from toISOString(). */
export function localDateIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Suggested rolling 7-day window ending today (local).
 * Staff must still confirm dates before create — this is only a suggestion.
 */
export function suggestedReportingPeriod(now: Date = new Date()): {
  start: string;
  end: string;
} {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  start.setDate(end.getDate() - 7);
  return { start: localDateIso(start), end: localDateIso(end) };
}

export type ReportWorkspaceMode =
  | "loading"
  | "hub_no_report"
  | "hub_pick_draft"
  | "guided_download"
  | "error";

/**
 * Decide which reports-page surface to show. Never treat "loading" as download.
 */
export function resolveReportWorkspaceMode(opts: {
  loading: boolean;
  error: string | null;
  urlReportId: string | null;
  step: string | null;
  draftCount: number;
  reportCount: number;
}): ReportWorkspaceMode {
  if (opts.loading) return "loading";
  if (opts.error) return "error";
  if (opts.urlReportId && (opts.step === "download" || opts.step === "preview" || !opts.step)) {
    return "guided_download";
  }
  if (opts.reportCount === 0) return "hub_no_report";
  if (opts.draftCount > 0 && !opts.urlReportId) return "hub_pick_draft";
  return "hub_no_report";
}

/** Upload page modes — general document center vs guided Step 1. */
export type UploadWorkspaceMode = "general" | "guided" | "guided_loading";

/**
 * Guided chrome only when URL carries an explicit reportId.
 * Never treat "property selected" as an active weekly report.
 */
export function resolveUploadWorkspaceMode(opts: {
  urlReportId: string | null | undefined;
  guidedLoading?: boolean;
}): UploadWorkspaceMode {
  const reportId = String(opts.urlReportId ?? "").trim();
  if (!reportId) return "general";
  if (opts.guidedLoading) return "guided_loading";
  return "guided";
}

/**
 * Document scope label for Document Center rows.
 * Property-level uploads are reusable; report-linked rows are period-specific.
 */
export function labelDocumentUploadScope(opts: {
  documentReportRunId: string | null | undefined;
  activeReportRunId?: string | null | undefined;
  activeReportTitle?: string | null | undefined;
  otherReportTitle?: string | null | undefined;
}): "property" | "current_report" | "other_report" {
  const docReport = String(opts.documentReportRunId ?? "").trim();
  if (!docReport) return "property";
  const active = String(opts.activeReportRunId ?? "").trim();
  if (active && docReport === active) return "current_report";
  return "other_report";
}

export function describeDocumentUploadScope(opts: {
  scope: ReturnType<typeof labelDocumentUploadScope>;
  activeReportTitle?: string | null;
  otherReportTitle?: string | null;
  periodLabel?: string | null;
}): string {
  switch (opts.scope) {
    case "property":
      return "Property library — reusable across reports";
    case "current_report":
      return opts.periodLabel
        ? `This report · ${opts.periodLabel}`
        : opts.activeReportTitle
          ? `This report · ${opts.activeReportTitle}`
          : "This report";
    case "other_report":
      return opts.otherReportTitle
        ? `Earlier report · ${opts.otherReportTitle}`
        : "Earlier report";
  }
}
