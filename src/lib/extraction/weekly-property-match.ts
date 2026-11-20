export type WeeklyPropertyMatch = {
  confidence: "exact" | "strong" | "ambiguous" | "none";
  reason: string;
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bparkway\b/g, "pkwy")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\broad\b/g, "rd")
    .trim();
}

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Match export property labels to the PKL property.
 * Example: "The Residences at Bold Point" aliases 30 Veterans Memorial Parkway.
 */
export function matchWeeklyPropertyName(
  rawName: string,
  property: {
    name: string;
    marketingName?: string | null;
    addressLine1: string;
    city: string;
    state: string;
    aliases?: string[];
  },
): WeeklyPropertyMatch {
  const raw = norm(rawName);
  if (!raw) return { confidence: "none", reason: "empty_name" };

  const candidates = [
    property.addressLine1,
    property.name,
    property.marketingName ?? "",
    ...(property.aliases ?? []),
  ]
    .map((c) => norm(c))
    .filter(Boolean);

  for (const c of candidates) {
    if (raw === c) return { confidence: "exact", reason: "exact_normalized" };
  }

  const addrDigits = digits(property.addressLine1);
  const rawDigits = digits(rawName);
  const city = norm(property.city);
  const state = norm(property.state);

  // Strong: leading street number + overlapping street token
  if (addrDigits && rawDigits.startsWith(addrDigits)) {
    const streetToken = norm(property.addressLine1)
      .replace(addrDigits, "")
      .trim()
      .split(" ")
      .find((t) => t.length > 2);
    if (streetToken && raw.includes(streetToken)) {
      return { confidence: "strong", reason: "address_number_and_street" };
    }
  }

  for (const c of candidates) {
    if (c.length >= 8 && (raw.includes(c) || c.includes(raw))) {
      return { confidence: "strong", reason: "substring_alias_or_name" };
    }
  }

  // Soft city+partial — not enough alone
  if (city && raw.includes(city) && state && raw.includes(state)) {
    return { confidence: "none", reason: "city_state_only_insufficient" };
  }

  return { confidence: "none", reason: "no_match" };
}

/** Built-in marketed-name aliases observed in client packages / listing URLs. */
export const KNOWN_PROPERTY_ALIASES: Record<string, string[]> = {
  "30 veterans memorial parkway": [
    "The Residences at Bold Point",
    "Residences at Bold Point",
    "Bold Point",
  ],
  "855 providence st": ["855 Providence St.", "855 Providence Street"],
  "855 providence street": ["855 Providence St.", "855 Providence St"],
};
