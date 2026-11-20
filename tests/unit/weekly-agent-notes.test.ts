import { describe, expect, it } from "vitest";
import {
  composeStaffNotes,
  formatNullableMetric,
  freeformStaffNotes,
  resolveWeeklyAgent,
  splitStaffNotes,
} from "@/lib/weekly/agent-notes";

describe("weekly agent notes", () => {
  it("round-trips null agent counts without coercing to zero", () => {
    const composed = composeStaffNotes("Freeform week note", {
      toursScheduled: null,
      toursCompleted: 1,
      applicationsReceived: null,
      weeklyComments: "Freeform week note",
      prospectFeedbackSummary: "Asked about parking",
      actionsPlannedNextWeek: "Call back Tuesday",
      provided: true,
    });
    const split = splitStaffNotes(composed);
    expect(split.freeform).toContain("Freeform");
    expect(split.agent?.toursScheduled).toBeNull();
    expect(split.agent?.toursCompleted).toBe(1);
    expect(split.agent?.applicationsReceived).toBeNull();
    expect(split.agent?.prospectFeedbackSummary).toMatch(/parking/i);
    expect(formatNullableMetric(null)).toBe("—");
    expect(formatNullableMetric(0)).toBe("0");
  });

  it("preserves freeform when agent block is absent", () => {
    const split = splitStaffNotes("Only comments");
    expect(split.agent).toBeNull();
    expect(split.freeform).toBe("Only comments");
  });

  it("prefers dedicated columns after migration and strips agent JSON for freeform", () => {
    const historical = composeStaffNotes("legacy comment", {
      toursScheduled: null,
      toursCompleted: 1,
      applicationsReceived: null,
      weeklyComments: "legacy comment",
      prospectFeedbackSummary: "from json",
      actionsPlannedNextWeek: "json action",
      provided: true,
    });
    expect(freeformStaffNotes(historical)).toBe("legacy comment");

    const fromColumns = resolveWeeklyAgent({
      staff_notes: "fresh freeform",
      tours_scheduled: null,
      tours_completed: 2,
      applications_received: 0,
      feedback_summary: "column feedback",
      actions_planned: "column action",
    });
    expect(fromColumns.toursScheduled).toBeNull();
    expect(fromColumns.toursCompleted).toBe(2);
    expect(fromColumns.applicationsReceived).toBe(0);
    expect(fromColumns.prospectFeedbackSummary).toBe("column feedback");
    expect(fromColumns.actionsPlannedNextWeek).toBe("column action");
    expect(fromColumns.weeklyComments).toBe("fresh freeform");
    expect(fromColumns.provided).toBe(true);
  });

  it("falls back to historical agent JSON when dedicated text columns are empty", () => {
    const historical = composeStaffNotes("task08 agent comments", {
      toursScheduled: 2,
      toursCompleted: 1,
      applicationsReceived: null,
      weeklyComments: "task08 agent comments",
      prospectFeedbackSummary: "Prospect asked about parking",
      actionsPlannedNextWeek: "Follow up",
      provided: true,
    });
    const resolved = resolveWeeklyAgent({
      staff_notes: historical,
      tours_scheduled: 0,
      tours_completed: 0,
      applications_received: 0,
      feedback_summary: null,
      actions_planned: null,
    });
    expect(resolved.toursScheduled).toBe(2);
    expect(resolved.applicationsReceived).toBeNull();
    expect(resolved.prospectFeedbackSummary).toMatch(/parking/i);
    expect(resolved.provided).toBe(true);
  });
});
