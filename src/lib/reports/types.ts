import type { CompStatsResult } from "@/lib/calculations/types";

/** Canonical Phase 1 report payload for narrative + PDF (Task #10). */
export type ReportAssemblyStatus =
  | "ready"
  | "blocked_conflicts"
  | "incomplete"
  | "error";

export type NarrativeStatus =
  | "none"
  | "draft"
  | "edited"
  | "approved"
  | "rejected"
  | "stale";

export type NarrativeSections = {
  pricingExplanation: string;
  compComparison: string;
  marketContext: string;
  weeklyPerformance: string;
  suggestedActions: string;
};

export type NarrativeDocument = {
  schemaVersion: 1;
  status: Exclude<NarrativeStatus, "none">;
  sections: NarrativeSections;
  /** Immutable copy of the first AI (or seed) draft; regenerate never overwrites this. */
  originalSections: NarrativeSections;
  inputFingerprint: string;
  model: string | null;
  generatedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  editedBy: string | null;
  userEdited: boolean;
  /** Agent weekly comments — never merged into AI sections. */
  agentWeeklyCommentsRef: string | null;
  warnings: string[];
};

export type AssembledComparable = {
  comparablePropertyId: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  distanceMiles: number | null;
  matchTier: "strongest" | "moderate" | "context" | null;
  sourceType: string;
  rentMin: number | null;
  rentMax: number | null;
  monthlyRent: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  psf: number | null;
  daysOnMarket: number | null;
  notes: string | null;
  photoPaths: string[];
  includedInStats: boolean;
  exclusionReason: string | null;
};

export type AssembledWeek = {
  weekStart: string;
  weekEnd: string;
  metricScope: "property";
  zillow: {
    weekly: Record<string, number | null>;
    listingToDate: Record<string, number | null>;
    conversionWeek: number | null;
    conversionToDate: number | null;
  };
  apartments: {
    phoneCalls: number | null;
    emails: number | null;
    totalLeads: number | null;
    tours: number | null;
    applications: number | null;
  };
  agent: {
    toursScheduled: number | null;
    toursCompleted: number | null;
    applicationsReceived: number | null;
    weeklyComments: string | null;
    prospectFeedbackSummary: string | null;
    actionsPlannedNextWeek: string | null;
  };
};

export type CanonicalReportPayload = {
  schemaVersion: 1;
  assembledAt: string;
  status: ReportAssemblyStatus;
  organization: { id: string; name: string };
  report: {
    id: string;
    title: string;
    status: string;
    periodStart: string;
    periodEnd: string;
    preparedBy: string | null;
    recommendedRentLow: number | null;
    recommendedRentHigh: number | null;
  };
  property: {
    id: string;
    name: string;
    marketingName: string | null;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    postalCode: string;
    yearBuilt: number | null;
    stories: number | null;
    unitCount: number | null;
    amenities: string[];
    listingLinks: Record<string, string>;
    photoPaths: string[];
    /** Ordered subject/comp photo records with optional 3:2 crop metadata. Optional on older snapshots. */
    photos?: Array<{
      id: string;
      storagePath: string;
      comparablePropertyId: string | null;
      sortOrder: number;
      crop: {
        aspect: "3:2";
        x: number;
        y: number;
        width: number;
        height: number;
      } | null;
    }>;
  };
  unitType: {
    id: string;
    label: string;
    beds: number;
    baths: number;
    description: string | null;
  };
  availableUnits: Array<{
    id: string;
    unitNumber: string;
    sqft: number | null;
    askingRent: number | null;
    status: string;
    availableDate?: string | null;
    incomplete?: boolean;
  }>;
  pricing: {
    /** PKL-owned recommendation — Claude must not modify. */
    recommendedRentLow: number | null;
    recommendedRentHigh: number | null;
    recommendationSource: "manual_pkl" | "unset";
    stats: CompStatsResult;
    chart: {
      subjectRents: number[];
      compMonthlyRents: number[];
      rangeLow: number | null;
      rangeHigh: number | null;
      blendedAverage: number | null;
      recommendedLow?: number | null;
      recommendedHigh?: number | null;
    };
    /** Unit-type market averages reviewed by staff (e.g. HelloData). Never substitutes listing Avg DOM. */
    marketStats?: Array<{
      unitTypeLabel: string;
      daysOnMarket: number | null;
      askingRent: number | null;
      listings: number | null;
      sourceLabel: string;
    }>;
  };
  comparables: {
    approvedIncluded: AssembledComparable[];
    approvedExcludedFromStats: AssembledComparable[];
    rejectedOrUnreviewedOmittedCount: number;
    methodology: string[];
  };
  weekly: {
    scopeNote: "Weekly platform metrics are property-wide, not unit-type allocations.";
    weeks: AssembledWeek[];
    latestWeek: AssembledWeek | null;
  };
  quality: {
    pendingConflictCount: number;
    blockedComparableCount: number;
    missingUnitTypeCount: number;
    warnings: string[];
    blockers: string[];
    provenance: Array<{ kind: string; detail: string }>;
  };
  narrative: {
    document: NarrativeDocument | null;
    stale: boolean;
    inputFingerprint: string;
  };
  privacyNote: string;
};
