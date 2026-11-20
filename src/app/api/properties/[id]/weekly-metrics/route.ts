import { z } from "zod";
import { requireAuth } from "@/lib/auth/session";
import { requirePropertyAccess } from "@/lib/auth/authorize";
import { jsonError, jsonOk } from "@/lib/api/response";
import { validationError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/parse";
import {
  apartmentsLeadSummary,
  metricDeltaMap,
  multiWeekTrend,
  zillowLeadConversionRate,
} from "@/lib/calculations/weekly-metrics";
import {
  freeformStaffNotes,
  resolveWeeklyAgent,
  type WeeklyAgentNotes,
} from "@/lib/weekly/agent-notes";
import type { Json } from "@/domain/database.types";

type RouteContext = { params: Promise<{ id: string }> };

const agentPatchSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toursScheduled: z.number().int().nonnegative().nullable().optional(),
  toursCompleted: z.number().int().nonnegative().nullable().optional(),
  applicationsReceived: z.number().int().nonnegative().nullable().optional(),
  staffNotes: z.string().trim().max(8000).nullable().optional(),
  weeklyComments: z.string().trim().max(8000).nullable().optional(),
  prospectFeedbackSummary: z.string().trim().max(4000).nullable().optional(),
  actionsPlannedNextWeek: z.string().trim().max(4000).nullable().optional(),
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    await requirePropertyAccess(supabase, user, propertyId);

    const { data, error } = await supabase
      .from("weekly_metrics")
      .select("*")
      .eq("property_id", propertyId)
      .order("week_start", { ascending: true });
    if (error) throw validationError("Failed to load weekly metrics", error.message);

    const rows = data ?? [];
    const enriched = rows.map((row, index) => {
      const prev = index > 0 ? rows[index - 1]! : null;
      const zillow = asRecord(row.zillow_metrics);
      const apartments = asRecord(row.apartments_metrics);
      const zMetrics = asRecord(zillow.metrics);
      const prevZ = asRecord(asRecord(prev?.zillow_metrics).metrics);
      const aMetrics = asRecord(apartments.metrics);
      const listingToDate = asRecord(zillow.listingToDate);
      const agent = resolveWeeklyAgent(row);

      const apartmentsEvents = Array.isArray(apartments.events)
        ? apartments.events
        : [];

      return {
        id: row.id,
        propertyId: row.property_id,
        weekStart: row.week_start,
        weekEnd: row.week_end,
        metricScope: "property" as const,
        zillow: {
          windowType: zillow.windowType ?? "last_7_days",
          asOfDate: zillow.asOfDate ?? row.week_end,
          propertyNameRaw: zillow.propertyNameRaw ?? null,
          metrics: {
            impressions: numOrNull(zMetrics.impressions),
            listingViews: numOrNull(zMetrics.listingViews),
            listingWebReferrals: numOrNull(zMetrics.listingWebReferrals),
            totalLeads: numOrNull(zMetrics.totalLeads),
            phoneLeads: numOrNull(zMetrics.phoneLeads),
            emailLeads: numOrNull(zMetrics.emailLeads),
            adImpressions: numOrNull(zMetrics.adImpressions),
            adClicks: numOrNull(zMetrics.adClicks),
          },
          listingToDate: {
            impressions: numOrNull(listingToDate.impressions),
            listingViews: numOrNull(listingToDate.listingViews),
            listingWebReferrals: numOrNull(listingToDate.listingWebReferrals),
            totalLeads: numOrNull(listingToDate.totalLeads),
            phoneLeads: numOrNull(listingToDate.phoneLeads),
            emailLeads: numOrNull(listingToDate.emailLeads),
            adImpressions: numOrNull(listingToDate.adImpressions),
            adClicks: numOrNull(listingToDate.adClicks),
          },
          sourceDocumentId:
            row.zillow_document_id ?? zillow.sourceDocumentId ?? null,
        },
        apartments: {
          metrics: {
            totalLeads: numOrNull(aMetrics.totalLeads),
            phoneCalls: numOrNull(aMetrics.phoneCalls),
            emails: numOrNull(aMetrics.emails),
            tours: numOrNull(aMetrics.tours),
            applications: numOrNull(aMetrics.applications),
          },
          // Sanitized events only — never include renter PII fields
          events: apartmentsEvents,
          sourceDocumentId:
            row.apartments_document_id ?? apartments.sourceDocumentId ?? null,
        },
        agent,
        staffNotesFreeform: freeformStaffNotes(row.staff_notes) || null,
        storage: {
          feedbackSummary: row.feedback_summary ?? null,
          actionsPlanned: row.actions_planned ?? null,
          toursScheduled: row.tours_scheduled,
          toursCompleted: row.tours_completed,
          applicationsReceived: row.applications_received,
        },
        derived: {
          zillowConversionWeek: zillowLeadConversionRate(
            numOrNull(zMetrics.totalLeads),
            numOrNull(zMetrics.listingViews),
          ),
          zillowConversionToDate: zillowLeadConversionRate(
            numOrNull(listingToDate.totalLeads),
            numOrNull(listingToDate.listingViews),
          ),
          zillowWow: metricDeltaMap(zMetrics as never, prevZ as never),
          apartmentsSummary: apartmentsLeadSummary({
            phoneCalls: numOrNull(aMetrics.phoneCalls),
            emails: numOrNull(aMetrics.emails),
            tours: numOrNull(aMetrics.tours),
            applications: numOrNull(aMetrics.applications),
            totalLeads: numOrNull(aMetrics.totalLeads),
          }),
        },
      };
    });

    const chart = enriched.map((w) => ({
      week: w.weekStart,
      zillow: w.zillow.metrics.totalLeads,
      apartments: w.apartments.metrics.totalLeads,
    }));

    const leadsTrend = multiWeekTrend(
      enriched.map((r) => ({
        weekStart: r.weekStart,
        value: r.zillow.metrics.totalLeads,
      })),
    );

    return jsonOk({
      weeks: enriched,
      trends: { zillowTotalLeads: leadsTrend, chart },
      privacyNote:
        "Prospect names, phones, and emails are never included in weekly metric payloads",
      migrationNote:
        "20260317200000 applied — agent fields use dedicated nullable columns; historical ---agent--- JSON remains readable",
    });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Create/update agent weekly input without touching platform export metrics.
 * Writes dedicated nullable columns (true SQL NULL). staff_notes holds freeform
 * comments only (historical ---agent--- JSON is stripped on save).
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    const access = await requirePropertyAccess(supabase, user, propertyId);
    const body = await parseJsonBody(request, agentPatchSchema);

    if (body.weekEnd && body.weekEnd < body.weekStart) {
      throw validationError("weekEnd must be on or after weekStart");
    }

    const { data: existing } = await supabase
      .from("weekly_metrics")
      .select("*")
      .eq("property_id", propertyId)
      .eq("week_start", body.weekStart)
      .maybeSingle();

    const prior = existing ? resolveWeeklyAgent(existing) : null;
    const priorFreeform = freeformStaffNotes(existing?.staff_notes);

    const nextAgent: WeeklyAgentNotes = {
      toursScheduled:
        body.toursScheduled !== undefined
          ? body.toursScheduled
          : (prior?.toursScheduled ?? null),
      toursCompleted:
        body.toursCompleted !== undefined
          ? body.toursCompleted
          : (prior?.toursCompleted ?? null),
      applicationsReceived:
        body.applicationsReceived !== undefined
          ? body.applicationsReceived
          : (prior?.applicationsReceived ?? null),
      weeklyComments:
        body.weeklyComments !== undefined
          ? body.weeklyComments
          : body.staffNotes !== undefined
            ? body.staffNotes
            : (prior?.weeklyComments ?? (priorFreeform || null)),
      prospectFeedbackSummary:
        body.prospectFeedbackSummary !== undefined
          ? body.prospectFeedbackSummary
          : (prior?.prospectFeedbackSummary ?? null),
      actionsPlannedNextWeek:
        body.actionsPlannedNextWeek !== undefined
          ? body.actionsPlannedNextWeek
          : (prior?.actionsPlannedNextWeek ?? null),
      provided: true,
    };

    const staffNotes =
      body.staffNotes !== undefined
        ? (body.staffNotes ?? "").trim() || null
        : nextAgent.weeklyComments?.trim() || null;

    const patch = {
      week_end: body.weekEnd ?? existing?.week_end ?? body.weekStart,
      tours_scheduled: nextAgent.toursScheduled,
      tours_completed: nextAgent.toursCompleted,
      applications_received: nextAgent.applicationsReceived,
      feedback_summary: nextAgent.prospectFeedbackSummary,
      actions_planned: nextAgent.actionsPlannedNextWeek,
      staff_notes: staffNotes,
      zillow_metrics: (existing?.zillow_metrics ?? {}) as Json,
      apartments_metrics: (existing?.apartments_metrics ?? {}) as Json,
    };

    if (existing) {
      const { data, error } = await supabase
        .from("weekly_metrics")
        .update(patch)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw validationError("Failed to update weekly agent input", error.message);
      return jsonOk({
        week: data,
        agent: nextAgent,
        note: "Agent fields stored in dedicated nullable columns; platform exports preserved",
      });
    }

    const { data, error } = await supabase
      .from("weekly_metrics")
      .insert({
        organization_id: access.organizationId,
        property_id: propertyId,
        week_start: body.weekStart,
        ...patch,
      })
      .select("*")
      .single();
    if (error) throw validationError("Failed to create weekly agent input", error.message);
    return jsonOk({ week: data, agent: nextAgent }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
