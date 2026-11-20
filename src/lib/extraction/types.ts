export type RentometerSourceType =
  | "rentometer_csv"
  | "rentometer_xlsx"
  | "rentometer_pdf";

export type ExtractionWarningCode =
  | "blank_address"
  | "invalid_rent"
  | "invalid_sqft"
  | "missing_sqft"
  | "suspicious_sqft"
  | "blank_row"
  | "subject_property_row"
  | "unsupported_layout"
  | "report_id_mismatch"
  | "parse_partial"
  | "no_listings"
  | "dialect_uncertain"
  | "gallery_only"
  | "zillow_sheet_skipped"
  | "zillow_ambiguous_property"
  | "zillow_property_unmatched"
  | "zillow_no_weekly_sheet"
  | "apartments_property_name_missing"
  | "apartments_tours_missing"
  | "apartments_applications_missing"
  | "apartments_period_unparsed";

export interface ExtractionWarning {
  code: ExtractionWarningCode;
  message: string;
  rowRef?: string;
  field?: string;
}

export interface NormalizedAddressParts {
  raw: string;
  normalized: string;
  line1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}

export interface RentometerCandidate {
  rowIndex: number;
  rowRef: string;
  raw: Record<string, string>;
  /** Marketed / community name when the export includes a name column. */
  name: string | null;
  address: NormalizedAddressParts | null;
  rent: number | null;
  sqft: number | null;
  psf: number | null;
  beds: number | null;
  baths: number | null;
  distanceMiles: number | null;
  propertyType: string | null;
  listDate: string | null;
  outlier: boolean | null;
  /** Listing or property website URL when present as plain text or hyperlink target. */
  listingUrl: string | null;
  isSubjectLikely: boolean;
  isBlankRow: boolean;
  flags: ExtractionWarning[];
  /** Candidate for curated review — never auto-approved. */
  includeAsCompCandidate: boolean;
}

export interface RentometerSummaryMetrics {
  reportId: string | null;
  generatedDate: string | null;
  sampleSize: number | null;
  averageRent: number | null;
  medianRent: number | null;
  percentile25: number | null;
  percentile75: number | null;
  sampleMin: number | null;
  sampleMax: number | null;
  sampleStdDev: number | null;
  radiusMiles: number | null;
  bedroomFilter: number | null;
  subjectAddressRaw: string | null;
  source: "pdf_summary" | "filename" | "unknown";
}

export interface RentometerTabularParseResult {
  kind: "tabular";
  sourceType: "rentometer_csv" | "rentometer_xlsx";
  headers: string[];
  headerMapping: Record<string, string>;
  candidates: RentometerCandidate[];
  warnings: ExtractionWarning[];
  reportIdFromFilename: string | null;
  rowCount: number;
  candidateCount: number;
}

export interface RentometerPdfParseResult {
  kind: "pdf";
  sourceType: "rentometer_pdf";
  summary: RentometerSummaryMetrics;
  /** Supplementary listing rows extracted from PDF text — not approved comps. */
  supplementalListings: RentometerCandidate[];
  warnings: ExtractionWarning[];
  reportIdFromFilename: string | null;
  textExcerpt: string;
}

export type RentometerParseResult =
  | RentometerTabularParseResult
  | RentometerPdfParseResult;

export const RENTOMETER_PARSER_VERSION = "rentometer-v1";
