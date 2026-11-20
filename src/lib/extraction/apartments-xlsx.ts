import * as XLSX from "xlsx";
import type { ExtractionWarning } from "./types";
import {
  APARTMENTS_PARSER_VERSION,
  type ApartmentsParseResult,
  type ApartmentsSanitizedLeadEvent,
} from "./weekly-types";

const PII_COLUMNS = [
  "Caller Phone Number",
  "Ring-To Number",
  "Tracking Number",
  "Call Recording",
  "Renter Name",
  "Renter Phone Number",
  "Renter Email",
] as const;

function cellStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export function parseApartmentsCount(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || /^n\/?a$/i.test(s) || s === "-" || s === "—") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseApartmentsDateRange(raw: string | null): {
  weekStart: string | null;
  weekEnd: string | null;
  raw: string | null;
} {
  if (!raw) return { weekStart: null, weekEnd: null, raw: null };
  const m = raw.match(
    /Date Range:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
  );
  if (!m) return { weekStart: null, weekEnd: null, raw: raw.trim() };
  const pad = (n: string) => n.padStart(2, "0");
  const weekStart = `${m[3]}-${pad(m[1]!)}-${pad(m[2]!)}`;
  const weekEnd = `${m[6]}-${pad(m[4]!)}-${pad(m[5]!)}`;
  return { weekStart, weekEnd, raw: raw.trim() };
}

function stripPiiFromComment(text: string | null): string | null {
  if (!text) return null;
  let out = text;
  // Emails
  out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");
  // Phone-like sequences
  out = out.replace(
    /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g,
    "[redacted-phone]",
  );
  out = out.trim();
  return out.length ? out : null;
}

function findDateRangeInSheet(rows: unknown[][]): string | null {
  for (const row of rows) {
    for (const cell of row ?? []) {
      const s = cellStr(cell);
      if (s && /Date Range:/i.test(s)) return s;
    }
  }
  return null;
}

function summaryMetric(rows: unknown[][], label: string): number | null {
  for (const row of rows) {
    const key = cellStr(row?.[0]);
    if (!key) continue;
    if (new RegExp(`^${label}\\s*$`, "i").test(key) || new RegExp(`^${label}\\s+$`, "i").test(key)) {
      return parseApartmentsCount(row?.[1]);
    }
    if (key.toLowerCase().startsWith(label.toLowerCase())) {
      return parseApartmentsCount(row?.[1]);
    }
  }
  return null;
}

function headerMap(row: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  row.forEach((h, i) => {
    const key = String(h ?? "").trim().toLowerCase();
    if (key) map.set(key, i);
  });
  return map;
}

function pick(map: Map<string, number>, row: unknown[], name: string): unknown {
  const idx = map.get(name.toLowerCase());
  return idx == null ? null : row[idx];
}

function parseDetailSheet(
  sheet: XLSX.WorkSheet,
  category: ApartmentsSanitizedLeadEvent["category"],
): ApartmentsSanitizedLeadEvent[] {
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false,
  }) as unknown[][];
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const joined = (rows[i] ?? []).map((c) => String(c ?? "").toLowerCase()).join("|");
    if (joined.includes("property name") && joined.includes("date/time")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];
  const map = headerMap(rows[headerIdx] ?? []);
  const events: ApartmentsSanitizedLeadEvent[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const property = cellStr(pick(map, row, "property name"));
    if (!property) continue;
    events.push({
      category,
      datetime: cellStr(pick(map, row, "date/time")),
      duration: cellStr(pick(map, row, "call duration")),
      status: cellStr(pick(map, row, "status")),
      moveDate: cellStr(pick(map, row, "move date")),
      desiredBedsBaths:
        cellStr(pick(map, row, "desired beds/baths")) ??
        cellStr(pick(map, row, "desired beds/bath")),
      commentSummary: stripPiiFromComment(cellStr(pick(map, row, "comments"))),
      timeOnListingPage: cellStr(pick(map, row, "time on listing page")),
    });
  }
  return events;
}

