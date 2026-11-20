import {
  PROVIDENCE_855_REFERENCE,
  type ReferenceComp,
  type ReferenceExcluded,
  type ReferenceMatchTier,
} from "@/data/855-providence-reference";

export type LiveCandidateRow = {
  id: string;
  kind: "extraction" | "unit_data";
  fieldKey?: string | null;
  reviewStatus?: string | null;
  unitStatus?: string | null;
  matchTier?: ReferenceMatchTier | null;
  sourceType?: string | null;
  sourceDocumentId?: string | null;
  name?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  rent?: number | null;
  rentMin?: number | null;
  rentMax?: number | null;
  sqft?: number | null;
  distanceMiles?: number | null;
  notes?: string | null;
  comparablePropertyId?: string | null;
  comparableUnitDataId?: string | null;
};

export type MatchQuality = "exact" | "ambiguous" | "unmatched";

export type ReconciliationRow = {
  referenceKey: string;
  referenceName: string;
  referenceTier: ReferenceMatchTier | "excluded";
  referenceRent: string;
  referenceSqft: string;
  referenceSource: string;
  matchQuality: MatchQuality;
  liveCandidates: Array<{
    id: string;
    kind: LiveCandidateRow["kind"];
    label: string;
    rent: string;
    status: string;
    sourceType: string;
    sourceDocumentId: string | null;
    conflicts: string[];
  }>;
  currentApprovalStatus: string;
  conflictingData: string[];
  requiredHumanAction: string;
};

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[#.,]/g, " ")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\broad\b/g, "rd")
    .replace(/\bparkway\b/g, "pkwy")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\s+/g, " ")
    .trim();
}

function moneyRange(min: number | null | undefined, max?: number | null): string {
  if (min == null && max == null) return "—";
  if (min != null && (max == null || max === min)) {
    return `$${Math.round(min).toLocaleString()}`;
  }
  return `$${Math.round(min!).toLocaleString()}–$${Math.round(max!).toLocaleString()}`;
}

function sqftRange(
  min: number | null | undefined,
  max: number | null | undefined,
  avg?: number | null,
): string {
  if (min == null && max == null) return "—";
  if (min != null && max != null && min !== max) {
    return avg != null ? `${min}–${max} (avg ${avg})` : `${min}–${max}`;
  }
  return String(min ?? max);
}

function candidateHaystack(c: LiveCandidateRow): string {
  return norm([c.name, c.addressLine1, c.city, c.fieldKey].filter(Boolean).join(" "));
}

function matchesHints(c: LiveCandidateRow, hints: string[]): boolean {
  const hay = candidateHaystack(c);
  return hints.some((h) => hay.includes(norm(h)));
}

function rentConflict(
  ref: ReferenceComp,
  c: LiveCandidateRow,
): string | null {
  const liveRent = c.rent ?? c.rentMin ?? c.rentMax;
  if (liveRent == null) return null;
  // Reference sometimes uses live-listing overrides vs raw Rentometer.
  const deltaLow = Math.abs(liveRent - ref.rentMin);
  const deltaHigh = Math.abs(liveRent - ref.rentMax);
  const within = liveRent >= ref.rentMin - 30 && liveRent <= ref.rentMax + 30;
  if (within) return null;
  if (deltaLow > 25 && deltaHigh > 25) {
    return `Live rent ${moneyRange(liveRent)} vs reference ${moneyRange(ref.rentMin, ref.rentMax)} (> $25)`;
  }
  return null;
}

function statusLabel(c: LiveCandidateRow): string {
  if (c.kind === "unit_data") {
    return `${c.unitStatus ?? "unknown"}${c.matchTier ? ` / tier=${c.matchTier}` : " / tier=unset"}`;
  }
  return c.reviewStatus ?? "unknown";
}

