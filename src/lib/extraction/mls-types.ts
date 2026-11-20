import type { ExtractionWarning } from "./types";

export const MLS_RI_PARSER_VERSION = "mls-ri-pdf@1.0.0";
export const MLS_CT_PARSER_VERSION = "mls-ct-pdf@1.0.0";

export type MlsDialect = "ri_statewide" | "ct_connectmls" | "unknown";

export interface MlsListingPhotoCandidate {
  page: number;
  imageKey: string;
  width: number;
  height: number;
  /** Content hash after encode (when available). */
  contentSha256?: string | null;
  /** True when filtered as likely logo/icon/background. */
  rejectedAsNonProperty?: boolean;
  rejectReason?: string | null;
}

export interface MlsListing {
  mlsNumber: string | null;
  addressLine1: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  listRent: number | null;
  status: string | null;
  beds: number | null;
  baths: number | null;
  bathsRaw: string | null;
  sqft: number | null;
  psf: number | null;
  daysOnMarket: number | null;
  listDate: string | null;
  yearBuilt: number | null;
  propertyType: string | null;
  parking: string | null;
  utilitiesTenant: string | null;
  amenities: string[];
  description: string | null;
  availability: string | null;
  /** Pages contributing to this listing (1-based). */
  pageRefs: number[];
  /** Primary record source within the PDF. */
  recordSource: "detail" | "summary" | "comparison" | "photo_gallery";
  flags: ExtractionWarning[];
  rawSnippets: string[];
  photoCandidates: MlsListingPhotoCandidate[];
}

export interface MlsDocumentSummary {
  dialect: MlsDialect;
  reportDate: string | null;
  preparedBy: string | null;
  activeCount: number | null;
  averageListRent: number | null;
  /** Document-level stats only — not listing rows. */
  notes: string[];
}

export interface MlsParseResult {
  dialect: MlsDialect;
  parserVersion: string;
  pageCount: number;
  summary: MlsDocumentSummary;
  listings: MlsListing[];
  warnings: ExtractionWarning[];
  /** Listing MLS numbers seen on summary/comparison pages that were not double-imported. */
  dedupedMlsNumbers: string[];
}

export function isValidMlsRent(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && value > 0;
}

export function isValidMlsSqft(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && value >= 150 && value <= 20000;
}
