import { describe, expect, it } from "vitest";
import { computeApprovedCompStats } from "@/lib/calculations";
import { reportInputFingerprint } from "@/lib/reports/fingerprint";
import {
  mergePreservingUserEdits,
  parseNarrativeDocument,
  serializeNarrativeDocument,
  emptySections,
} from "@/lib/reports/narrative-document";
import { buildDeterministicNarrativeDraft } from "@/lib/reports/claude-narrative";
import { buildClaudePromptPayload, scrubFreeText } from "@/lib/reports/sanitize-for-claude";
import {
  collectAllowedFigures,
  findDisallowedMoneyFigures,
} from "@/lib/reports/validate-ai-figures";
import { scanClientReportPayload } from "@/lib/privacy/client-report-payload";
import type { CanonicalReportPayload, NarrativeDocument } from "@/lib/reports/types";

function samplePayload(overrides: Partial<CanonicalReportPayload> = {}): CanonicalReportPayload {
  const stats = computeApprovedCompStats([
    {
      comparablePropertyId: "c1",
      addressKey: "100 main st, providence, ri",
      buildingKey: "c1",
      unitTypeKey: "ut1",
      source: "rentometer",
      rentMin: 2100,
      rentMax: 2100,
      sqftMin: 900,
      sqftMax: 900,
      psf: 2.33,
      daysOnMarket: 12,
      distanceMiles: 0.4,
      matchTier: "strongest",
      hasAvailableData: true,
      eligibleForStats: true,
    },
    {
      comparablePropertyId: "c2",
      addressKey: "200 main st, providence, ri",
      buildingKey: "c2",
      unitTypeKey: "ut1",
      source: "hellodata",
      rentMin: 2200,
      rentMax: 2300,
      sqftMin: 950,
      sqftMax: 950,
      psf: 2.37,
      daysOnMarket: 20,
      distanceMiles: 0.6,
      matchTier: "moderate",
      hasAvailableData: true,
      eligibleForStats: true,
    },
    {
      comparablePropertyId: "c3",
      addressKey: "conflict st",
      buildingKey: "c3",
      unitTypeKey: "ut1",
      source: "mls",
      rentMin: 9999,
      rentMax: 9999,
      sqftMin: 900,
      sqftMax: 900,
      psf: 11,
      daysOnMarket: 1,
      distanceMiles: 1,
      matchTier: "context",
      hasAvailableData: true,
      eligibleForStats: false,
    },
  ]);

  const base: CanonicalReportPayload = {
    schemaVersion: 1,
    assembledAt: "2026-11-17T00:00:00.000Z",
    status: "ready",
    organization: { id: "org", name: "PKL" },
    report: {
      id: "rep",
      title: "855 Providence 2BR",
      status: "in_progress",
      periodStart: "2026-11-03",
      periodEnd: "2026-11-10",
      preparedBy: "Agent",
      recommendedRentLow: 2150,
      recommendedRentHigh: 2250,
    },
    property: {
      id: "prop",
      name: "855 Providence St",
      marketingName: null,
      addressLine1: "855 Providence St",
      addressLine2: null,
      city: "West Warwick",
      state: "RI",
      postalCode: "02893",
      yearBuilt: 2020,
      stories: 3,
      unitCount: 24,
      amenities: ["Fitness"],
      listingLinks: { zillow: "https://example.com/z" },
      photoPaths: [],
    },
    unitType: {
      id: "ut1",
      label: "2BR",
      beds: 2,
      baths: 2,
      description: null,
    },
    availableUnits: [
      { id: "u1", unitNumber: "201", sqft: 980, askingRent: 2200, status: "available" },
    ],
    pricing: {
      recommendedRentLow: 2150,
      recommendedRentHigh: 2250,
      recommendationSource: "manual_pkl",
      stats,
      chart: {
        subjectRents: [2200],
        compMonthlyRents: [2100, 2250],
        rangeLow: stats.rangeLow,
        rangeHigh: stats.rangeHigh,
        blendedAverage: stats.blendedAverageRent,
      },
    },
    comparables: {
      approvedIncluded: [
        {
          comparablePropertyId: "c1",
          name: "Comp One",
          addressLine1: "100 Main St",
          city: "Providence",
          state: "RI",
          distanceMiles: 0.4,
          matchTier: "strongest",
          sourceType: "rentometer",
          rentMin: 2100,
          rentMax: 2100,
          monthlyRent: 2100,
          sqftMin: 900,
          sqftMax: 900,
          psf: 2.33,
          daysOnMarket: 12,
          notes: null,
          photoPaths: [],
          includedInStats: true,
          exclusionReason: null,
        },
      ],
      approvedExcludedFromStats: [
        {
          comparablePropertyId: "c3",
          name: "Conflict Comp",
          addressLine1: "Conflict St",
          city: "Providence",
          state: "RI",
          distanceMiles: 1,
          matchTier: "context",
          sourceType: "mls",
          rentMin: 9999,
          rentMax: 9999,
          monthlyRent: 9999,
          sqftMin: 900,
          sqftMax: 900,
          psf: 11,
          daysOnMarket: 1,
          notes: null,
          photoPaths: [],
          includedInStats: false,
          exclusionReason: "Unresolved source conflict",
        },
      ],
      rejectedOrUnreviewedOmittedCount: 2,
      methodology: ["deterministic"],
    },
    weekly: {
      scopeNote: "Weekly platform metrics are property-wide, not unit-type allocations.",
      weeks: [
        {
          weekStart: "2026-11-04",
          weekEnd: "2026-11-10",
          metricScope: "property",
          zillow: {
            weekly: {
              impressions: 6575,
              listingViews: 237,
              totalLeads: 10,
              phoneLeads: 0,
              emailLeads: 10,
              adImpressions: 2084,
              adClicks: 82,
            },
            listingToDate: {
              impressions: 37419,
              listingViews: 1045,
              totalLeads: 28,
              phoneLeads: 3,
              emailLeads: 25,
            },
            conversionWeek: 0.0422,
            conversionToDate: 0.0268,
          },
          apartments: {
            phoneCalls: 1,
            emails: 1,
            totalLeads: 2,
            tours: null,
            applications: null,
          },
          agent: {
            toursScheduled: 2,
            toursCompleted: 1,
            applicationsReceived: null,
            weeklyComments: "task08 agent comments",
            prospectFeedbackSummary: "Asked about parking",
            actionsPlannedNextWeek: "Follow up mid-week",
          },
        },
      ],
      latestWeek: null,
    },
    quality: {
      pendingConflictCount: 1,
      blockedComparableCount: 1,
      missingUnitTypeCount: 0,
      warnings: [],
      blockers: ["1 unresolved source conflict(s) — affected comps excluded from stats"],
      provenance: [],
    },
    narrative: {
      document: null,
      stale: false,
      inputFingerprint: "x",
    },
    privacyNote: "no pii",
  };
  base.weekly.latestWeek = base.weekly.weeks[0]!;
  return { ...base, ...overrides };
}

