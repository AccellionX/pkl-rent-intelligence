import {
  DEFAULT_RENT_DELTA_THRESHOLD_USD,
  type ApprovedCompStatRow,
  type AveragedComparable,
  type CompStatsResult,
  type RentDeltaFlag,
  type SameAddressUnitMeasurement,
} from "./types";

export * from "./types";

/**
 * Phase 1 rule: flag Rentometer vs HelloData (or other dual-source) rent gaps over $25.
 * This is a threshold check, not a pricing formula.
 */
export function flagRentDelta(
  leftLabel: string,
  leftRent: number,
  rightLabel: string,
  rightRent: number,
  threshold: number = DEFAULT_RENT_DELTA_THRESHOLD_USD,
): RentDeltaFlag {
  const absoluteDelta = Math.abs(leftRent - rightRent);
  return {
    leftLabel,
    rightLabel,
    leftRent,
    rightRent,
    absoluteDelta,
    exceedsThreshold: absoluteDelta > threshold,
    threshold,
  };
}

/**
 * Same-address units average as one comparable.
 * Full implementation deferred — interface reserved for Task #3+.
 */
export function averageSameAddressUnits(
  units: SameAddressUnitMeasurement[],
): AveragedComparable[] {
  void units;
  throw new Error(
    "averageSameAddressUnits is not implemented yet (Phase 1 calculation engine pending)",
  );
}

/**
 * Exclude invalid measurements from relevant aggregates.
 * Full implementation deferred.
 */
export function excludeInvalidMeasurements<T extends SameAddressUnitMeasurement>(
  rows: T[],
): T[] {
  void rows;
  throw new Error(
    "excludeInvalidMeasurements is not implemented yet (Phase 1 calculation engine pending)",
  );
}

/**
 * Deterministic approved-comp statistics for report KPIs.
 * Must never be delegated to an LLM.
 */
export function computeApprovedCompStats(
  rows: ApprovedCompStatRow[],
): CompStatsResult {
  void rows;
  throw new Error(
    "computeApprovedCompStats is not implemented yet (Phase 1 calculation engine pending)",
  );
}
