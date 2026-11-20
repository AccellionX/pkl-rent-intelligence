import { extractText, getDocumentProxy } from "unpdf";
import { normalizeAddress, parseCurrency, parseNumber } from "./normalize";
import {
  isValidMlsRent,
  isValidMlsSqft,
  MLS_CT_PARSER_VERSION,
  type MlsListing,
  type MlsParseResult,
} from "./mls-types";
import type { ExtractionWarning } from "./types";

function parseBathsFraction(raw: string | null): {
  baths: number | null;
  bathsRaw: string | null;
} {
  if (!raw) return { baths: null, bathsRaw: null };
  const cleaned = raw.replace(/\s+/g, "");
  // Forms: 1/0, 1(1/0), 1.5
  const paren = cleaned.match(/^(\d+)\((\d+)\/(\d+)\)$/);
  if (paren) {
    const full = Number(paren[2]);
    const half = Number(paren[3]);
    return {
      baths: full + (half > 0 ? 0.5 : 0),
      bathsRaw: `${paren[2]}/${paren[3]}`,
    };
  }
  const frac = cleaned.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const full = Number(frac[1]);
    const half = Number(frac[2]);
    return {
      baths: full + (half > 0 ? 0.5 : 0),
      bathsRaw: `${frac[1]}/${frac[2]}`,
    };
  }
  return { baths: parseNumber(cleaned), bathsRaw: cleaned };
}

function splitCtAddress(raw: string): {
  line1: string;
  unit: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
} {
  const flat = raw.replace(/\s+/g, " ").trim();
  // "10 S. 3rd Avenue , Unit# 12, Norwich, CT 06380"
  const unitMatch = flat.match(/^(.*?)\s*,\s*Unit#?\s*([A-Za-z0-9-]+)\s*,\s*(.*)$/i);
  let line1 = flat;
  let unit: string | null = null;
  let rest = "";
  if (unitMatch) {
    line1 = unitMatch[1]!.trim();
    unit = unitMatch[2]!;
    rest = unitMatch[3]!;
  } else {
    const parts = flat.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      line1 = parts[0]!;
      rest = parts.slice(1).join(", ");
    }
  }

  // Trailing unit without "Unit#" — "10 S 3rd AVE 12"
  if (!unit) {
    const trailing = line1.match(/^(.*\b(?:AVE|AVENUE|DR|DRIVE|ST|STREET|RD|ROAD))\s+(\d+[A-Za-z]?)$/i);
    if (trailing) {
      line1 = trailing[1]!;
      unit = trailing[2]!;
    }
  }

  const addr = normalizeAddress(rest ? `${line1}, ${rest}` : line1);
  return {
    line1: addr?.line1 ?? line1,
    unit,
    city: addr?.city ?? null,
    state: addr?.state ?? "CT",
    postalCode: addr?.postalCode ?? null,
  };
}

