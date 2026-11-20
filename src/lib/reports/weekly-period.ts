import type { AssembledWeek } from "./types";

/**
 * A weekly metrics row overlaps a report period when its week window intersects
 * [periodStart, periodEnd] (inclusive date strings YYYY-MM-DD).
 */
export function weekOverlapsReportPeriod(
  week: { weekStart: string; weekEnd: string | null },
  periodStart: string,
  periodEnd: string,
): boolean {
  const weekEnd = week.weekEnd && week.weekEnd.trim() ? week.weekEnd : week.weekStart;
  return week.weekStart <= periodEnd && weekEnd >= periodStart;
}

export function selectWeeksForReportPeriod(
  weeks: AssembledWeek[],
  periodStart: string,
  periodEnd: string,
): {
  periodWeeks: AssembledWeek[];
  currentWeek: AssembledWeek | null;
  historicalWeeks: AssembledWeek[];
} {
  const periodWeeks = weeks.filter((w) =>
    weekOverlapsReportPeriod(w, periodStart, periodEnd),
  );
  const historicalWeeks = weeks.filter(
    (w) => !weekOverlapsReportPeriod(w, periodStart, periodEnd),
  );
  const currentWeek = periodWeeks.length
    ? periodWeeks[periodWeeks.length - 1]!
    : null;
  return { periodWeeks, currentWeek, historicalWeeks };
}
