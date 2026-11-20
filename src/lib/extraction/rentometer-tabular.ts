import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  addressesLikelyMatch,
  extractRentometerReportIdFromFilename,
  isSuspiciousSqft,
  normalizeAddress,
  normalizeHeader,
  parseBaths,
  parseBooleanFlag,
  parseCurrency,
  parseNumber,
} from "./normalize";
import { normalizeListingUrl } from "./listing-links";
import type {
  ExtractionWarning,
  RentometerCandidate,
  RentometerTabularParseResult,
} from "./types";

/** Canonical field ← acceptable normalized header aliases */
const FIELD_ALIASES: Record<string, string[]> = {
  address: [
    "address",
    "street_address",
    "street",
    "full_address",
    "property_address",
    "listing_address",
  ],
  name: [
    "name",
    "property_name",
    "property",
    "community",
    "building",
    "building_name",
    "complex",
  ],
  listingUrl: [
    "url",
    "listing_url",
    "listing_link",
    "link",
    "website",
    "property_url",
    "zillow_url",
    "apartments_url",
  ],
  distanceMiles: ["distance_mi", "distance", "miles", "distance_miles"],
  rent: ["price", "rent", "asking_rent", "asking", "monthly_rent", "list_price"],
  sqft: ["size_sqft", "size", "sqft", "square_feet", "sq_ft", "square_footage"],
  psf: ["sqft", "psf", "price_per_sqft", "rent_per_sqft"], // $/sqft normalizes oddly
  beds: ["bedrooms", "beds", "bed", "br"],
  baths: ["baths", "bathrooms", "bath", "ba"],
  propertyType: [
    "property_type",
    "building_type",
    "bldg_type",
    "type",
  ],
  listDate: ["list_date", "last_seen", "listed", "date", "last_seen_date"],
  outlier: ["outlier", "is_outlier"],
};

function buildHeaderMapping(headers: string[]): {
  mapping: Record<string, string>;
  warnings: ExtractionWarning[];
} {
  const normalizedToOriginal = new Map<string, string>();
  headers.forEach((h) => {
    normalizedToOriginal.set(normalizeHeader(h), h);
  });

  // Special-case Rentometer "$/sqft" → often becomes "" or "sqft" after normalize.
  headers.forEach((h) => {
    const raw = h.trim().toLowerCase();
    if (raw.includes("$") && raw.includes("sqft")) {
      normalizedToOriginal.set("dollar_sqft", h);
      normalizedToOriginal.set("psf_header", h);
    }
  });

  const mapping: Record<string, string> = {};
  const warnings: ExtractionWarning[] = [];

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (field === "psf") {
      const psfHeader =
        normalizedToOriginal.get("psf_header") ||
        normalizedToOriginal.get("dollar_sqft") ||
        headers.find((h) => /\$\s*\/\s*sqft|\$\/sqft|per\s*sqft/i.test(h));
      if (psfHeader) mapping.psf = psfHeader;
      continue;
    }
    for (const alias of aliases) {
      const original = normalizedToOriginal.get(alias);
      if (original) {
        mapping[field] = original;
        break;
      }
    }
  }

  if (!mapping.address || !mapping.rent) {
    warnings.push({
      code: "unsupported_layout",
      message:
        "Unsupported Rentometer tabular layout: required address and rent/price columns were not found",
    });
  }

  return { mapping, warnings };
}

function cell(
  row: Record<string, string>,
  mapping: Record<string, string>,
  field: string,
): string {
  const key = mapping[field];
  if (!key) return "";
  return String(row[key] ?? "").trim();
}

function toCandidate(
  row: Record<string, string>,
  rowIndex: number,
  mapping: Record<string, string>,
  subjectAddress?: string | null,
): RentometerCandidate {
  const flags: ExtractionWarning[] = [];
  const addressRaw = cell(row, mapping, "address");
  const rentRaw = cell(row, mapping, "rent");
  const sqftRaw = cell(row, mapping, "sqft");
  const psfRaw = cell(row, mapping, "psf");
  const bedsRaw = cell(row, mapping, "beds");
  const bathsRaw = cell(row, mapping, "baths");
  const distanceRaw = cell(row, mapping, "distanceMiles");
  const propertyType = cell(row, mapping, "propertyType") || null;
  const listDate = cell(row, mapping, "listDate") || null;
  const outlier = parseBooleanFlag(cell(row, mapping, "outlier"));
  const nameRaw = cell(row, mapping, "name") || null;
  const listingUrl = normalizeListingUrl(cell(row, mapping, "listingUrl"));

  const isBlankRow = Object.values(row).every((v) => !String(v ?? "").trim());
  const address = normalizeAddress(addressRaw);
  const rent = parseCurrency(rentRaw);
  const sqft = parseNumber(sqftRaw);
  const psf = parseNumber(psfRaw);
  const beds = parseNumber(bedsRaw);
  const baths = parseBaths(bathsRaw);
  const distanceMiles = parseNumber(distanceRaw);

  if (isBlankRow || (!addressRaw && !rentRaw && !sqftRaw)) {
    flags.push({
      code: "blank_row",
      message: "Blank or empty source row",
      rowRef: String(rowIndex + 1),
    });
  } else if (!addressRaw) {
    flags.push({
      code: "blank_address",
      message: "Missing address",
      rowRef: String(rowIndex + 1),
      field: "address",
    });
  }

  if (!isBlankRow && addressRaw && rent == null) {
    flags.push({
      code: "invalid_rent",
      message: `Invalid or missing rent value: "${rentRaw}"`,
      rowRef: String(rowIndex + 1),
      field: "rent",
    });
  }

  if (!isBlankRow && addressRaw && !sqftRaw) {
    flags.push({
      code: "missing_sqft",
      message: "Missing square footage",
      rowRef: String(rowIndex + 1),
      field: "sqft",
    });
  } else if (isSuspiciousSqft(sqft)) {
    flags.push({
      code: "suspicious_sqft",
      message: `Suspicious square footage (${sqft}) — flagged, not guessed`,
      rowRef: String(rowIndex + 1),
      field: "sqft",
    });
  }

  const isSubjectLikely = Boolean(
    addressRaw && subjectAddress && addressesLikelyMatch(addressRaw, subjectAddress),
  );
  if (isSubjectLikely) {
    flags.push({
      code: "subject_property_row",
      message: "Row appears to be the subject property; kept for audit, not auto-approved",
      rowRef: String(rowIndex + 1),
    });
  }

  const includeAsCompCandidate =
    !isBlankRow &&
    Boolean(addressRaw) &&
    rent != null &&
    !isSubjectLikely;

  return {
    rowIndex,
    rowRef: String(rowIndex + 1),
    raw: row,
    name: nameRaw,
    address,
    rent,
    sqft,
    psf,
    beds,
    baths,
    distanceMiles,
    propertyType,
    listDate,
    outlier,
    listingUrl,
    isSubjectLikely,
    isBlankRow,
    flags,
    includeAsCompCandidate,
  };
}

function rowsFromCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: false,
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length && !parsed.data.length) {
    throw new Error(`CSV parse failed: ${parsed.errors[0]?.message ?? "unknown error"}`);
  }
  const headers = parsed.meta.fields?.map((h) => h.trim()) ?? [];
  const rows = (parsed.data ?? []).map((row) => {
    const out: Record<string, string> = {};
    Object.entries(row).forEach(([k, v]) => {
      out[k.trim()] = v == null ? "" : String(v);
    });
    return out;
  });
  return { headers, rows };
}

function rowsFromExcel(buffer: ArrayBuffer): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Excel workbook has no worksheets");
  }
  const sheet = workbook.Sheets[sheetName]!;
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  if (!json.length) {
    return { headers: [], rows: [] };
  }
  const headers = Object.keys(json[0]!).map((h) => h.trim());
  // Capture embedded Excel hyperlink targets keyed by display address text.
  const hyperlinkByDisplay = new Map<string, string>();
  for (const addr of Object.keys(sheet)) {
    if (addr.startsWith("!")) continue;
    const cell = sheet[addr] as { l?: { Target?: string }; w?: string; v?: unknown };
    const target = cell?.l?.Target;
    if (!target) continue;
    const display = String(cell.w ?? cell.v ?? "").trim();
    if (display) hyperlinkByDisplay.set(display.toLowerCase(), target);
  }
  const linkHeader =
    headers.find((h) => /url|link|website/i.test(h)) ?? "__listing_url";
  if (!headers.includes(linkHeader) && hyperlinkByDisplay.size > 0) {
    headers.push(linkHeader);
  }
  const rows = json.map((row) => {
    const out: Record<string, string> = {};
    headers.forEach((h) => {
      out[h] = row[h] == null ? "" : String(row[h]);
    });
    if (!out[linkHeader]) {
      for (const val of Object.values(out)) {
        const hit = hyperlinkByDisplay.get(String(val).trim().toLowerCase());
        if (hit) {
          out[linkHeader] = hit;
          break;
        }
      }
    }
    return out;
  });
  return { headers, rows };
}

export function parseRentometerTabular(opts: {
  filename: string;
  sourceType: "rentometer_csv" | "rentometer_xlsx";
  text?: string;
  buffer?: ArrayBuffer;
  subjectAddress?: string | null;
}): RentometerTabularParseResult {
  const { headers, rows } =
    opts.sourceType === "rentometer_csv"
      ? rowsFromCsv(opts.text ?? "")
      : rowsFromExcel(opts.buffer ?? new ArrayBuffer(0));

  const { mapping, warnings } = buildHeaderMapping(headers);
  if (!mapping.address || !mapping.rent) {
    return {
      kind: "tabular",
      sourceType: opts.sourceType,
      headers,
      headerMapping: mapping,
      candidates: [],
      warnings,
      reportIdFromFilename: extractRentometerReportIdFromFilename(opts.filename),
      rowCount: rows.length,
      candidateCount: 0,
    };
  }

  const candidates = rows.map((row, idx) =>
    toCandidate(row, idx, mapping, opts.subjectAddress),
  );
  const allWarnings = [
    ...warnings,
    ...candidates.flatMap((c) => c.flags),
  ];

  return {
    kind: "tabular",
    sourceType: opts.sourceType,
    headers,
    headerMapping: mapping,
    candidates,
    warnings: allWarnings,
    reportIdFromFilename: extractRentometerReportIdFromFilename(opts.filename),
    rowCount: rows.length,
    candidateCount: candidates.filter((c) => c.includeAsCompCandidate).length,
  };
}

export async function parseRentometerCsvFile(
  file: { name: string; text: () => Promise<string> },
  subjectAddress?: string | null,
) {
  return parseRentometerTabular({
    filename: file.name,
    sourceType: "rentometer_csv",
    text: await file.text(),
    subjectAddress,
  });
}

export async function parseRentometerExcelFile(
  file: { name: string; arrayBuffer: () => Promise<ArrayBuffer> },
  subjectAddress?: string | null,
) {
  return parseRentometerTabular({
    filename: file.name,
    sourceType: "rentometer_xlsx",
    buffer: await file.arrayBuffer(),
    subjectAddress,
  });
}
