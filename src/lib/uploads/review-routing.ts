/**
 * Map extracted_values.field_key prefixes to the correct customer review surface.
 */

export type ReviewSurface =
  | "comparable_candidates"
  | "subject_identity"
  | "market_metrics"
  | "weekly_performance"
  | "mls_summary"
  | "other";

/** Prefer actionable guided/property surfaces over the catch-all. */
export const REVIEW_SURFACE_PRIORITY: ReviewSurface[] = [
  "comparable_candidates",
  "weekly_performance",
  "subject_identity",
  "market_metrics",
  "mls_summary",
  "other",
];

export function reviewSurfaceForFieldKey(fieldKey: string): ReviewSurface {
  if (
    fieldKey.startsWith("candidate.") ||
    fieldKey.startsWith("hellodata.comp.") ||
    fieldKey.startsWith("mls.listing.")
  ) {
    return "comparable_candidates";
  }
  if (
    fieldKey.startsWith("hellodata.subject.") ||
    fieldKey.startsWith("rentometer.summary") ||
    fieldKey.startsWith("subject.")
  ) {
    return "subject_identity";
  }
  if (fieldKey.startsWith("hellodata.market.")) {
    return "market_metrics";
  }
  if (
    fieldKey.startsWith("zillow.") ||
    fieldKey.startsWith("apartments.") ||
    fieldKey.includes("weekly")
  ) {
    return "weekly_performance";
  }
  if (fieldKey.startsWith("mls.summary")) {
    return "mls_summary";
  }
  return "other";
}

export function isComparableCandidateFieldKey(fieldKey: string): boolean {
  return reviewSurfaceForFieldKey(fieldKey) === "comparable_candidates";
}

export function labelReviewSurface(surface: ReviewSurface): string {
  switch (surface) {
    case "comparable_candidates":
      return "Comparable review";
    case "subject_identity":
      return "Property setup";
    case "market_metrics":
      return "Market statistics";
    case "weekly_performance":
      return "Weekly performance";
    case "mls_summary":
      return "MLS document summary";
    default:
      return "Document review";
  }
}

export function primaryReviewSurface(
  pendingBySurface: Record<ReviewSurface, number>,
): ReviewSurface {
  for (const surface of REVIEW_SURFACE_PRIORITY) {
    if ((pendingBySurface[surface] ?? 0) > 0) return surface;
  }
  return "other";
}

function appendQuery(path: string, q: URLSearchParams): string {
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Always leave Data Uploads for a real review workspace.
 * Never return `/upload` — that looks like a dead "Review information" button.
 */
export function hrefForReviewSurface(opts: {
  propertyId: string;
  surface: ReviewSurface;
  documentId?: string | null;
  reportRunId?: string | null;
  unitTypeId?: string | null;
}): string {
  const q = new URLSearchParams();
  if (opts.documentId) q.set("documentId", opts.documentId);
  if (opts.reportRunId) q.set("reportId", opts.reportRunId);
  if (opts.unitTypeId) q.set("unitTypeId", opts.unitTypeId);

  switch (opts.surface) {
    case "comparable_candidates":
      if (opts.reportRunId) q.set("step", "comparables");
      return appendQuery(`/buildings/${opts.propertyId}/comparables`, q);
    case "subject_identity":
      return appendQuery(`/buildings/${opts.propertyId}`, q);
    case "market_metrics":
    case "mls_summary":
      if (opts.reportRunId) q.set("step", "pricing");
      return appendQuery(`/buildings/${opts.propertyId}/pricing`, q);
    case "weekly_performance":
      if (opts.reportRunId) q.set("step", "weekly");
      return appendQuery(`/buildings/${opts.propertyId}/leads`, q);
    default:
      // Unknown extraction types: property setup, not another trip to Uploads.
      return appendQuery(`/buildings/${opts.propertyId}`, q);
  }
}

export function summarizePendingBySurface(
  rows: Array<{ field_key: string }>,
): Record<ReviewSurface, number> {
  const out: Record<ReviewSurface, number> = {
    comparable_candidates: 0,
    subject_identity: 0,
    market_metrics: 0,
    weekly_performance: 0,
    mls_summary: 0,
    other: 0,
  };
  for (const row of rows) {
    out[reviewSurfaceForFieldKey(row.field_key)] += 1;
  }
  return out;
}
