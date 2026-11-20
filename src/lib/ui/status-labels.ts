/** Human-readable labels for persisted enums — keep raw values in APIs/routes. */

const REPORT_STATUS: Record<string, string> = {
  in_progress: "In progress",
  waiting_on_review: "Ready for review",
  sent: "Completed",
  saved_to_drive: "Saved to Google Drive",
};

const UNIT_STATUS: Record<string, string> = {
  available: "Available",
  pending: "Pending",
  leased: "Leased",
  offline: "Offline",
};

const NARRATIVE_STATUS: Record<string, string> = {
  none: "Not started",
  draft: "Draft",
  edited: "Edited",
  approved: "Approved",
  rejected: "Needs attention",
  stale: "Needs refresh",
};

const ASSEMBLY_STATUS: Record<string, string> = {
  ready: "Ready",
  blocked_conflicts: "Needs attention",
  incomplete: "In progress",
  error: "Unable to process",
};

const REVIEW_STATUS: Record<string, string> = {
  pending: "Needs attention",
  accepted: "Approved",
  rejected: "Excluded",
  approved: "Approved",
  candidate: "Ready for review",
};

const SOURCE_TYPE: Record<string, string> = {
  rentometer: "Rentometer",
  rentometer_csv: "Rentometer",
  rentometer_xlsx: "Rentometer",
  rentometer_pdf: "Rentometer",
  hellodata: "HelloData",
  hellodata_pdf: "HelloData",
  mls: "MLS",
  mls_ri_pdf: "RI MLS",
  mls_ct_pdf: "CT MLS",
  zillow: "Zillow",
  zillow_xlsx: "Zillow",
  apartments: "Apartments.com",
  apartments_xlsx: "Apartments.com",
  manual: "Manual",
  photo: "Photograph",
  other: "Other",
};

const MATCH_QUALITY: Record<string, string> = {
  exact: "Exact match",
  ambiguous: "Needs attention",
  unmatched: "Unmatched",
  none: "No match",
};

const TIER: Record<string, string> = {
  primary: "Primary",
  secondary: "Secondary",
  strongest: "Strongest",
  context: "Context",
  excluded: "Excluded",
};

const PARSE_STATUS: Record<string, string> = {
  pending: "Processing",
  uploaded: "Uploading",
  parsing: "Processing",
  needs_review: "Ready for review",
  parsed: "Completed",
  failed: "Unable to process",
  reviewed: "Reviewed",
};

const DRIVE_CONNECTION: Record<string, string> = {
  connected: "Connected",
  not_connected: "Not connected",
  error: "Needs attention",
};

export function labelReportStatus(status: string): string {
  return REPORT_STATUS[status] ?? titleCase(status);
}

export function labelUnitStatus(status: string): string {
  return UNIT_STATUS[status] ?? titleCase(status);
}

export function labelNarrativeStatus(status: string): string {
  return NARRATIVE_STATUS[status] ?? titleCase(status);
}

export function labelAssemblyStatus(status: string): string {
  return ASSEMBLY_STATUS[status] ?? titleCase(status);
}

export function labelReviewStatus(status: string): string {
  return REVIEW_STATUS[status] ?? titleCase(status);
}

export function labelSourceType(value: string): string {
  return SOURCE_TYPE[value.toLowerCase()] ?? titleCase(value);
}

export function labelMatchQuality(value: string): string {
  return MATCH_QUALITY[value] ?? titleCase(value);
}

export function labelTier(value: string): string {
  return TIER[value] ?? titleCase(value);
}

export function labelParseStatus(status: string): string {
  return PARSE_STATUS[status] ?? titleCase(status);
}

/**
 * Customer-facing document badge: "Ready for review" only when rows remain pending.
 * Avoids labeling already-reviewed files as still needing review.
 */
export function labelDocumentCenterStatus(opts: {
  parseStatus: string;
  remainingReviewCount: number;
}): string {
  const parse = String(opts.parseStatus ?? "").toLowerCase();
  if (parse === "failed") return labelParseStatus("failed");
  if (parse === "pending" || parse === "uploaded" || parse === "parsing") {
    return labelParseStatus(parse);
  }
  if (opts.remainingReviewCount > 0) return "Ready for review";
  if (parse === "reviewed" || parse === "parsed" || parse === "needs_review") {
    return "Reviewed";
  }
  return labelParseStatus(opts.parseStatus);
}

export function labelDriveConnection(status: string): string {
  return DRIVE_CONNECTION[status] ?? titleCase(status);
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
