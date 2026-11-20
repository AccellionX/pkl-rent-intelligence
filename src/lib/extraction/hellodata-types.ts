import type { ExtractionWarning, NormalizedAddressParts } from "./types";

export const HELLODATA_PARSER_VERSION = "hellodata-v1";

export interface HelloDataUnitTypeObservation {
  unitTypeLabel: string;
  beds: number | null;
  rent: number | null;
  sqft: number | null;
  psf: number | null;
  available: boolean;
  rawLine: string;
  flags: ExtractionWarning[];
}

export interface HelloDataCompBuilding {
  name: string;
  address: NormalizedAddressParts | null;
  cityStateZipRaw: string | null;
  distanceMiles: number | null;
  similarityPercent: number | null;
  yearBuilt: number | null;
  totalUnits: number | null;
  stories: number | null;
  managementCompany: string | null;
  /** Property website / listing URL when present in the source card text. */
  websiteUrl: string | null;
  isSubject: boolean;
  unitTypes: HelloDataUnitTypeObservation[];
  pageRef: string | null;
  rawBlock: string;
}

export interface HelloDataMarketUnitTypeMetric {
  unitTypeLabel: string;
  beds: number | null;
  listings: number | null;
  daysOnMarket: number | null;
  avgSqft: number | null;
  askingRent: number | null;
  askingPsf: number | null;
  effectiveRent: number | null;
  effectivePsf: number | null;
  scope: "market_trailing_1_month";
  rawBlock: string;
}

export interface HelloDataParseResult {
  kind: "hellodata_pdf";
  sourceType: "hellodata_pdf";
  reportDate: string | null;
  dateRange: string | null;
  subjectName: string | null;
  subjectAddress: NormalizedAddressParts | null;
  /** Listing-like URLs found in PDF text / annotations (vendor chrome excluded). */
  documentListingLinks: {
    all: string[];
    zillow: string | null;
    apartments: string | null;
    websites: string[];
  };
  buildings: HelloDataCompBuilding[];
  /** Comp buildings only (subject excluded). */
  comparableBuildings: HelloDataCompBuilding[];
  marketMetrics: HelloDataMarketUnitTypeMetric[];
  warnings: ExtractionWarning[];
  textExcerpt: string;
}
