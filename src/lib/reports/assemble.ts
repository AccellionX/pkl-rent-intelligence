import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/domain/database.types";
import {
  computeApprovedCompStats,
  monthlyComparableRent,
} from "@/lib/calculations";
import {
  apartmentsLeadSummary,
  zillowLeadConversionRate,
} from "@/lib/calculations/weekly-metrics";
import { resolveWeeklyAgent } from "@/lib/weekly/agent-notes";
import { assertNoClientProspectPii } from "@/lib/privacy/client-report-payload";
import { parseCropMetadata } from "@/lib/photos/load-for-pdf";
import { reportInputFingerprint } from "./fingerprint";
import { parseNarrativeDocument } from "./narrative-document";
import type {
  AssembledComparable,
  AssembledWeek,
  CanonicalReportPayload,
} from "./types";
import { selectWeeksForReportPeriod } from "./weekly-period";

type Client = SupabaseClient<Database>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function listingLinksFromJson(value: Json): Record<string, string> {
  const rec = asRecord(value);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (k === "propertyNotes") continue;
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return out;
}

/** Strip internal review stamps from owner-facing comparable notes. */
export function ownerFacingComparableNote(notes: string | null | undefined): string | null {
  if (!notes?.trim()) return null;
  const cleaned = notes
    .split(" · ")
    .map((p) => p.trim())
    .filter((p) => p && !/^\[\d{4}-\d{2}-\d{2}/.test(p))
    .filter((p) => !/^DOM\s/i.test(p))
    .filter((p) => !/Created from reviewed/i.test(p))
    .filter((p) => !/Staff comparable review/i.test(p))
    .filter((p) => !/Accepted during comparable review/i.test(p))
    .join(" · ")
    .trim();
  return cleaned || null;
}

async function loadAcceptedMarketStats(
  supabase: Client,
  propertyId: string,
  focusBeds: number,
): Promise<
  Array<{
    unitTypeLabel: string;
    daysOnMarket: number | null;
    askingRent: number | null;
    listings: number | null;
    sourceLabel: string;
  }>
> {
  const { data: docs } = await supabase
    .from("source_documents")
    .select("id")
    .eq("property_id", propertyId)
    .is("superseded_by", null);
  const docIds = (docs ?? []).map((d) => d.id);
  if (!docIds.length) return [];

  const { data: rows } = await supabase
    .from("extracted_values")
    .select("field_key, normalized_value, review_status")
    .in("source_document_id", docIds)
    .eq("review_status", "accepted")
    .like("field_key", "hellodata.market.%");

  return (rows ?? [])
    .map((row) => {
      const nv = asRecord(row.normalized_value);
      const beds = numOrNull(nv.beds);
      const label = String(nv.unitTypeLabel ?? row.field_key.replace("hellodata.market.", ""));
      return {
        unitTypeLabel: label,
        daysOnMarket: numOrNull(nv.daysOnMarket),
        askingRent: numOrNull(nv.askingRent),
        listings: numOrNull(nv.listings),
        sourceLabel: "HelloData",
        beds,
      };
    })
    .filter((m) => m.beds == null || m.beds === focusBeds)
    .map((m) => ({
      unitTypeLabel: m.unitTypeLabel,
      daysOnMarket: m.daysOnMarket,
      askingRent: m.askingRent,
      listings: m.listings,
      sourceLabel: m.sourceLabel,
    }));
}

/**
 * Assemble the canonical Phase 1 report payload for narrative + PDF prep.
 * Live-mode only — never injects demo seed data.
 */
export async function assembleReportPayload(
  supabase: Client,
  reportId: string,
): Promise<CanonicalReportPayload> {
  const { data: report, error: reportError } = await supabase
    .from("report_runs")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();
  if (reportError) throw new Error(reportError.message);
  if (!report) throw new Error("Report not found");

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", report.organization_id)
    .single();

  const { data: property, error: propError } = await supabase
    .from("properties")
    .select("*")
    .eq("id", report.property_id)
    .single();
  if (propError || !property) throw new Error(propError?.message ?? "Property not found");

  const { data: unitType, error: utError } = await supabase
    .from("unit_types")
    .select("*")
    .eq("id", report.unit_type_id)
    .single();
  if (utError || !unitType) throw new Error(utError?.message ?? "Unit type not found");

  const { data: units } = await supabase
    .from("subject_units")
    .select("*")
    .eq("property_id", report.property_id)
    .eq("unit_type_id", report.unit_type_id);

  const availableUnits = (units ?? [])
    .filter((u) => u.status === "available")
    .map((u) => {
      const askingRent = u.asking_rent != null ? Number(u.asking_rent) : null;
      return {
        id: u.id,
        unitNumber: u.unit_number,
        sqft: u.sqft,
        askingRent,
        status: u.status,
        availableDate: u.available_date,
        incomplete:
          !u.unit_number ||
          u.sqft == null ||
          askingRent == null ||
          !u.unit_type_id,
      };
    });

  const { data: pendingConflicts } = await supabase
    .from("source_value_conflicts")
    .select("id, comparable_property_id, status")
    .eq("property_id", report.property_id)
    .eq("status", "pending");

  const blockedCompIds = new Set(
    (pendingConflicts ?? [])
      .map((c) => c.comparable_property_id)
      .filter((v): v is string => Boolean(v)),
  );

  const { data: unitData } = await supabase
    .from("comparable_unit_data")
    .select(
      "*, comparable_properties(id, name, address_line1, city, state, distance_miles)",
    )
    .eq("organization_id", report.organization_id)
    .eq("unit_type_id", report.unit_type_id);

  const allUnitRows = unitData ?? [];
  const approvedRows = allUnitRows.filter((r) => r.status === "approved");
  const omittedCount = allUnitRows.filter((r) => r.status !== "approved").length;

  const { data: photos } = await supabase
    .from("report_photos")
    .select(
      "id, property_id, comparable_property_id, storage_path, sort_order, crop_metadata, source",
    )
    .eq("organization_id", report.organization_id)
    .eq("property_id", report.property_id);

  const photoRecords = (photos ?? [])
    .map((p) => ({
      id: p.id,
      storagePath: p.storage_path,
      comparablePropertyId: p.comparable_property_id,
      sortOrder: p.sort_order,
      source: p.source,
      crop: parseCropMetadata(p.crop_metadata),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Subject gallery: property-level uploads only. Orphan MLS rows without a
  // comparable_property_id must not inflate subject photo counts on the PDF.
  const subjectPhotoPaths = photoRecords
    .filter((p) => !p.comparablePropertyId && p.source !== "mls")
    .map((p) => p.storagePath);

  const photosByComp = new Map<string, string[]>();
  for (const p of photoRecords) {
    if (!p.comparablePropertyId) continue;
    const list = photosByComp.get(p.comparablePropertyId) ?? [];
    list.push(p.storagePath);
    photosByComp.set(p.comparablePropertyId, list);
  }

  const assembledComps: AssembledComparable[] = approvedRows.map((row) => {
    const comp = row.comparable_properties as
      | {
          id: string;
          name: string;
          address_line1: string;
          city: string;
          state: string;
          distance_miles: number | null;
        }
      | null;
    const hasConflict = blockedCompIds.has(row.comparable_property_id);
    const missingType = row.has_available_data === false;
    let exclusionReason: string | null = null;
    let included = true;
    if (hasConflict) {
      included = false;
      exclusionReason = "Unresolved source conflict";
    } else if (missingType) {
      included = false;
      exclusionReason = "No unit-type data available";
    }
    const monthly = monthlyComparableRent(row.rent_min, row.rent_max);
    return {
      comparablePropertyId: row.comparable_property_id,
      name: comp?.name ?? "Comparable",
      addressLine1: comp?.address_line1 ?? "",
      city: comp?.city ?? "",
      state: comp?.state ?? "",
      distanceMiles: comp?.distance_miles ?? null,
      matchTier: row.match_tier,
      sourceType: row.source_type,
      rentMin: row.rent_min != null ? Number(row.rent_min) : null,
      rentMax: row.rent_max != null ? Number(row.rent_max) : null,
      monthlyRent: monthly,
      sqftMin: row.sqft_min,
      sqftMax: row.sqft_max,
      psf: row.psf != null ? Number(row.psf) : null,
      daysOnMarket: row.days_on_market,
      notes: ownerFacingComparableNote(
        typeof row.notes === "string" ? row.notes : null,
      ),
      photoPaths: photosByComp.get(row.comparable_property_id) ?? [],
      includedInStats: included,
      exclusionReason,
    };
  });

  const statRows = assembledComps.map((c) => ({
    comparablePropertyId: c.comparablePropertyId,
    addressKey: `${c.addressLine1}, ${c.city}, ${c.state}`.toLowerCase(),
    buildingKey: c.comparablePropertyId,
    unitTypeKey: report.unit_type_id,
    source: c.sourceType,
    rentMin: c.rentMin,
    rentMax: c.rentMax,
    sqftMin: c.sqftMin,
    sqftMax: c.sqftMax,
    psf: c.psf,
    daysOnMarket: c.daysOnMarket,
    distanceMiles: c.distanceMiles,
    matchTier: c.matchTier,
    hasAvailableData: c.exclusionReason !== "No unit-type data available",
    eligibleForStats: c.includedInStats,
  }));

  const stats = computeApprovedCompStats(statRows);

  const { data: weeklyRows } = await supabase
    .from("weekly_metrics")
    .select("*")
    .eq("property_id", report.property_id)
    .order("week_start", { ascending: true });

  const weeks: AssembledWeek[] = (weeklyRows ?? []).map((row) => {
    const zillow = asRecord(row.zillow_metrics);
    const apartments = asRecord(row.apartments_metrics);
    const zMetrics = asRecord(zillow.metrics);
    const listingToDate = asRecord(zillow.listingToDate);
    const aMetrics = asRecord(apartments.metrics);
    const agent = resolveWeeklyAgent(row);
    return {
      weekStart: row.week_start,
      weekEnd: row.week_end,
      metricScope: "property",
      zillow: {
        weekly: {
          impressions: numOrNull(zMetrics.impressions),
          listingViews: numOrNull(zMetrics.listingViews),
          totalLeads: numOrNull(zMetrics.totalLeads),
          phoneLeads: numOrNull(zMetrics.phoneLeads),
          emailLeads: numOrNull(zMetrics.emailLeads),
          adImpressions: numOrNull(zMetrics.adImpressions),
          adClicks: numOrNull(zMetrics.adClicks),
        },
        listingToDate: {
          impressions: numOrNull(listingToDate.impressions),
          listingViews: numOrNull(listingToDate.listingViews),
          totalLeads: numOrNull(listingToDate.totalLeads),
          phoneLeads: numOrNull(listingToDate.phoneLeads),
          emailLeads: numOrNull(listingToDate.emailLeads),
        },
        conversionWeek: zillowLeadConversionRate(
          numOrNull(zMetrics.totalLeads),
          numOrNull(zMetrics.listingViews),
        ),
        conversionToDate: zillowLeadConversionRate(
          numOrNull(listingToDate.totalLeads),
          numOrNull(listingToDate.listingViews),
        ),
      },
      apartments: {
        phoneCalls: numOrNull(aMetrics.phoneCalls),
        emails: numOrNull(aMetrics.emails),
        totalLeads: numOrNull(aMetrics.totalLeads),
        tours: numOrNull(aMetrics.tours),
        applications: numOrNull(aMetrics.applications),
      },
      agent: {
        toursScheduled: agent.toursScheduled,
        toursCompleted: agent.toursCompleted,
        applicationsReceived: agent.applicationsReceived,
        weeklyComments: agent.weeklyComments,
        prospectFeedbackSummary: agent.prospectFeedbackSummary,
        actionsPlannedNextWeek: agent.actionsPlannedNextWeek,
      },
    };
  });

  // Touch apartmentsLeadSummary for formula provenance (unused return).
  void apartmentsLeadSummary;

  const warnings: string[] = [];
  const blockers: string[] = [];
  const pendingConflictCount = pendingConflicts?.length ?? 0;
  const missingUnitTypeCount = assembledComps.filter(
    (c) => c.exclusionReason === "No unit-type data available",
  ).length;

  const incompleteUnits = availableUnits.filter((u) => u.incomplete);
  if (incompleteUnits.length > 0) {
    warnings.push(
      `${incompleteUnits.length} subject unit(s) missing rent/sqft/number — flagged for review`,
    );
  }
  if (subjectPhotoPaths.length === 0) {
    warnings.push("Subject photos missing — placeholders will be used");
  }

  if (pendingConflictCount > 0) {
    blockers.push(
      `${pendingConflictCount} unresolved source conflict(s) — affected comps excluded from stats`,
    );
  }
  if (report.recommended_rent_low == null || report.recommended_rent_high == null) {
    warnings.push("PKL recommended rent range is not set on this report run");
  }
  if (stats.eligibleGroupedCount === 0) {
    warnings.push("No eligible approved comps for deterministic stats");
  }
  const { periodWeeks, currentWeek, historicalWeeks } = selectWeeksForReportPeriod(
    weeks,
    report.period_start,
    report.period_end,
  );
  if (weeks.length === 0) {
    warnings.push("No weekly marketing data has been uploaded for this property yet");
  } else if (!currentWeek) {
    warnings.push(
      `No weekly marketing data for ${report.period_start} – ${report.period_end}. Upload Zillow and Apartments.com exports for this reporting period.`,
    );
    if (historicalWeeks.length > 0) {
      warnings.push(
        `${historicalWeeks.length} older week(s) are on file for historical context only — they are not used as current-week performance.`,
      );
    }
  }
  if (omittedCount > 0) {
    warnings.push(
      `${omittedCount} unreviewed/rejected comparable unit row(s) omitted from payload`,
    );
  }

  let status: CanonicalReportPayload["status"] = "ready";
  if (blockers.length > 0 && stats.eligibleGroupedCount === 0) {
    status = "blocked_conflicts";
  } else if (
    report.recommended_rent_low == null ||
    report.recommended_rent_high == null ||
    stats.eligibleGroupedCount === 0
  ) {
    status = "incomplete";
  }

  const narrativeDoc = parseNarrativeDocument(report.narrative_draft);
  const approvedIncluded = assembledComps.filter((c) => c.includedInStats);
  const approvedExcluded = assembledComps.filter((c) => !c.includedInStats);

  const base = {
    schemaVersion: 1 as const,
    status,
    organization: {
      id: org?.id ?? report.organization_id,
      name: org?.name ?? "Organization",
    },
    report: {
      id: report.id,
      title: report.title,
      status: report.status,
      periodStart: report.period_start,
      periodEnd: report.period_end,
      preparedBy: report.prepared_by,
      recommendedRentLow:
        report.recommended_rent_low != null
          ? Number(report.recommended_rent_low)
          : null,
      recommendedRentHigh:
        report.recommended_rent_high != null
          ? Number(report.recommended_rent_high)
          : null,
    },
    property: {
      id: property.id,
      name: property.name,
      marketingName: property.marketing_name,
      addressLine1: property.address_line1,
      addressLine2: property.address_line2,
      city: property.city,
      state: property.state,
      postalCode: property.postal_code,
      yearBuilt: property.year_built,
      stories: property.stories,
      unitCount: property.unit_count,
      amenities: property.amenities ?? [],
      listingLinks: listingLinksFromJson(property.external_links),
      photoPaths: subjectPhotoPaths,
      photos: photoRecords,
    },
    unitType: {
      id: unitType.id,
      label: unitType.label,
      beds: Number(unitType.beds),
      baths: Number(unitType.baths),
      description: unitType.description,
    },
    availableUnits,
    pricing: {
      recommendedRentLow:
        report.recommended_rent_low != null
          ? Number(report.recommended_rent_low)
          : null,
      recommendedRentHigh:
        report.recommended_rent_high != null
          ? Number(report.recommended_rent_high)
          : null,
      recommendationSource:
        report.recommended_rent_low != null && report.recommended_rent_high != null
          ? ("manual_pkl" as const)
          : ("unset" as const),
      stats,
      chart: {
        subjectRents: availableUnits
          .map((u) => u.askingRent)
          .filter((n): n is number => n != null),
        compMonthlyRents: approvedIncluded
          .map((c) => c.monthlyRent)
          .filter((n): n is number => n != null),
        rangeLow: stats.rangeLow,
        rangeHigh: stats.rangeHigh,
        blendedAverage: stats.blendedAverageRent,
        recommendedLow:
          report.recommended_rent_low != null
            ? Number(report.recommended_rent_low)
            : null,
        recommendedHigh:
          report.recommended_rent_high != null
            ? Number(report.recommended_rent_high)
            : null,
      },
      marketStats: await loadAcceptedMarketStats(supabase, property.id, Number(unitType.beds)),
    },
    comparables: {
      approvedIncluded,
      approvedExcludedFromStats: approvedExcluded,
      rejectedOrUnreviewedOmittedCount: omittedCount,
      methodology: [
        "Pricing uses only staff-approved comparable listings for this unit type.",
        "Listings at the same address are grouped so one building is not counted multiple times.",
        "Blended average and rent range come from those approved, grouped listings.",
        "Price per square foot uses available square-footage when provided.",
        "Listings still awaiting review, or marked excluded, are omitted from pricing.",
        "The recommended rent range is set by PKL staff and is not overwritten by market averages or narrative tools.",
        "Unit-type market averages (for example HelloData days on market) are shown separately when staff accept them — they do not replace the average days on market across approved individual listings.",
      ],
    },
    weekly: {
      scopeNote:
        "Weekly platform metrics are property-wide, not unit-type allocations." as const,
      // Only period-matched weeks enter current-report charts/KPIs.
      // Older weeks are never promoted as current-week performance.
      weeks: periodWeeks,
      latestWeek: currentWeek,
    },
    quality: {
      pendingConflictCount,
      blockedComparableCount: approvedExcluded.filter((c) =>
        c.exclusionReason?.includes("conflict"),
      ).length,
      missingUnitTypeCount,
      warnings,
      blockers,
      provenance: [
        { kind: "calculations", detail: "src/lib/calculations deterministic stats" },
        { kind: "weekly_metrics", detail: "public.weekly_metrics jsonb + agent columns" },
        { kind: "comps", detail: "comparable_unit_data status=approved only" },
      ],
    },
    privacyNote:
      "Prospect contact details are not included in owner reports.",
  };

  const fingerprint = reportInputFingerprint(base);
  const stale =
    narrativeDoc != null &&
    narrativeDoc.inputFingerprint !== "legacy" &&
    narrativeDoc.inputFingerprint !== fingerprint &&
    narrativeDoc.status !== "rejected";

  const payload: CanonicalReportPayload = {
    ...base,
    assembledAt: new Date().toISOString(),
    narrative: {
      document: stale && narrativeDoc
        ? { ...narrativeDoc, status: "stale" }
        : narrativeDoc,
      stale,
      inputFingerprint: fingerprint,
    },
  };

  assertNoClientProspectPii(payload);
  return payload;
}