/** Detail pages are authoritative for CT connectMLS listings. */
export function parseCtDetailListing(
  pageText: string,
  page: number,
): MlsListing | null {
  if (!/Listing ID:\s*\d+/i.test(pageText)) return null;
  if (!/Per Month/i.test(pageText) && !/Residential Rental/i.test(pageText)) {
    // Still allow if Listing ID + Active present
    if (!/Listing ID:/i.test(pageText)) return null;
  }

  const header = pageText.match(
    /^([^\n]+?)\s+\$([0-9,]+)\s*\n\s*Per Month/im,
  );
  const mlsNumber = pageText.match(/Listing ID:\s*(\d+)/i)?.[1] ?? null;
  if (!mlsNumber) return null;

  const listRent = parseCurrency(header?.[2] ?? null);
  const addressRaw = header?.[1]?.trim() ?? null;
  const parts = addressRaw ? splitCtAddress(addressRaw) : null;

  const beds = parseNumber(
    pageText.match(/\bActive\s+(\d+)\s*\nBeds\b/i)?.[1] ??
      pageText.match(/(\d+)\s*\nBeds\b/i)?.[1] ??
      null,
  );
  const bathsBlock =
    pageText.match(/Beds\s*\n([0-9/()]+)\s*\nBaths\b/i)?.[1] ??
    pageText.match(/\n([0-9/()]+)\s*\nBaths\b/i)?.[1] ??
    null;
  const { baths, bathsRaw } = parseBathsFraction(bathsBlock);
  const sqft = parseNumber(
    pageText.match(/Baths\s*\n([0-9,]+)\s*\nSqFt\b/i)?.[1] ??
      pageText.match(/Above Grade SqFt:\s*([0-9,]+)/i)?.[1] ??
      pageText.match(/Total SqFt:\s*([0-9,]+)/i)?.[1] ??
      pageText.match(/\n([0-9,]+)\s*\nSqFt\b/i)?.[1] ??
      null,
  );
  const status = pageText.match(/\b(Active|Pending|Closed|Withdrawn)\b/i)?.[1] ?? null;
  const yearBuilt = parseNumber(
    pageText.match(/Year Built\s*\/\s*Source:\s*(\d{4})/i)?.[1] ?? null,
  );
  const propertyType =
    pageText.match(/\n(Multi-Family Rental|Residential Rental|Apartment)\b/i)?.[1] ??
    null;
  const daysOnMarket = parseNumber(
    pageText.match(/DOM\s*\/\s*CDOM:\s*(\d+)\s*\/\s*\d+/i)?.[1] ?? null,
  );
  const listDate =
    pageText.match(/Entered in MLS:\s*([0-9/]+)/i)?.[1] ??
    pageText.match(/Start Marketing Date:\s*([0-9/]+)/i)?.[1] ??
    null;
  const availability =
    pageText.match(/Date Available:\s*([^\n]+)/i)?.[1]?.trim() ?? null;
  const utilitiesTenant =
    pageText.match(/Tenant\s*\n?Responsibility:\s*([^\n]+(?:\n[^\n]+)?)/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() ?? null;
  const parking =
    pageText.match(/Parking Space Detail:\s*([^\n]+)/i)?.[1]?.trim() ?? null;
  const overview =
    pageText.match(/Overview\n([\s\S]*?)\nProperty Information\n/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() ?? null;
  const amenities: string[] = [];
  const appliances = pageText.match(/Appliances Included:\s*([^\n]+)/i)?.[1];
  if (appliances) amenities.push(`Appliances: ${appliances.trim()}`);

  const flags: ExtractionWarning[] = [];
  if (!isValidMlsRent(listRent)) {
    flags.push({
      code: "invalid_rent",
      message: "List rent missing or zero — not confirmed",
      field: "listRent",
    });
  }
  if (!isValidMlsSqft(sqft)) {
    flags.push({
      code: "invalid_sqft",
      message: "Square footage missing or out of range — not confirmed",
      field: "sqft",
    });
  }

  const rent = isValidMlsRent(listRent) ? listRent : null;
  const area = isValidMlsSqft(sqft) ? sqft : null;
  const psfFromDoc = parseNumber(
    pageText.match(/\$\/SqFt\s*\$?([0-9.]+)/i)?.[1] ?? null,
  );
  const psf =
    psfFromDoc ??
    (rent != null && area != null ? Math.round((rent / area) * 100) / 100 : null);

  // Prefer city/state/zip from full header when present
  let city = parts?.city ?? null;
  let state = parts?.state ?? "CT";
  let postalCode = parts?.postalCode ?? null;
  if (addressRaw) {
    const full = addressRaw.match(
      /,\s*([A-Za-z .]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/,
    );
    if (full) {
      city = full[1]!.trim();
      state = full[2]!.toUpperCase();
      postalCode = full[3]!;
    }
  }

  return {
    mlsNumber,
    addressLine1: parts?.line1 ?? null,
    unit: parts?.unit ?? null,
    city,
    state,
    postalCode,
    listRent: rent,
    status,
    beds,
    baths,
    bathsRaw,
    sqft: area,
    psf,
    daysOnMarket,
    listDate,
    yearBuilt,
    propertyType,
    parking,
    utilitiesTenant,
    amenities,
    description: overview,
    availability,
    pageRefs: [page],
    recordSource: "detail",
    flags,
    rawSnippets: [header?.[0] ?? `Listing ID: ${mlsNumber}`],
    photoCandidates: [],
  };
}

/** Summary table rows — used only to fill gaps / verify, never duplicate detail rows. */
export function parseCtSummaryTableRows(pageText: string, page: number): MlsListing[] {
  const listings: MlsListing[] = [];
  // Pattern across wrapped lines is fragile; use MLS# + later fields from key pages
  const blocks = pageText.split(/(?=\n\d+\s+\d{8}\n)/);
  for (const block of blocks) {
    const mls = block.match(/\n\d+\s+(\d{8})\n/)?.[1];
    if (!mls) continue;
    const rent = parseCurrency(block.match(/\$([0-9,]+)/)?.[1] ?? null);
    const beds = parseNumber(block.match(/\n(\d+)\s+\d+\(/)?.[1] ?? null);
    const sqft = parseNumber(
      block.match(/\)\s*([0-9,]+)\s+[0-9.]+/)?.[1] ?? null,
    );
    const flags: ExtractionWarning[] = [];
    if (!isValidMlsRent(rent)) {
      flags.push({
        code: "invalid_rent",
        message: "Summary rent missing — not confirmed",
        field: "listRent",
      });
    }
    listings.push({
      mlsNumber: mls,
      addressLine1: null,
      unit: null,
      city: null,
      state: "CT",
      postalCode: null,
      listRent: isValidMlsRent(rent) ? rent : null,
      status: "Active",
      beds,
      baths: null,
      bathsRaw: null,
      sqft: isValidMlsSqft(sqft) ? sqft : null,
      psf: null,
      daysOnMarket: null,
      listDate: null,
      yearBuilt: null,
      propertyType: "Residential Rental",
      parking: null,
      utilitiesTenant: null,
      amenities: [],
      description: null,
      availability: null,
      pageRefs: [page],
      recordSource: "summary",
      flags,
      rawSnippets: [block.slice(0, 200)],
      photoCandidates: [],
    });
  }
  return listings;
}

function mergePreferDetail(a: MlsListing, b: MlsListing): MlsListing {
  const prefer = a.recordSource === "detail" ? a : b.recordSource === "detail" ? b : a;
  const other = prefer === a ? b : a;
  return {
    ...prefer,
    addressLine1: prefer.addressLine1 ?? other.addressLine1,
    unit: prefer.unit ?? other.unit,
    city: prefer.city ?? other.city,
    state: prefer.state ?? other.state,
    postalCode: prefer.postalCode ?? other.postalCode,
    listRent: prefer.listRent ?? other.listRent,
    beds: prefer.beds ?? other.beds,
    baths: prefer.baths ?? other.baths,
    bathsRaw: prefer.bathsRaw ?? other.bathsRaw,
    sqft: prefer.sqft ?? other.sqft,
    psf: prefer.psf ?? other.psf,
    daysOnMarket: prefer.daysOnMarket ?? other.daysOnMarket,
    listDate: prefer.listDate ?? other.listDate,
    yearBuilt: prefer.yearBuilt ?? other.yearBuilt,
    propertyType: prefer.propertyType ?? other.propertyType,
    parking: prefer.parking ?? other.parking,
    utilitiesTenant: prefer.utilitiesTenant ?? other.utilitiesTenant,
    amenities: prefer.amenities.length ? prefer.amenities : other.amenities,
    description: prefer.description ?? other.description,
    availability: prefer.availability ?? other.availability,
    pageRefs: Array.from(new Set([...a.pageRefs, ...b.pageRefs])).sort((x, y) => x - y),
    recordSource: prefer.recordSource,
    flags: [...prefer.flags, ...other.flags],
    rawSnippets: [...prefer.rawSnippets, ...other.rawSnippets],
    photoCandidates: [...prefer.photoCandidates, ...other.photoCandidates],
  };
}

export async function parseCtMlsPdfBuffer(opts: {
  filename: string;
  bytes: Uint8Array;
}): Promise<MlsParseResult> {
  const pdf = await getDocumentProxy(opts.bytes.slice());
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [String(text)];
  const warnings: ExtractionWarning[] = [];
  const byMls = new Map<string, MlsListing>();
  const dedupedMlsNumbers: string[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = i + 1;
    const pageText = pages[i] ?? "";
    const detail = parseCtDetailListing(pageText, page);
    if (detail?.mlsNumber) {
      const existing = byMls.get(detail.mlsNumber);
      if (existing) {
        dedupedMlsNumbers.push(detail.mlsNumber);
        byMls.set(detail.mlsNumber, mergePreferDetail(existing, detail));
      } else {
        byMls.set(detail.mlsNumber, detail);
      }
    }
  }

  // Summary / comparison pages — merge only; do not invent new MLS rows if detail exists
  for (let i = 0; i < pages.length; i++) {
    const page = i + 1;
    const pageText = pages[i] ?? "";
    if (
      !/CMA Summary Report|Currently for Sale|Comparables/i.test(pageText) ||
      /Listing ID:/i.test(pageText)
    ) {
      continue;
    }
    for (const row of parseCtSummaryTableRows(pageText, page)) {
      if (!row.mlsNumber) continue;
      const existing = byMls.get(row.mlsNumber);
      if (existing) {
        dedupedMlsNumbers.push(row.mlsNumber);
        byMls.set(row.mlsNumber, mergePreferDetail(existing, row));
      } else {
        byMls.set(row.mlsNumber, row);
      }
    }

    // Key MLS Number table near end
    const keyRows = pageText.matchAll(
      /\d+\)\s+(\d{8})\s+([A-Z]+)\s+(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+.*?\$([0-9,]+)\s+(\d{4})/g,
    );
    for (const m of keyRows) {
      const mls = m[1]!;
      const listing: MlsListing = {
        mlsNumber: mls,
        addressLine1: m[3]!.trim(),
        unit: null,
        city: null,
        state: "CT",
        postalCode: null,
        listRent: isValidMlsRent(parseCurrency(m[7])) ? parseCurrency(m[7]) : null,
        status: m[2] === "ACTV" ? "Active" : m[2]!,
        beds: parseNumber(m[4]),
        baths: parseNumber(m[5]),
        bathsRaw: `${m[5]}/${m[6]}`,
        sqft: null,
        psf: null,
        daysOnMarket: null,
        listDate: null,
        yearBuilt: parseNumber(m[8]),
        propertyType: "Residential Rental",
        parking: null,
        utilitiesTenant: null,
        amenities: [],
        description: null,
        availability: null,
        pageRefs: [page],
        recordSource: "comparison",
        flags: [],
        rawSnippets: [m[0]],
        photoCandidates: [],
      };
      const existing = byMls.get(mls);
      if (existing) {
        dedupedMlsNumbers.push(mls);
        byMls.set(mls, mergePreferDetail(existing, listing));
      } else {
        byMls.set(mls, listing);
      }
    }
  }

  const listings = [...byMls.values()].sort((a, b) =>
    (a.mlsNumber ?? "").localeCompare(b.mlsNumber ?? ""),
  );

  if (listings.length === 0) {
    warnings.push({
      code: "no_listings",
      message: "No CT connectMLS listings could be parsed",
    });
  }

  const rents = listings.map((l) => l.listRent).filter((n): n is number => n != null);

  return {
    dialect: "ct_connectmls",
    parserVersion: MLS_CT_PARSER_VERSION,
    pageCount: totalPages,
    summary: {
      dialect: "ct_connectmls",
      reportDate:
        pages.join("\n").match(/Comparative Market Analysis\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] ??
        null,
      preparedBy:
        pages.join("\n").match(/([^\n|]+)\s*\|\s*[^\n]*@pklventures\.com/i)?.[1]?.trim() ??
        null,
      activeCount: listings.length,
      averageListRent: rents.length
        ? Math.round(rents.reduce((s, n) => s + n, 0) / rents.length)
        : null,
      notes: [
        "Detail pages are authoritative; summary/comparison tables are merged by MLS# only",
        "Document-level High/Low/Average statistics are not imported as listings",
      ],
    },
    listings,
    warnings,
    dedupedMlsNumbers: [...new Set(dedupedMlsNumbers)],
  };
}