function buildIncludedRow(
  ref: ReferenceComp,
  candidates: LiveCandidateRow[],
): ReconciliationRow {
  const hits = candidates.filter((c) => matchesHints(c, ref.matchHints));
  const conflicts: string[] = [];
  for (const h of hits) {
    const rc = rentConflict(ref, h);
    if (rc) conflicts.push(rc);
  }

  let matchQuality: MatchQuality = "unmatched";
  if (hits.length === 1) matchQuality = "exact";
  else if (hits.length > 1) {
    // Same-address multi-unit is expected for some reference rows.
    const uniqueAddrs = new Set(hits.map((h) => norm(h.addressLine1 ?? h.name ?? "")));
    matchQuality =
      uniqueAddrs.size <= 1 || ref.unitCountAveraged > 1 ? "exact" : "ambiguous";
  }

  const approved = hits.filter(
    (h) =>
      h.unitStatus === "approved" ||
      h.reviewStatus === "accepted" ||
      h.reviewStatus === "overridden",
  );
  const pending = hits.filter(
    (h) => h.reviewStatus === "pending" || h.unitStatus === "pending",
  );

  let currentApprovalStatus = "unmatched — no live candidate";
  if (hits.length === 0) currentApprovalStatus = "missing candidate";
  else if (approved.length > 0 && pending.length === 0)
    currentApprovalStatus = `approved (${approved.length})`;
  else if (approved.length > 0 && pending.length > 0)
    currentApprovalStatus = `partial — ${approved.length} approved, ${pending.length} pending`;
  else currentApprovalStatus = `pending review (${pending.length || hits.length})`;

  let requiredHumanAction = "";
  if (hits.length === 0) {
    requiredHumanAction =
      ref.sourceFamily === "mls"
        ? "Upload / parse RI MLS CMA, then accept this listing with the suggested tier"
        : "Locate or re-ingest source candidate, then accept with suggested tier";
  } else if (approved.length === 0) {
    requiredHumanAction = `Accept extraction(s) as ${ref.matchTier} (do not auto-approve)`;
  } else if (!approved.some((a) => a.matchTier === ref.matchTier)) {
    requiredHumanAction = `Set match tier to ${ref.matchTier} on approved unit row(s)`;
  } else if (conflicts.length > 0) {
    requiredHumanAction =
      "Resolve rent override (reference used live listing) via override/conflict review";
  } else {
    requiredHumanAction = "None — matches reference selection";
  }

  return {
    referenceKey: ref.key,
    referenceName: ref.displayName,
    referenceTier: ref.matchTier,
    referenceRent: moneyRange(ref.rentMin, ref.rentMax),
    referenceSqft: sqftRange(ref.sqftMin, ref.sqftMax, ref.sqftAvg),
    referenceSource: ref.sourceLabel,
    matchQuality,
    liveCandidates: hits.map((h) => ({
      id: h.id,
      kind: h.kind,
      label: h.name ?? h.addressLine1 ?? h.fieldKey ?? h.id,
      rent: moneyRange(h.rent ?? h.rentMin, h.rentMax ?? h.rent ?? h.rentMin),
      status: statusLabel(h),
      sourceType: h.sourceType ?? h.fieldKey?.split(".")[0] ?? "unknown",
      sourceDocumentId: h.sourceDocumentId ?? null,
      conflicts: [rentConflict(ref, h)].filter(Boolean) as string[],
    })),
    currentApprovalStatus,
    conflictingData: conflicts,
    requiredHumanAction,
  };
}

function buildExcludedRow(
  ex: ReferenceExcluded,
  candidates: LiveCandidateRow[],
): ReconciliationRow {
  const hits = candidates.filter((c) => matchesHints(c, ex.matchHints));
  const wronglyApproved = hits.filter(
    (h) =>
      h.unitStatus === "approved" ||
      h.reviewStatus === "accepted" ||
      h.reviewStatus === "overridden",
  );

  return {
    referenceKey: ex.key,
    referenceName: ex.displayName,
    referenceTier: "excluded",
    referenceRent: "—",
    referenceSqft: "—",
    referenceSource: "Reviewed and excluded",
    matchQuality: hits.length ? (hits.length === 1 ? "exact" : "ambiguous") : "unmatched",
    liveCandidates: hits.map((h) => ({
      id: h.id,
      kind: h.kind,
      label: h.name ?? h.addressLine1 ?? h.fieldKey ?? h.id,
      rent: moneyRange(h.rent ?? h.rentMin, h.rentMax ?? h.rent ?? h.rentMin),
      status: statusLabel(h),
      sourceType: h.sourceType ?? "unknown",
      sourceDocumentId: h.sourceDocumentId ?? null,
      conflicts: [],
    })),
    currentApprovalStatus: wronglyApproved.length
      ? `WARNING: ${wronglyApproved.length} approved but reference excluded`
      : hits.length
        ? "present — should remain excluded/rejected"
        : "not present in live set",
    conflictingData: wronglyApproved.length
      ? ["Approved in live DB but listed under Reviewed and excluded in reference PDF"]
      : [],
    requiredHumanAction: wronglyApproved.length
      ? "Reject / exclude these unit rows (reference excluded) — human action required"
      : hits.length
        ? "Confirm Exclude on pending HelloData/Rentometer rows"
        : "None",
  };
}

export function reconcile855Candidates(candidates: LiveCandidateRow[]): {
  included: ReconciliationRow[];
  excluded: ReconciliationRow[];
  summary: {
    includedCount: number;
    exactMatches: number;
    unmatchedIncluded: number;
    pendingHumanActions: number;
    wronglyApprovedExcluded: number;
  };
} {
  const included = PROVIDENCE_855_REFERENCE.included.map((ref) =>
    buildIncludedRow(ref, candidates),
  );
  const excluded = PROVIDENCE_855_REFERENCE.excluded.map((ex) =>
    buildExcludedRow(ex, candidates),
  );

  return {
    included,
    excluded,
    summary: {
      includedCount: included.length,
      exactMatches: included.filter((r) => r.matchQuality === "exact").length,
      unmatchedIncluded: included.filter((r) => r.matchQuality === "unmatched").length,
      pendingHumanActions: [...included, ...excluded].filter(
        (r) => r.requiredHumanAction !== "None" && !r.requiredHumanAction.startsWith("None"),
      ).length,
      wronglyApprovedExcluded: excluded.filter((r) =>
        r.currentApprovalStatus.startsWith("WARNING"),
      ).length,
    },
  };
}

export function suggestedTierForAddress(
  addressOrName: string,
): ReferenceMatchTier | null {
  const hay = norm(addressOrName);
  for (const ref of PROVIDENCE_855_REFERENCE.included) {
    if (ref.matchHints.some((h) => hay.includes(norm(h)))) return ref.matchTier;
  }
  return null;
}

export function isReferenceExcludedAddress(addressOrName: string): boolean {
  const hay = norm(addressOrName);
  return PROVIDENCE_855_REFERENCE.excluded.some((ex) =>
    ex.matchHints.some((h) => hay.includes(norm(h))),
  );
}
