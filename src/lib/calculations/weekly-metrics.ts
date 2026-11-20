import type { ZillowListingMetrics } from "@/lib/extraction/weekly-types";

/**
 * Documented weekly / platform formulas (deterministic; never Claude).
 */
export const WEEKLY_FORMULAS = {
  weekOverWeekAbsolute:
    "delta = current - previous; null if either side is null (missing ≠ 0).",
  weekOverWeekPercent:
    "pct = (current - previous) / previous; null if previous is null or 0; null if current is null.",
  zillowLeadConversion:
    "conversion = totalLeads / listingViews; null if listingViews is null or 0; null if totalLeads is null.",
  listingToDateComparison:
    "Compare last_7_days metrics to listing_to_date metrics for the same property; never treat listing_to_date as a weekly value.",
  rounding: "Ratios rounded to 4 decimal places; display percentages separately as ×100 to 1 decimal.",
  missingPolicy: "Missing source values stay null. Do not coerce N/A or blank to 0.",
} as const;

export function roundRatio(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function weekOverWeekAbsolute(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return current - previous;
}

export function weekOverWeekPercent(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  return roundRatio((current - previous) / previous);
}

/** Zillow lead conversion = totalLeads / listingViews (guard zero denominator). */
export function zillowLeadConversionRate(
  totalLeads: number | null | undefined,
  listingViews: number | null | undefined,
): number | null {
  if (totalLeads == null || listingViews == null) return null;
  if (!Number.isFinite(totalLeads) || !Number.isFinite(listingViews)) return null;
  if (listingViews === 0) return null;
  return roundRatio(totalLeads / listingViews);
}

export function metricDeltaMap(
  current: Partial<ZillowListingMetrics> | null | undefined,
  previous: Partial<ZillowListingMetrics> | null | undefined,
): Record<string, { absolute: number | null; percent: number | null }> {
  const keys: (keyof ZillowListingMetrics)[] = [
    "impressions",
    "listingViews",
    "listingWebReferrals",
    "totalLeads",
    "phoneLeads",
    "emailLeads",
    "adImpressions",
    "adClicks",
  ];
  const out: Record<string, { absolute: number | null; percent: number | null }> = {};
  for (const key of keys) {
    const c = (current?.[key] as number | null | undefined) ?? null;
    const p = (previous?.[key] as number | null | undefined) ?? null;
    out[key] = {
      absolute: weekOverWeekAbsolute(c, p),
      percent: weekOverWeekPercent(c, p),
    };
  }
  return out;
}

export function multiWeekTrend(
  series: Array<{ weekStart: string; value: number | null }>,
): Array<{ weekStart: string; value: number | null; wowAbsolute: number | null; wowPercent: number | null }> {
  const sorted = [...series].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  return sorted.map((point, i) => {
    const prev = i > 0 ? sorted[i - 1]! : null;
    return {
      weekStart: point.weekStart,
      value: point.value,
      wowAbsolute: weekOverWeekAbsolute(point.value, prev?.value ?? null),
      wowPercent: weekOverWeekPercent(point.value, prev?.value ?? null),
    };
  });
}

export function apartmentsLeadSummary(input: {
  phoneCalls: number | null;
  emails: number | null;
  tours: number | null;
  applications: number | null;
  totalLeads?: number | null;
}): {
  phoneCalls: number | null;
  emails: number | null;
  tours: number | null;
  applications: number | null;
  totalLeads: number | null;
  knownLeadSum: number | null;
} {
  const parts = [input.phoneCalls, input.emails];
  const known = parts.every((p) => p == null)
    ? null
    : parts.reduce<number>((s, n) => s + (n ?? 0), 0);
  return {
    phoneCalls: input.phoneCalls,
    emails: input.emails,
    tours: input.tours,
    applications: input.applications,
    totalLeads: input.totalLeads ?? null,
    knownLeadSum: known,
  };
}
