import * as XLSX from "xlsx";
import type { ExtractionWarning } from "./types";
import {
  ZILLOW_PARSER_VERSION,
  type ZillowListingMetrics,
  type ZillowParseResult,
  type ZillowPeriodSnapshot,
  type WeeklyWindowType,
} from "./weekly-types";
import { matchWeeklyPropertyName } from "./weekly-property-match";

function cellStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/** Parse workbook integers that may include thousands separators or NaN. */
export function parseZillowNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return raw;
  }
  const s = String(raw).trim();
  if (!s || /^nan$/i.test(s) || s === "-" || s === "—") return null;
  const cleaned = s.replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseZillowAsOfDate(title: string | null, sheetName: string): string | null {
  const fromTitle = title?.match(
    /as of\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i,
  );
  if (fromTitle) {
    const d = new Date(`${fromTitle[1]} ${fromTitle[2]}, ${fromTitle[3]} UTC`);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const fromSheet = sheetName.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (fromSheet) {
    const d = new Date(`${fromSheet[1]} ${fromSheet[2]}, ${fromSheet[3]} UTC`);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

export function weekStartFromAsOf(asOfIso: string): string {
  const d = new Date(`${asOfIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 6);
  return d.toISOString().slice(0, 10);
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const joined = row.map((c) => String(c ?? "").toLowerCase()).join("|");
    if (joined.includes("property") && joined.includes("impressions") && joined.includes("listing views")) {
      return i;
    }
  }
  return -1;
}

function headerIndexMap(header: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((h, i) => {
    const key = String(h ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (key) map.set(key, i);
  });
  return map;
}

function col(map: Map<string, number>, row: unknown[], ...names: string[]): unknown {
  for (const name of names) {
    const idx = map.get(name.toLowerCase());
    if (idx != null) return row[idx];
  }
  return null;
}

function metricsFromRow(map: Map<string, number>, row: unknown[]): ZillowListingMetrics {
  return {
    impressions: parseZillowNumber(col(map, row, "impressions")),
    listingViews: parseZillowNumber(col(map, row, "listing views")),
    listingWebReferrals: parseZillowNumber(col(map, row, "listing web referrals")),
    totalLeads: parseZillowNumber(col(map, row, "total leads")),
    phoneLeads: parseZillowNumber(col(map, row, "phone leads")),
    emailLeads: parseZillowNumber(col(map, row, "email leads")),
    adImpressions: parseZillowNumber(col(map, row, "ad impressions")),
    adClicks: parseZillowNumber(col(map, row, "ad clicks")),
    daysOnMarket: parseZillowNumber(col(map, row, "days on market")),
    spotlightDays: parseZillowNumber(col(map, row, "spotlight days")),
    advertisingType: cellStr(col(map, row, "advertising type")),
    publishedStatus: cellStr(col(map, row, "published status")),
  };
}

export function parseZillowXlsxBuffer(opts: {
  filename: string;
  bytes: Uint8Array;
  property: {
    name: string;
    marketingName?: string | null;
    addressLine1: string;
    city: string;
    state: string;
    aliases?: string[];
  };
}): ZillowParseResult {
  const wb = XLSX.read(opts.bytes, { type: "buffer", cellDates: true, raw: false });
  const warnings: ExtractionWarning[] = [];
  const snapshots: ZillowPeriodSnapshot[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: false,
    }) as unknown[][];
    if (!rows.length) continue;

    const headerIdx = findHeaderRow(rows);
    if (headerIdx < 0) {
      warnings.push({
        code: "zillow_sheet_skipped",
        message: `Sheet "${sheetName}" missing Property/Impressions header — skipped`,
      });
      continue;
    }

    const title = cellStr(rows[0]?.[0]);
    let resolvedWindow: WeeklyWindowType = "listing_to_date";
    if (/last\s*7\s*days/i.test(title ?? "")) resolvedWindow = "last_7_days";
    else if (sheetName === "Sheet1") resolvedWindow = "listing_to_date";
    else if (/^[A-Za-z]+\s+\d{1,2},\s+\d{4}$/.test(sheetName)) resolvedWindow = "last_7_days";

    const asOfDate =
      resolvedWindow === "last_7_days" ? parseZillowAsOfDate(title, sheetName) : null;
    const weekEnd = asOfDate;
    const weekStart = asOfDate ? weekStartFromAsOf(asOfDate) : null;

    const map = headerIndexMap(rows[headerIdx] ?? []);
    const candidates: ZillowPeriodSnapshot[] = [];

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const propertyNameRaw = cellStr(col(map, row, "property"));
      if (!propertyNameRaw) continue;
      const match = matchWeeklyPropertyName(propertyNameRaw, {
        ...opts.property,
        aliases: [
          ...(opts.property.aliases ?? []),
          ...(opts.property.marketingName ? [opts.property.marketingName] : []),
        ],
      });
      candidates.push({
        sheetName,
        windowType: resolvedWindow,
        asOfDate,
        weekStart,
        weekEnd,
        title,
        propertyNameRaw,
        city: cellStr(col(map, row, "city")),
        state: cellStr(col(map, row, "state")),
        metrics: metricsFromRow(map, row),
        matchConfidence: match.confidence,
        matchReason: match.reason,
      });
    }

    const exact = candidates.filter((c) => c.matchConfidence === "exact" || c.matchConfidence === "strong");
    if (exact.length === 1) {
      snapshots.push(exact[0]!);
    } else if (exact.length > 1) {
      warnings.push({
        code: "zillow_ambiguous_property",
        message: `Sheet "${sheetName}" matched multiple rows for property — manual confirmation required`,
      });
      for (const c of exact) {
        snapshots.push({ ...c, matchConfidence: "ambiguous", matchReason: "multiple_strong_matches" });
      }
    } else if (candidates.length) {
      warnings.push({
        code: "zillow_property_unmatched",
        message: `Sheet "${sheetName}" has ${candidates.length} listing row(s) but none matched the target property`,
      });
    }
  }

  const listingToDate =
    snapshots.find((s) => s.windowType === "listing_to_date" && s.matchConfidence !== "ambiguous") ??
    null;

  if (!snapshots.some((s) => s.windowType === "last_7_days")) {
    warnings.push({
      code: "zillow_no_weekly_sheet",
      message: "No last-7-days weekly sheet matched the target property",
    });
  }

  return {
    dialect: "zillow_rental_manager",
    parserVersion: ZILLOW_PARSER_VERSION,
    sheetNames: wb.SheetNames,
    snapshots,
    listingToDate,
    warnings,
  };
}
