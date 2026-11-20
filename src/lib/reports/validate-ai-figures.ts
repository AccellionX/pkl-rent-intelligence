import type { CanonicalReportPayload } from "./types";
import type { NarrativeSections } from "./types";

/**
 * Extract currency-like and plain integers from narrative text and ensure
 * monetary figures appear in the approved payload allow-list.
 * Non-money integers (counts, beds) are allowed more loosely via allowlist.
 */
export function collectAllowedFigures(payload: CanonicalReportPayload): Set<number> {
  const allowed = new Set<number>();
  const add = (n: number | null | undefined) => {
    if (n != null && Number.isFinite(n)) allowed.add(Math.round(n));
  };

  add(payload.pricing.recommendedRentLow);
  add(payload.pricing.recommendedRentHigh);
  add(payload.pricing.stats.blendedAverageRent);
  add(payload.pricing.stats.rangeLow);
  add(payload.pricing.stats.rangeHigh);
  add(payload.pricing.stats.averagePsf != null ? Math.round(payload.pricing.stats.averagePsf * 100) : null);
  add(payload.pricing.stats.averageDaysOnMarket);
  add(payload.pricing.stats.rentometerSetAverage);
  add(payload.pricing.stats.hellodataSetAverage);
  add(payload.pricing.stats.mlsSetAverage);
  add(payload.pricing.stats.eligibleGroupedCount);
  add(payload.unitType.beds);
  add(payload.unitType.baths);
  add(payload.property.yearBuilt);
  add(payload.property.unitCount);

  for (const u of payload.availableUnits) {
    add(u.askingRent);
    add(u.sqft);
  }
  for (const c of payload.comparables.approvedIncluded) {
    add(c.monthlyRent);
    add(c.rentMin);
    add(c.rentMax);
    add(c.sqftMin);
    add(c.sqftMax);
    add(c.daysOnMarket);
    if (c.psf != null) add(Math.round(c.psf * 100));
  }
  for (const w of payload.weekly.weeks) {
    for (const v of Object.values(w.zillow.weekly)) add(v);
    for (const v of Object.values(w.zillow.listingToDate)) add(v);
    add(w.apartments.phoneCalls);
    add(w.apartments.emails);
    add(w.apartments.totalLeads);
    add(w.agent.toursScheduled);
    add(w.agent.toursCompleted);
    add(w.agent.applicationsReceived);
  }
  return allowed;
}

const MONEY_RE = /\$\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)/g;

export function findDisallowedMoneyFigures(
  sections: NarrativeSections,
  allowed: Set<number>,
): string[] {
  const text = Object.values(sections).join("\n");
  const violations: string[] = [];
  let match: RegExpExecArray | null;
  MONEY_RE.lastIndex = 0;
  while ((match = MONEY_RE.exec(text)) != null) {
    const raw = match[1]!.replace(/,/g, "");
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    if (!allowed.has(n) && !allowed.has(Math.round(n))) {
      violations.push(`Unsupported money figure $${match[1]}`);
    }
  }
  return violations;
}
