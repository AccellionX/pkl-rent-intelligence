import { normalizeAddress } from "./normalize";

export type MatchConfidence = "exact" | "strong" | "weak" | "ambiguous" | "none";

export interface MatchCandidate {
  id: string;
  name?: string | null;
  addressRaw?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  aliasesNormalized?: string[];
  /** When present, exact MLS id match wins over address heuristics. */
  mlsNumber?: string | null;
}

export interface MatchResult {
  confidence: MatchConfidence;
  matchedId: string | null;
  score: number;
  reason: string;
  ambiguousIds: string[];
}

function streetTokens(normalized: string): string[] {
  return normalized
    .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|parkway|pkwy|lane|ln|way|court|ct|boulevard|blvd)\b/g, "")
    .split(/\s+/)
    .filter(
      (t) =>
        t &&
        !/^(ri|ct|ma|nh|vt|me|ny|usa|the|east|west|north|south|providence|warwick)$/.test(
          t,
        ) &&
        !/^\d{5}(?:-\d{4})?$/.test(t),
    );
}

function buildKey(c: MatchCandidate): string {
  const raw = [c.addressRaw, c.city, c.state, c.postalCode].filter(Boolean).join(", ");
  return normalizeAddress(raw)?.normalized ?? (c.name ?? "").toLowerCase().trim();
}

/**
 * Match an incoming HelloData/Rentometer address against known property-level comps.
 * Conservative: similar street numbers on different streets do not auto-match.
 */
export function matchComparableProperty(
  incoming: MatchCandidate,
  known: MatchCandidate[],
): MatchResult {
  const incomingKey = buildKey(incoming);
  const incomingTokens = streetTokens(incomingKey);
  const incomingNum = incomingTokens.find((t) => /^\d+/.test(t));
  const incomingMls = incoming.mlsNumber?.trim() || null;

  if (incomingMls) {
    const mlsHits = known.filter(
      (k) => k.mlsNumber && k.mlsNumber.trim() === incomingMls,
    );
    if (mlsHits.length === 1) {
      return {
        confidence: "exact",
        matchedId: mlsHits[0]!.id,
        score: 100,
        reason: `exact MLS number ${incomingMls}`,
        ambiguousIds: [],
      };
    }
    if (mlsHits.length > 1) {
      return {
        confidence: "ambiguous",
        matchedId: null,
        score: 100,
        reason: `Multiple comps share MLS number ${incomingMls}`,
        ambiguousIds: mlsHits.map((h) => h.id),
      };
    }
  }

  const scored = known.map((k) => {
    const key = buildKey(k);
    const aliasHit = (k.aliasesNormalized ?? []).some(
      (a) => a === incomingKey || incomingKey.includes(a) || a.includes(incomingKey),
    );
    if (aliasHit || key === incomingKey) {
      return { id: k.id, score: 100, reason: "exact normalized address/alias" };
    }

    const tokens = streetTokens(key);
    const num = tokens.find((t) => /^\d+/.test(t));
    const shared = tokens.filter((t) => incomingTokens.includes(t) && !/^\d+$/.test(t));
    let score = shared.length * 20;
    if (incomingNum && num && incomingNum === num) score += 25;
    if (incoming.name && k.name) {
      const a = incoming.name.toLowerCase();
      const b = k.name.toLowerCase();
      if (a === b) score += 40;
      else if (a.includes(b) || b.includes(a)) score += 20;
    }
    // Same house number on a different street is never an auto-match.
    if (incomingNum && num && incomingNum === num && shared.length === 0) {
      score = Math.min(score, 20);
    }
    return {
      id: k.id,
      score,
      reason: `token overlap=${shared.length}; numberMatch=${incomingNum === num}`,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const second = scored[1];

  if (!top || top.score < 45) {
    return {
      confidence: "none",
      matchedId: null,
      score: top?.score ?? 0,
      reason: "No sufficiently strong address match",
      ambiguousIds: [],
    };
  }

  if (second && second.score >= 45 && Math.abs(top.score - second.score) <= 10) {
    return {
      confidence: "ambiguous",
      matchedId: null,
      score: top.score,
      reason: "Multiple comparable properties match with similar confidence",
      ambiguousIds: scored.filter((s) => s.score >= 45).map((s) => s.id),
    };
  }

  if (top.score >= 90) {
    return {
      confidence: "exact",
      matchedId: top.id,
      score: top.score,
      reason: top.reason,
      ambiguousIds: [],
    };
  }
  if (top.score >= 65) {
    return {
      confidence: "strong",
      matchedId: top.id,
      score: top.score,
      reason: top.reason,
      ambiguousIds: [],
    };
  }
  return {
    confidence: "weak",
    matchedId: top.id,
    score: top.score,
    reason: `${top.reason} (weak — requires human confirmation)`,
    ambiguousIds: [],
  };
}
