/**
 * Human-readable labels for pending comparable candidates.
 * Never surface internal extraction keys (candidate.row.N, hellodata.comp.N).
 */

export type CandidateNormalized = {
  name?: string | null;
  address?: {
    line1?: string | null;
    raw?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
  } | null;
  rent?: number | null;
  beds?: number | null;
  sqft?: number | null;
  daysOnMarket?: number | null;
  distanceMiles?: number | null;
  mlsNumber?: string | null;
  unitTypes?: Array<{
    beds?: number | null;
    rent?: number | null;
    askingRent?: number | null;
    sqft?: number | null;
  }>;
  websiteUrl?: string | null;
  listingUrl?: string | null;
};

function isInternalKey(value: string | null | undefined): boolean {
  if (!value) return true;
  return /^(candidate\.row\.|hellodata\.comp\.|mls\.listing\.|hellodata\.market\.)/i.test(
    value,
  );
}

export function humanCandidateLabel(
  nv: CandidateNormalized,
  _fieldKey?: string, // reserved for callers that still pass extraction keys
): { label: string; missingIdentity: boolean } {
  void _fieldKey;
  const name = typeof nv.name === "string" ? nv.name.trim() : "";
  const line1 = nv.address?.line1?.trim() || "";
  const raw = nv.address?.raw?.trim() || "";
  const mls = nv.mlsNumber?.trim() || "";

  if (name && !isInternalKey(name)) return { label: name, missingIdentity: false };
  if (line1) return { label: line1, missingIdentity: false };
  if (raw) return { label: raw, missingIdentity: false };
  if (mls) return { label: `MLS ${mls}`, missingIdentity: false };

  return {
    label: "Listing needs address or name",
    missingIdentity: true,
  };
}

/**
 * Resolve rent for display — HelloData comps often store rent under unitTypes[].
 */
export function resolveCandidateRent(
  nv: CandidateNormalized,
  focusBeds: number | null,
): { rent: number | null; missingRent: boolean; missingTargetUnitType: boolean } {
  if (typeof nv.rent === "number" && Number.isFinite(nv.rent)) {
    return { rent: nv.rent, missingRent: false, missingTargetUnitType: false };
  }

  const units = Array.isArray(nv.unitTypes) ? nv.unitTypes : [];
  if (units.length === 0) {
    return { rent: null, missingRent: true, missingTargetUnitType: false };
  }

  const match =
    focusBeds != null
      ? units.find((u) => u.beds === focusBeds)
      : units.find((u) => typeof u.rent === "number" || typeof u.askingRent === "number");

  if (!match) {
    return { rent: null, missingRent: true, missingTargetUnitType: focusBeds != null };
  }

  const rent =
    typeof match.rent === "number"
      ? match.rent
      : typeof match.askingRent === "number"
        ? match.askingRent
        : null;

  return {
    rent,
    missingRent: rent == null,
    missingTargetUnitType: false,
  };
}

export function resolveCandidateSqft(
  nv: CandidateNormalized,
  focusBeds: number | null,
): number | null {
  if (typeof nv.sqft === "number") return nv.sqft;
  const units = Array.isArray(nv.unitTypes) ? nv.unitTypes : [];
  const match =
    focusBeds != null ? units.find((u) => u.beds === focusBeds) : units[0];
  return typeof match?.sqft === "number" ? match.sqft : null;
}

export function resolveCandidateBeds(
  nv: CandidateNormalized,
  focusBeds: number | null,
): number | null {
  if (typeof nv.beds === "number") return nv.beds;
  if (focusBeds != null) return focusBeds;
  const units = Array.isArray(nv.unitTypes) ? nv.unitTypes : [];
  return typeof units[0]?.beds === "number" ? units[0].beds : null;
}