describe("report narrative assembly helpers", () => {
  it("omits conflict comps from eligible stats while preserving recommendation", () => {
    const payload = samplePayload();
    expect(payload.pricing.stats.eligibleGroupedCount).toBe(2);
    expect(payload.pricing.stats.rangeHigh).toBeLessThan(9999);
    expect(payload.pricing.recommendedRentLow).toBe(2150);
    expect(payload.comparables.approvedExcludedFromStats[0]?.exclusionReason).toMatch(
      /conflict/i,
    );
    expect(payload.comparables.rejectedOrUnreviewedOmittedCount).toBe(2);
  });

  it("distinguishes weekly vs listing-to-date metrics in deterministic draft", () => {
    const payload = samplePayload();
    const draft = buildDeterministicNarrativeDraft(payload);
    expect(draft.weeklyPerformance).toMatch(/6575|10|unavailable|week/i);
    expect(draft.weeklyPerformance).toMatch(/listing-to-date|28/i);
    expect(draft.pricingExplanation).toMatch(/\$2150–\$2250/);
    expect(draft.suggestedActions).toMatch(/Follow up mid-week/);
  });

  it("detects stale fingerprints when recommendation changes", () => {
    const a = samplePayload();
    const fp1 = reportInputFingerprint(a);
    const b = samplePayload({
      pricing: {
        ...a.pricing,
        recommendedRentLow: 2300,
        recommendedRentHigh: 2400,
      },
      report: {
        ...a.report,
        recommendedRentLow: 2300,
        recommendedRentHigh: 2400,
      },
    });
    const fp2 = reportInputFingerprint(b);
    expect(fp1).not.toBe(fp2);
  });

  it("preserves user edits on regenerate merge", () => {
    const previous: NarrativeDocument = {
      schemaVersion: 1,
      status: "edited",
      sections: {
        ...emptySections(),
        pricingExplanation: "Human-edited explanation",
        compComparison: "original comps",
      },
      originalSections: {
        ...emptySections(),
        pricingExplanation: "AI explanation",
        compComparison: "original comps",
      },
      inputFingerprint: "abc",
      model: "test",
      generatedAt: new Date().toISOString(),
      approvedAt: null,
      approvedBy: null,
      editedBy: null,
      userEdited: true,
      agentWeeklyCommentsRef: null,
      warnings: [],
    };
    const next = {
      ...emptySections(),
      pricingExplanation: "New AI explanation",
      compComparison: "New AI comps",
    };
    const merged = mergePreservingUserEdits(previous, next, true);
    expect(merged.pricingExplanation).toBe("Human-edited explanation");
    expect(merged.compComparison).toBe("New AI comps");
  });

  it("round-trips narrative document serialization", () => {
    const doc: NarrativeDocument = {
      schemaVersion: 1,
      status: "draft",
      sections: {
        pricingExplanation: "a",
        compComparison: "b",
        marketContext: "c",
        weeklyPerformance: "d",
        suggestedActions: "e",
      },
      originalSections: {
        pricingExplanation: "a",
        compComparison: "b",
        marketContext: "c",
        weeklyPerformance: "d",
        suggestedActions: "e",
      },
      inputFingerprint: "fingerprint-value-123456",
      model: "deterministic-test-draft",
      generatedAt: "2026-11-17T12:00:00.000Z",
      approvedAt: null,
      approvedBy: null,
      editedBy: null,
      userEdited: false,
      agentWeeklyCommentsRef: "agent notes",
      warnings: [],
    };
    const parsed = parseNarrativeDocument(serializeNarrativeDocument(doc));
    expect(parsed?.sections.pricingExplanation).toBe("a");
    expect(parsed?.agentWeeklyCommentsRef).toBe("agent notes");
  });

  it("scrubs PII from Claude prompt and rejects dirty money figures", () => {
    const scrubbed = scrubFreeText("Call 401-555-0100 or jane@example.com");
    expect(scrubbed.text).toMatch(/redacted/);
    expect(scrubbed.warnings.length).toBeGreaterThan(0);

    const payload = samplePayload();
    const { promptPayload } = buildClaudePromptPayload(payload);
    expect(scanClientReportPayload(promptPayload).ok).toBe(true);

    const allowed = collectAllowedFigures(payload);
    const bad = findDisallowedMoneyFigures(
      {
        ...emptySections(),
        pricingExplanation: "We recommend $99999 which is invented.",
      },
      allowed,
    );
    expect(bad.length).toBeGreaterThan(0);

    const good = findDisallowedMoneyFigures(
      {
        ...emptySections(),
        pricingExplanation: "PKL recommends $2150–$2250.",
      },
      allowed,
    );
    expect(good).toEqual([]);
  });

  it("does not claim live Claude when ANTHROPIC_API_KEY is absent", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const { getAnthropicApiKey } = await import("@/lib/reports/claude-narrative");
    expect(getAnthropicApiKey()).toBeNull();
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  });

  it("marks usedLiveClaude only for successful live API (not key presence alone)", async () => {
    const { generateClaudeNarrative, getAnthropicApiKey } = await import(
      "@/lib/reports/claude-narrative"
    );
    // Without a key, generateClaudeNarrative must not report usedLiveApi.
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(getAnthropicApiKey()).toBeNull();
    const missing = await generateClaudeNarrative(samplePayload());
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("missing_api_key");
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;

    // Key presence alone must never imply success — usedLiveApi is only on ok:true.
    const blocked = await generateClaudeNarrative(
      samplePayload({ status: "blocked_conflicts" }),
    );
    expect(blocked.ok).toBe(false);
    expect("usedLiveApi" in blocked ? blocked.usedLiveApi : false).toBe(false);
  });
});
