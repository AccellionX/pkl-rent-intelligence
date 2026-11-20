import { createHash } from "node:crypto";
import type { CanonicalReportPayload } from "./types";

/**
 * Stable fingerprint of approved numeric + weekly inputs used for stale narrative detection.
 * Excludes narrative document itself and assembledAt timestamps.
 */
export function reportInputFingerprint(
  payload: Omit<CanonicalReportPayload, "narrative" | "assembledAt"> & {
    narrative?: unknown;
    assembledAt?: unknown;
  },
): string {
  const slice = {
    reportId: payload.report.id,
    periodStart: payload.report.periodStart,
    periodEnd: payload.report.periodEnd,
    recommendedRentLow: payload.pricing.recommendedRentLow,
    recommendedRentHigh: payload.pricing.recommendedRentHigh,
    stats: payload.pricing.stats,
    approvedIncluded: payload.comparables.approvedIncluded.map((c) => ({
      id: c.comparablePropertyId,
      source: c.sourceType,
      rent: c.monthlyRent,
      matchTier: c.matchTier,
      included: c.includedInStats,
    })),
    excluded: payload.comparables.approvedExcludedFromStats.map((c) => ({
      id: c.comparablePropertyId,
      reason: c.exclusionReason,
    })),
    weeks: payload.weekly.weeks.map((w) => ({
      weekStart: w.weekStart,
      weekEnd: w.weekEnd,
      zillow: w.zillow.weekly,
      listingToDate: w.zillow.listingToDate,
      apartments: w.apartments,
      agent: {
        toursScheduled: w.agent.toursScheduled,
        toursCompleted: w.agent.toursCompleted,
        applicationsReceived: w.agent.applicationsReceived,
        feedback: w.agent.prospectFeedbackSummary,
        actions: w.agent.actionsPlannedNextWeek,
      },
    })),
    blockers: payload.quality.blockers,
    pendingConflicts: payload.quality.pendingConflictCount,
  };
  return createHash("sha256").update(JSON.stringify(slice)).digest("hex");
}
