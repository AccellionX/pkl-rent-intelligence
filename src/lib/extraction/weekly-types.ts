import type { ExtractionWarning } from "./types";

export const ZILLOW_PARSER_VERSION = "zillow-xlsx-v1";
export const APARTMENTS_PARSER_VERSION = "apartments-xlsx-v1";

/** Zillow Sheet1 (no “Last 7 days” title) is cumulative listing-to-date. */
export type WeeklyWindowType = "last_7_days" | "listing_to_date";

export type MetricScope = "property";

export interface ZillowListingMetrics {
  impressions: number | null;
  listingViews: number | null;
  listingWebReferrals: number | null;
  totalLeads: number | null;
  phoneLeads: number | null;
  emailLeads: number | null;
  adImpressions: number | null;
  adClicks: number | null;
  daysOnMarket: number | null;
  spotlightDays: number | null;
  advertisingType: string | null;
  publishedStatus: string | null;
}

export interface ZillowPeriodSnapshot {
  sheetName: string;
  windowType: WeeklyWindowType;
  /** Inclusive end date for last_7_days (“as of”); null for listing_to_date. */
  asOfDate: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  title: string | null;
  propertyNameRaw: string;
  city: string | null;
  state: string | null;
  metrics: ZillowListingMetrics;
  matchConfidence: "exact" | "strong" | "ambiguous" | "none";
  matchReason: string;
}

export interface ZillowParseResult {
  dialect: "zillow_rental_manager";
  parserVersion: string;
  sheetNames: string[];
  snapshots: ZillowPeriodSnapshot[];
  /** listing_to_date row for the matched property when present */
  listingToDate: ZillowPeriodSnapshot | null;
  warnings: ExtractionWarning[];
}

export interface ApartmentsSanitizedLeadEvent {
  category: "phone" | "email" | "tour" | "application";
  datetime: string | null;
  /** Duration for calls only — never phone numbers */
  duration: string | null;
  status: string | null;
  moveDate: string | null;
  desiredBedsBaths: string | null;
  /** Non-identifying comment text only; names/phones/emails stripped */
  commentSummary: string | null;
  timeOnListingPage: string | null;
}

export interface ApartmentsParseResult {
  dialect: "apartments_com_leads";
  parserVersion: string;
  sheetNames: string[];
  weekStart: string | null;
  weekEnd: string | null;
  dateRangeRaw: string | null;
  totalLeads: number | null;
  phoneCalls: number | null;
  emails: number | null;
  tours: number | null;
  applications: number | null;
  propertyNameFromReport: string | null;
  totalPropertiesInReport: number | null;
  /** Sanitized events only — no prospect PII fields */
  events: ApartmentsSanitizedLeadEvent[];
  warnings: ExtractionWarning[];
  piiColumnsOmitted: string[];
}

export interface WeeklyAgentInput {
  toursScheduled: number | null;
  toursCompleted: number | null;
  applicationsReceived: number | null;
  prospectFeedbackSummary: string | null;
  weeklyComments: string | null;
  actionsPlannedNextWeek: string | null;
}

export interface WeeklyMetricsPayload {
  weekStart: string;
  weekEnd: string;
  metricScope: MetricScope;
  zillow: {
    windowType: WeeklyWindowType;
    asOfDate: string | null;
    propertyNameRaw: string | null;
    metrics: ZillowListingMetrics | null;
    listingToDate: ZillowListingMetrics | null;
    sourceDocumentId: string | null;
    parserVersion: string | null;
  } | null;
  apartments: {
    metrics: {
      totalLeads: number | null;
      phoneCalls: number | null;
      emails: number | null;
      tours: number | null;
      applications: number | null;
    };
    events: ApartmentsSanitizedLeadEvent[];
    propertyNameFromReport: string | null;
    sourceDocumentId: string | null;
    parserVersion: string | null;
  } | null;
  agent: WeeklyAgentInput;
  warnings: ExtractionWarning[];
}
