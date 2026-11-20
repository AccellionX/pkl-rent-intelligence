import type { CanonicalReportPayload } from "./types";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE =
  /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;

export function scrubFreeText(value: string | null | undefined): {
  text: string | null;
  warnings: string[];
} {
  if (value == null) return { text: null, warnings: [] };
  const warnings: string[] = [];
  let text = value;
  if (EMAIL_RE.test(text)) {
    warnings.push("Email-like content redacted from Claude prompt");
    text = text.replace(EMAIL_RE, "[redacted-email]");
  }
  EMAIL_RE.lastIndex = 0;
  if (PHONE_RE.test(text)) {
    warnings.push("Phone-like content redacted from Claude prompt");
    text = text.replace(PHONE_RE, "[redacted-phone]");
  }
  PHONE_RE.lastIndex = 0;
  return { text, warnings };
}

/**
 * Build a Claude-safe slice of the assembled report.
 * Omits storage paths detail beyond counts, raw documents, and prospect PII.
 */
export function buildClaudePromptPayload(payload: CanonicalReportPayload): {
  promptPayload: Record<string, unknown>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const scrub = (v: string | null | undefined) => {
    const r = scrubFreeText(v);
    warnings.push(...r.warnings);
    return r.text;
  };

  const latest = payload.weekly.latestWeek;

  return {
    promptPayload: {
      property: {
        name: payload.property.name,
        address: `${payload.property.addressLine1}, ${payload.property.city}, ${payload.property.state} ${payload.property.postalCode}`,
        yearBuilt: payload.property.yearBuilt,
        amenities: payload.property.amenities,
        unitType: payload.unitType.label,
        beds: payload.unitType.beds,
        baths: payload.unitType.baths,
      },
      period: {
        start: payload.report.periodStart,
        end: payload.report.periodEnd,
      },
      pklRecommendedRent: {
        low: payload.pricing.recommendedRentLow,
        high: payload.pricing.recommendedRentHigh,
        note: "These values are PKL-approved. Do not change or replace them.",
      },
      deterministicStats: {
        blendedAverageRent: payload.pricing.stats.blendedAverageRent,
        rangeLow: payload.pricing.stats.rangeLow,
        rangeHigh: payload.pricing.stats.rangeHigh,
        averagePsf: payload.pricing.stats.averagePsf,
        averageDaysOnMarket: payload.pricing.stats.averageDaysOnMarket,
        rentometerSetAverage: payload.pricing.stats.rentometerSetAverage,
        hellodataSetAverage: payload.pricing.stats.hellodataSetAverage,
        mlsSetAverage: payload.pricing.stats.mlsSetAverage,
        eligibleGroupedCount: payload.pricing.stats.eligibleGroupedCount,
      },
      approvedComparables: payload.comparables.approvedIncluded.map((c) => ({
        name: c.name,
        address: `${c.addressLine1}, ${c.city}, ${c.state}`,
        matchTier: c.matchTier,
        source: c.sourceType,
        monthlyRent: c.monthlyRent,
        rentMin: c.rentMin,
        rentMax: c.rentMax,
        psf: c.psf,
        daysOnMarket: c.daysOnMarket,
        distanceMiles: c.distanceMiles,
      })),
      excludedFromStats: payload.comparables.approvedExcludedFromStats.map((c) => ({
        name: c.name,
        reason: c.exclusionReason,
      })),
      weeklyPropertyWide: latest
        ? {
            weekStart: latest.weekStart,
            weekEnd: latest.weekEnd,
            zillowWeekly: latest.zillow.weekly,
            zillowListingToDate: latest.zillow.listingToDate,
            zillowConversionWeek: latest.zillow.conversionWeek,
            apartments: latest.apartments,
            agent: {
              toursScheduled: latest.agent.toursScheduled,
              toursCompleted: latest.agent.toursCompleted,
              applicationsReceived: latest.agent.applicationsReceived,
              feedbackSummary: scrub(latest.agent.prospectFeedbackSummary),
              actionsPlanned: scrub(latest.agent.actionsPlannedNextWeek),
              // Comments kept separate — Claude must not rewrite as its own voice.
              agentWeeklyComments: scrub(latest.agent.weeklyComments),
            },
          }
        : null,
      qualityWarnings: payload.quality.warnings,
      instructions: {
        inventNothing: true,
        doNotChangeRecommendedRent: true,
        separateAgentComments: true,
        useOnlyProvidedFigures: true,
      },
    },
    warnings,
  };
}
