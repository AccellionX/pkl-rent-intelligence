import { describe, expect, it } from "vitest";
import {
  selectWeeksForReportPeriod,
  weekOverlapsReportPeriod,
} from "@/lib/reports/weekly-period";
import type { AssembledWeek } from "@/lib/reports/types";

function week(start: string, end: string): AssembledWeek {
  return {
    weekStart: start,
    weekEnd: end,
    metricScope: "property",
    zillow: {
      weekly: { impressions: 1, listingViews: 1, totalLeads: 1 },
      listingToDate: {},
      conversionWeek: null,
      conversionToDate: null,
    },
    apartments: {
      phoneCalls: 0,
      emails: 0,
      totalLeads: 0,
      tours: 0,
      applications: 0,
    },
    agent: {
      toursScheduled: null,
      toursCompleted: null,
      applicationsReceived: null,
      weeklyComments: null,
      prospectFeedbackSummary: null,
      actionsPlannedNextWeek: null,
    },
  };
}

describe("reporting period weekly integrity", () => {
  it("matches overlapping weeks inclusive of boundaries", () => {
    expect(
      weekOverlapsReportPeriod(
        { weekStart: "2026-10-16", weekEnd: "2026-10-22" },
        "2026-10-15",
        "2026-10-22",
      ),
    ).toBe(true);
    expect(
      weekOverlapsReportPeriod(
        { weekStart: "2026-10-16", weekEnd: "2026-10-22" },
        "2026-11-12",
        "2026-11-19",
      ),
    ).toBe(false);
  });

  it("never promotes older weeks as current when period has no match", () => {
    const weeks = [
      week("2026-10-16", "2026-10-22"),
      week("2026-10-23", "2026-10-29"),
    ];
    const selected = selectWeeksForReportPeriod(
      weeks,
      "2026-11-12",
      "2026-11-19",
    );
    expect(selected.currentWeek).toBeNull();
    expect(selected.periodWeeks).toHaveLength(0);
    expect(selected.historicalWeeks).toHaveLength(2);
  });

  it("selects the period-matched week as current", () => {
    const weeks = [
      week("2026-10-16", "2026-10-22"),
      week("2026-11-12", "2026-11-19"),
    ];
    const selected = selectWeeksForReportPeriod(
      weeks,
      "2026-11-12",
      "2026-11-19",
    );
    expect(selected.currentWeek?.weekStart).toBe("2026-11-12");
    expect(selected.periodWeeks).toHaveLength(1);
  });

  it("handles future weekly data as non-current for an older period", () => {
    const weeks = [week("2026-11-20", "2026-11-26")];
    const selected = selectWeeksForReportPeriod(
      weeks,
      "2026-11-12",
      "2026-11-19",
    );
    expect(selected.currentWeek).toBeNull();
  });
});