function propertyNameFromIncludedTable(rows: unknown[][]): string | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const joined = row.map((c) => String(c ?? "").toLowerCase()).join("|");
    if (joined.includes("property name") && joined.includes("phone calls")) {
      const next = rows[i + 1];
      if (!next) return null;
      // Header may be offset: Property Name is not always col 0
      const map = headerMap(row);
      const idx = map.get("property name");
      if (idx == null) return cellStr(next[3] ?? next[0]);
      return cellStr(next[idx]);
    }
  }
  return null;
}

export function parseApartmentsXlsxBuffer(opts: {
  filename: string;
  bytes: Uint8Array;
}): ApartmentsParseResult {
  const wb = XLSX.read(opts.bytes, { type: "buffer", cellDates: true, raw: false });
  const warnings: ExtractionWarning[] = [];
  const summarySheet = wb.Sheets["Lead Summary"];
  if (!summarySheet) {
    throw new Error('Apartments.com workbook missing "Lead Summary" sheet');
  }
  const summaryRows = XLSX.utils.sheet_to_json(summarySheet, {
    header: 1,
    defval: null,
    raw: false,
  }) as unknown[][];

  const dateRaw =
    findDateRangeInSheet(summaryRows) ??
    wb.SheetNames.map((n) => {
      const sh = wb.Sheets[n];
      if (!sh) return null;
      const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null, raw: false }) as unknown[][];
      return findDateRangeInSheet(rows);
    }).find(Boolean) ??
    null;
  const range = parseApartmentsDateRange(dateRaw);

  const totalLeads = summaryMetric(summaryRows, "TOTAL LEADS");
  const phoneCalls = summaryMetric(summaryRows, "Phone Calls");
  const emails = summaryMetric(summaryRows, "Emails");
  const tours = summaryMetric(summaryRows, "Tours");
  const applications = summaryMetric(summaryRows, "Apply Now");
  const totalPropertiesInReport = summaryMetric(summaryRows, "TOTAL PROPERTIES");
  const propertyNameFromReport = propertyNameFromIncludedTable(summaryRows);

  if (!propertyNameFromReport) {
    warnings.push({
      code: "apartments_property_name_missing",
      message:
        "Lead Summary did not include a property name row — rely on upload property selection and confirm manually",
    });
  }
  if (tours == null) {
    warnings.push({
      code: "apartments_tours_missing",
      message: "Tours reported as N/A or missing — stored as null, not zero",
    });
  }
  if (applications == null) {
    warnings.push({
      code: "apartments_applications_missing",
      message: "Apply Now reported as N/A or missing — stored as null, not zero",
    });
  }

  const events: ApartmentsSanitizedLeadEvent[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    if (/^Phone Calls/i.test(name)) events.push(...parseDetailSheet(sheet, "phone"));
    else if (/^Emails/i.test(name)) events.push(...parseDetailSheet(sheet, "email"));
    else if (/^Tours/i.test(name)) events.push(...parseDetailSheet(sheet, "tour"));
    else if (/^Apply Now/i.test(name)) events.push(...parseDetailSheet(sheet, "application"));
  }

  if (!range.weekStart || !range.weekEnd) {
    warnings.push({
      code: "apartments_period_unparsed",
      message: "Could not parse Date Range from workbook",
    });
  }

  return {
    dialect: "apartments_com_leads",
    parserVersion: APARTMENTS_PARSER_VERSION,
    sheetNames: wb.SheetNames,
    weekStart: range.weekStart,
    weekEnd: range.weekEnd,
    dateRangeRaw: range.raw,
    totalLeads,
    phoneCalls,
    emails,
    tours,
    applications,
    propertyNameFromReport,
    totalPropertiesInReport,
    events,
    warnings,
    piiColumnsOmitted: [...PII_COLUMNS],
  };
}
