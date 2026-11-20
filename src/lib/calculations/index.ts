import {
  DEFAULT_RENT_DELTA_THRESHOLD_USD,
  SQFT_VALID_MAX,
  SQFT_VALID_MIN,
  type ApprovedCompStatRow,
  type AveragedComparable,
  type CompStatsResult,
  type RentDeltaFlag,
  type SameAddressUnitMeasurement,
} from "./types";

export * from "./types";

const FORMULAS = {
  monthlyRent:
    "If rentMin == rentMax (or only one value), use that rent; otherwise use midpoint (rentMin + rentMax) / 2.",
  blendedAverage:
    "Arithmetic mean of monthly rents for eligible same-address-grouped approved comps that have available unit-type data.",
  sameAddress:
    "Group by buildingKey+addressKey+unitTypeKey. Average valid rents and valid sqft within the group so multi-unit same-address rows count as one comparable. Different buildings never merge.",
  psf: "monthlyRent / sqft only when sqft is valid; never fabricate $/sqft from missing sqft.",
  rounding: "Money rounded to nearest dollar (Math.round). PSF rounded to 2 decimal places.",
};

export function roundMoney(value: number): number {
  return Math.round(value);
}

export function roundPsf(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isValidRent(rent: number | null | undefined): boolean {
  return rent != null && Number.isFinite(rent) && rent > 0;
}

export function isValidSqft(sqft: number | null | undefined): boolean {
  return (
    sqft != null &&
    Number.isFinite(sqft) &&
    sqft >= SQFT_VALID_MIN &&
    sqft <= SQFT_VALID_MAX
  );
}

/**
 * Phase 1 rule: flag dual-source rent gaps strictly greater than $25.
 * An exact $25 difference does NOT trigger.
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

export function monthlyComparableRent(
  rentMin: number | null,
  rentMax: number | null,
): number | null {
  const hasMin = isValidRent(rentMin);
  const hasMax = isValidRent(rentMax);
  if (!hasMin && !hasMax) return null;
  if (hasMin && !hasMax) return roundMoney(rentMin!);
  if (!hasMin && hasMax) return roundMoney(rentMax!);
  if (rentMin === rentMax) return roundMoney(rentMin!);
  return roundMoney((rentMin! + rentMax!) / 2);
}

export function rentPerSquareFoot(
  rent: number | null,
  sqft: number | null,
): number | null {
  if (!isValidRent(rent) || !isValidSqft(sqft)) return null;
  return roundPsf(rent! / sqft!);
}

export function excludeInvalidMeasurements<T extends SameAddressUnitMeasurement>(
  rows: T[],
): T[] {
  return rows.filter((row) => {
    const rentOk = row.isValidRent ?? isValidRent(row.rent);
    return rentOk;
  });
}

/**
 * Same-address units average as one comparable for the same building + unit type.
 */
export function averageSameAddressUnits(
  units: SameAddressUnitMeasurement[],
): AveragedComparable[] {
  const groups = new Map<string, SameAddressUnitMeasurement[]>();
  for (const unit of units) {
    const key = [
      unit.buildingKey ?? "building",
      unit.addressKey,
      unit.unitTypeKey ?? "unit",
    ].join("|");
    const list = groups.get(key) ?? [];
    list.push(unit);
    groups.set(key, list);
  }

  const out: AveragedComparable[] = [];
  for (const [key, list] of groups) {
    const [buildingKey, addressKey, unitTypeKey] = key.split("|");
    const validRents = list
      .filter((u) => (u.isValidRent ?? isValidRent(u.rent)) && u.rent != null)
      .map((u) => u.rent!);
    const validSqft = list
      .filter((u) => (u.isValidSqft ?? isValidSqft(u.sqft)) && u.sqft != null)
      .map((u) => u.sqft!);
    const validDom = list
      .map((u) => u.daysOnMarket)
      .filter((d): d is number => d != null && Number.isFinite(d) && d >= 0);

    out.push({
      addressKey: addressKey!,
      buildingKey,
      unitTypeKey,
      rent: validRents.length
        ? roundMoney(validRents.reduce((s, n) => s + n, 0) / validRents.length)
        : null,
      sqft: validSqft.length
        ? roundMoney(validSqft.reduce((s, n) => s + n, 0) / validSqft.length)
        : null,
      daysOnMarket: validDom.length
        ? roundMoney(validDom.reduce((s, n) => s + n, 0) / validDom.length)
        : null,
      unitCount: list.length,
      source: list[0]?.source ?? null,
    });
  }
  return out;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((s, n) => s + n, 0) / values.length;
}

function sourceBucket(source: string | null | undefined): "rentometer" | "hellodata" | "mls" | "other" {
  const s = (source ?? "").toLowerCase();
  if (s.includes("rentometer")) return "rentometer";
  if (s.includes("hellodata") || s.includes("hello data")) return "hellodata";
  if (s.includes("mls")) return "mls";
  return "other";
}

/**
 * Deterministic approved-comp statistics for report draft KPIs.
 * Manual recommendation low/high remain user-owned and are not computed here.
 */
export function computeApprovedCompStats(
  rows: ApprovedCompStatRow[],
): CompStatsResult {
  const eligible = rows.filter(
    (r) => r.hasAvailableData && r.eligibleForStats !== false,
  );

  const measurements: SameAddressUnitMeasurement[] = eligible.map((r) => {
    const rent = monthlyComparableRent(r.rentMin, r.rentMax);
    const sqft =
      r.sqftMin != null && r.sqftMax != null
        ? (r.sqftMin + r.sqftMax) / 2
        : r.sqftMin ?? r.sqftMax;
    return {
      addressKey: r.addressKey ?? r.comparablePropertyId,
      buildingKey: r.buildingKey ?? r.comparablePropertyId,
      unitTypeKey: r.unitTypeKey ?? "unit",
      rent,
      sqft,
      daysOnMarket: r.daysOnMarket,
      isValidRent: isValidRent(rent),
      isValidSqft: isValidSqft(sqft),
      source: r.source ?? null,
    };
  });

  const grouped = averageSameAddressUnits(measurements);
  const rents = grouped.map((g) => g.rent).filter((n): n is number => n != null);
  const psfValues = grouped
    .map((g) => rentPerSquareFoot(g.rent, g.sqft))
    .filter((n): n is number => n != null);
  const domValues = grouped
    .map((g) => g.daysOnMarket)
    .filter((n): n is number => n != null);
  const distances = eligible
    .map((r) => r.distanceMiles)
    .filter((n): n is number => n != null && Number.isFinite(n));

  const bySource = (bucket: "rentometer" | "hellodata" | "mls") =>
    mean(
      grouped
        .filter((g) => sourceBucket(g.source) === bucket && g.rent != null)
        .map((g) => g.rent!),
    );

  return {
    approvedCount: rows.length,
    eligibleGroupedCount: grouped.length,
    blendedAverageRent: rents.length ? roundMoney(mean(rents)!) : null,
    averagePsf: psfValues.length ? roundPsf(mean(psfValues)!) : null,
    rangeLow: rents.length ? Math.min(...rents) : null,
    rangeHigh: rents.length ? Math.max(...rents) : null,
    averageDaysOnMarket: domValues.length ? roundMoney(mean(domValues)!) : null,
    averageDistanceMiles: distances.length
      ? Math.round(mean(distances)! * 100) / 100
      : null,
    rentometerSetAverage: bySource("rentometer") != null
      ? roundMoney(bySource("rentometer")!)
      : null,
    mlsSetAverage: bySource("mls") != null ? roundMoney(bySource("mls")!) : null,
    hellodataSetAverage: bySource("hellodata") != null
      ? roundMoney(bySource("hellodata")!)
      : null,
    formulas: FORMULAS,
  };
}
