/**
 * Interfaces for deterministic Phase 1 pricing math.
 * Keep AI out of this module.
 */

export interface SameAddressUnitMeasurement {
  addressKey: string;
  /** Optional building identity — different buildings must not collapse together. */
  buildingKey?: string | null;
  unitTypeKey?: string | null;
  rent: number | null;
  sqft: number | null;
  daysOnMarket: number | null;
  isValidRent?: boolean;
  isValidSqft?: boolean;
  source?: string | null;
}

export interface AveragedComparable {
  addressKey: string;
  buildingKey?: string | null;
  unitTypeKey?: string | null;
  rent: number | null;
  sqft: number | null;
  daysOnMarket: number | null;
  unitCount: number;
  source?: string | null;
}

export interface ApprovedCompStatRow {
  comparablePropertyId: string;
  addressKey?: string | null;
  buildingKey?: string | null;
  unitTypeKey?: string | null;
  source?: string | null;
  rentMin: number | null;
  rentMax: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  psf: number | null;
  daysOnMarket: number | null;
  distanceMiles: number | null;
  matchTier: "strongest" | "moderate" | "context" | null;
  hasAvailableData: boolean;
  /** When false, excluded from final stats (unresolved conflict / rejected). */
  eligibleForStats?: boolean;
}

export interface CompStatsResult {
  approvedCount: number;
  eligibleGroupedCount: number;
  blendedAverageRent: number | null;
  averagePsf: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  averageDaysOnMarket: number | null;
  averageDistanceMiles: number | null;
  rentometerSetAverage: number | null;
  mlsSetAverage: number | null;
  hellodataSetAverage: number | null;
  formulas: {
    monthlyRent: string;
    blendedAverage: string;
    sameAddress: string;
    psf: string;
    rounding: string;
  };
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

/** Suspicious sqft bounds used when validity flags are omitted. */
export const SQFT_VALID_MIN = 200;
export const SQFT_VALID_MAX = 5000;
