/**
 * Interfaces for deterministic Phase 1 pricing math.
 * Implementations of full formulas land in a later task — keep AI out of this module.
 */

export interface SameAddressUnitMeasurement {
  addressKey: string;
  rent: number | null;
  sqft: number | null;
  daysOnMarket: number | null;
  isValidRent?: boolean;
  isValidSqft?: boolean;
}

export interface AveragedComparable {
  addressKey: string;
  rent: number | null;
  sqft: number | null;
  daysOnMarket: number | null;
  unitCount: number;
}

export interface ApprovedCompStatRow {
  comparablePropertyId: string;
  rentMin: number | null;
  rentMax: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  psf: number | null;
  daysOnMarket: number | null;
  distanceMiles: number | null;
  matchTier: "strongest" | "moderate" | "context" | null;
  hasAvailableData: boolean;
}

export interface CompStatsResult {
  approvedCount: number;
  blendedAverageRent: number | null;
  averagePsf: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  averageDaysOnMarket: number | null;
  averageDistanceMiles: number | null;
}

export interface RentDeltaFlag {
  leftLabel: string;
  rightLabel: string;
  leftRent: number;
  rightRent: number;
  absoluteDelta: number;
  exceedsThreshold: boolean;
  threshold: number;
}

export const DEFAULT_RENT_DELTA_THRESHOLD_USD = 25;
