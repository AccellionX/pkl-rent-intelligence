export type WeeklyAgentNotes = {
  toursScheduled: number | null;
  toursCompleted: number | null;
  applicationsReceived: number | null;
  weeklyComments: string | null;
  prospectFeedbackSummary: string | null;
  actionsPlannedNextWeek: string | null;
  /** True once staff has saved agent input for this week (even if values are null). */
  provided: boolean;
};

export type WeeklyAgentRow = {
  staff_notes: string | null;
  tours_scheduled: number | null;
  tours_completed: number | null;
  applications_received: number | null;
  feedback_summary?: string | null;
  actions_planned?: string | null;
};

const AGENT_MARKER = "\n\n---agent---\n";

export function splitStaffNotes(staffNotes: string | null | undefined): {
  freeform: string;
  agent: WeeklyAgentNotes | null;
} {
  if (!staffNotes) return { freeform: "", agent: null };
  const idx = staffNotes.indexOf("---agent---");
  if (idx < 0) return { freeform: staffNotes.trim(), agent: null };
  const freeform = staffNotes.slice(0, idx).replace(/\n+$/, "").trim();
  const jsonPart = staffNotes.slice(idx).replace(/^---agent---\s*/, "").trim();
  try {
    const parsed = JSON.parse(jsonPart) as Partial<WeeklyAgentNotes>;
    return {
      freeform,
      agent: {
        toursScheduled:
          typeof parsed.toursScheduled === "number" ? parsed.toursScheduled : null,
        toursCompleted:
          typeof parsed.toursCompleted === "number" ? parsed.toursCompleted : null,
        applicationsReceived:
          typeof parsed.applicationsReceived === "number"
            ? parsed.applicationsReceived
            : null,
        weeklyComments:
          typeof parsed.weeklyComments === "string" ? parsed.weeklyComments : null,
        prospectFeedbackSummary:
          typeof parsed.prospectFeedbackSummary === "string"
            ? parsed.prospectFeedbackSummary
            : null,
        actionsPlannedNextWeek:
          typeof parsed.actionsPlannedNextWeek === "string"
            ? parsed.actionsPlannedNextWeek
            : null,
        provided: true,
      },
    };
  } catch {
    return { freeform: staffNotes.trim(), agent: null };
  }
}

/** Strip historical ---agent--- JSON; keep freeform comments only. */
export function freeformStaffNotes(staffNotes: string | null | undefined): string {
  return splitStaffNotes(staffNotes).freeform;
}

/**
 * @deprecated Prefer dedicated columns after 20260317200000. Kept for tests /
 * reading historical rows that still embed agent JSON in staff_notes.
 */
export function composeStaffNotes(
  freeform: string | null | undefined,
  agent: WeeklyAgentNotes,
): string {
  const base = (freeform ?? "").replace(/\n\n---agent---[\s\S]*$/m, "").trim();
  const payload = {
    toursScheduled: agent.toursScheduled,
    toursCompleted: agent.toursCompleted,
    applicationsReceived: agent.applicationsReceived,
    weeklyComments: agent.weeklyComments,
    prospectFeedbackSummary: agent.prospectFeedbackSummary,
    actionsPlannedNextWeek: agent.actionsPlannedNextWeek,
    provided: true,
  };
  return `${base}${AGENT_MARKER}${JSON.stringify(payload)}`.trim();
}

/**
 * Resolve agent weekly input.
 * Dedicated columns are source of truth after migration; historical ---agent---
 * JSON in staff_notes remains a read fallback when dedicated text fields are empty.
 */
export function resolveWeeklyAgent(row: WeeklyAgentRow): WeeklyAgentNotes {
  const split = splitStaffNotes(row.staff_notes);
  const fromJson = split.agent;
  const hasDedicatedText =
    (row.feedback_summary != null && row.feedback_summary.length > 0) ||
    (row.actions_planned != null && row.actions_planned.length > 0);

  // Historical rows written before dedicated columns: prefer JSON null semantics.
  if (fromJson?.provided && !hasDedicatedText) {
    return {
      toursScheduled: fromJson.toursScheduled,
      toursCompleted: fromJson.toursCompleted,
      applicationsReceived: fromJson.applicationsReceived,
      weeklyComments: fromJson.weeklyComments ?? (split.freeform || null),
      prospectFeedbackSummary: fromJson.prospectFeedbackSummary,
      actionsPlannedNextWeek: fromJson.actionsPlannedNextWeek,
      provided: true,
    };
  }

  const weeklyComments = split.freeform || null;
  const prospectFeedbackSummary = row.feedback_summary ?? null;
  const actionsPlannedNextWeek = row.actions_planned ?? null;
  const hasAgentSignal =
    hasDedicatedText ||
    Boolean(weeklyComments) ||
    Boolean(fromJson?.provided);

  // Pre-migration defaults stored 0 for “unset”. Without an agent signal, treat 0 as null.
  const coalesceCount = (value: number | null): number | null => {
    if (value == null) return null;
    if (value === 0 && !hasAgentSignal) return null;
    return value;
  };

  const toursScheduled = coalesceCount(row.tours_scheduled);
  const toursCompleted = coalesceCount(row.tours_completed);
  const applicationsReceived = coalesceCount(row.applications_received);

  const provided =
    toursScheduled != null ||
    toursCompleted != null ||
    applicationsReceived != null ||
    Boolean(prospectFeedbackSummary) ||
    Boolean(actionsPlannedNextWeek) ||
    Boolean(weeklyComments);

  return {
    toursScheduled,
    toursCompleted,
    applicationsReceived,
    weeklyComments,
    prospectFeedbackSummary,
    actionsPlannedNextWeek,
    provided,
  };
}

/** Display helper: missing stays unavailable, never coerced to "0". */
export function formatNullableMetric(
  value: number | null | undefined,
  formatter: (n: number) => string = String,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatter(value);
}
