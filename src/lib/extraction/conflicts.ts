import {
  DEFAULT_RENT_DELTA_THRESHOLD_USD,
  flagRentDelta,
} from "@/lib/calculations";

export interface SourceRentObservation {
  source: string;
  rent: number;
  isRange?: boolean;
  rentMin?: number | null;
  rentMax?: number | null;
  asOfDate?: string | null;
  extractedValueId?: string | null;
  comparablePropertyId?: string | null;
  unitTypeLabel?: string | null;
}

export interface RentConflict {
  fieldKey: "rent";
  left: SourceRentObservation;
  right: SourceRentObservation;
  absoluteDelta: number;
  exceedsThreshold: boolean;
  threshold: number;
  comparable: boolean;
  reason: string;
}

/**
 * Compare equivalent single-rent observations only.
 * Ranges are preserved and marked non-comparable unless both sides are single values.
 * Threshold is strict greater-than ($25 exactly does NOT flag).
 */
export function detectRentConflict(
  left: SourceRentObservation,
  right: SourceRentObservation,
  threshold = DEFAULT_RENT_DELTA_THRESHOLD_USD,
): RentConflict | null {
  if (left.isRange || right.isRange) {
    return {
      fieldKey: "rent",
      left,
      right,
      absoluteDelta: Math.abs(left.rent - right.rent),
      exceedsThreshold: false,
      threshold,
      comparable: false,
      reason: "One or both values are rent ranges; unsupported for automatic $25 comparison",
    };
  }

  const flag = flagRentDelta(left.source, left.rent, right.source, right.rent, threshold);
  if (!flag.exceedsThreshold) {
    return null;
  }

  return {
    fieldKey: "rent",
    left,
    right,
    absoluteDelta: flag.absoluteDelta,
    exceedsThreshold: true,
    threshold,
    comparable: true,
    reason: `Absolute rent difference $${flag.absoluteDelta} exceeds $${threshold}`,
  };
}

export function detectNumericConflict(opts: {
  fieldKey: string;
  leftSource: string;
  rightSource: string;
  leftValue: number;
  rightValue: number;
  threshold: number;
}): {
  fieldKey: string;
  absoluteDelta: number;
  exceedsThreshold: boolean;
} | null {
  const absoluteDelta = Math.abs(opts.leftValue - opts.rightValue);
  if (!(absoluteDelta > opts.threshold)) return null;
  return {
    fieldKey: opts.fieldKey,
    absoluteDelta,
    exceedsThreshold: true,
  };
}
