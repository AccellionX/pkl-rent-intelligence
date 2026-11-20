import { extractText, getDocumentProxy } from "unpdf";
import { parseCurrency, parseNumber } from "./normalize";
import {
  isValidMlsRent,
  isValidMlsSqft,
  MLS_RI_PARSER_VERSION,
  type MlsListing,
  type MlsParseResult,
} from "./mls-types";
import type { ExtractionWarning } from "./types";

function splitUnit(address: string): { line1: string; unit: string | null } {
  const cleaned = address.replace(/\s+/g, " ").trim();
  const hash = cleaned.match(/^(.*?)\s*[#]\s*([A-Za-z0-9-]+)\s*$/);
  if (hash) return { line1: hash[1]!.trim(), unit: hash[2]! };
  const unitWord = cleaned.match(/^(.*?),\s*Unit#?\s*([A-Za-z0-9-]+)\s*$/i);
  if (unitWord) return { line1: unitWord[1]!.trim(), unit: unitWord[2]! };
  return { line1: cleaned, unit: null };
}

function parseBathsFraction(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return parseNumber(raw);
  const full = Number(m[1]);
  const half = Number(m[2]);
  if (!Number.isFinite(full) || !Number.isFinite(half)) return null;
  // RI "1/0" means 1 full / 0 half → 1.0 (not 1.5).
  return full + (half > 0 ? 0.5 : 0);
}

/**
 * Split jammed `1/0455` (baths 1/0 + sqft 455) vs clean `1/0` + separate sqft.
 */
function splitBathsAndSqft(
  bathsToken: string | null,
  sqftToken: string | null,
): { bathsRaw: string | null; baths: number | null; sqft: number | null } {
  if (bathsToken && /^\d+\/\d{2,}$/.test(bathsToken)) {
    const m = bathsToken.match(/^(\d+)\/(\d)(\d+)$/);
    if (m) {
      const bathsRaw = `${m[1]}/${m[2]}`;
      return {
        bathsRaw,
        baths: parseBathsFraction(bathsRaw),
        sqft: parseNumber(m[3]),
      };
    }
  }
  return {
    bathsRaw: bathsToken,
    baths: parseBathsFraction(bathsToken),
    sqft: parseNumber(sqftToken),
  };
}

/**
 * RI State-Wide MLS CMA summary rows are often concatenated without separators.
 * Examples from live fixture:
 *   1Apartment87 Bentley Street #2 $1,3501424879 10/01/2026 1/0455 31
 *   1Apartment25 Wesleyan Avenue $1,2251420890 08/17/2026 430 76
 */
export function parseRiSummaryListingLine(
  line: string,
  page: number,
): MlsListing | null {
  const normalized = line.replace(/\s+/g, " ").trim();
  // Currency must not swallow MLS digits: $1,350 + 1424879 (7-digit RI MLS ids).
  // Baths often jammed as 1/0455 (= 1/0 baths + 455 sqft).
  const re =
    /^(\d+)(Apartment(?:,?\s*One\s*Level)?|Below Ground Unit|Condo|Townhouse|House|Single Family)\s*(.+?)\s*\$(\d{1,3}(?:,\d{3})*)(\d{7})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(?:(\d+)\/(\d)(\d+)\s+(\d+)|(\d+)\s+(\d+))\s*$/i;
  const m = normalized.match(re);
  if (!m) return null;

  const beds = parseNumber(m[1]);
  const propertyType = m[2]!.replace(/\s+/g, " ").trim();
  const { line1, unit } = splitUnit(m[3]!);
  const listRent = parseCurrency(m[4]);
  const mlsNumber = m[5]!;
  const listDate = m[6]!;
  let bathsRaw: string | null = null;
  let baths: number | null = null;
  let sqft: number | null = null;
  let daysOnMarket: number | null = null;
  if (m[7] != null) {
    bathsRaw = `${m[7]}/${m[8]}`;
    baths = parseBathsFraction(bathsRaw);
    sqft = parseNumber(m[9]);
    daysOnMarket = parseNumber(m[10]);
  } else {
    const split = splitBathsAndSqft(null, m[11] ?? null);
    bathsRaw = split.bathsRaw;
    baths = split.baths;
    sqft = split.sqft;
    daysOnMarket = parseNumber(m[12]);
  }

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
  const psf = rent != null && area != null ? Math.round((rent / area) * 100) / 100 : null;

  return {
    mlsNumber,
    addressLine1: line1,
    unit,
    city: null,
    state: "RI",
    postalCode: null,
    listRent: rent,
    status: "Active",
    beds,
    baths,
    bathsRaw,
    sqft: area,
    psf,
    daysOnMarket,
    listDate,
    yearBuilt: null,
    propertyType,
    parking: null,
    utilitiesTenant: null,
    amenities: [],
    description: null,
    availability: null,
    pageRefs: [page],
    recordSource: "summary",
    flags,
    rawSnippets: [normalized],
    photoCandidates: [],
  };
}

/** Photo-gallery header pages: "List Price: $X" + "Address MLS #: N". */
export function parseRiGalleryHeader(
  pageText: string,
  page: number,
): Partial<MlsListing> | null {
  const price = parseCurrency(pageText.match(/List Price:\s*\$([0-9,]+)/i)?.[1] ?? null);
  const header = pageText.match(
    /([^\n]+?)\s+MLS\s*#:\s*(\d{6,8})/i,
  );
  if (!header) return null;
  const { line1, unit } = splitUnit(header[1]!.trim());
  return {
    mlsNumber: header[2]!,
    addressLine1: line1,
    unit,
    listRent: isValidMlsRent(price) ? price : null,
    state: "RI",
    status: "Active",
    pageRefs: [page],
    recordSource: "photo_gallery",
    rawSnippets: [header[0]!],
  };
}

function mergeListings(primary: MlsListing, extra: Partial<MlsListing>): MlsListing {
  const pages = Array.from(new Set([...primary.pageRefs, ...(extra.pageRefs ?? [])])).sort(
    (a, b) => a - b,
  );
  return {
    ...primary,
    listRent: primary.listRent ?? (isValidMlsRent(extra.listRent ?? null) ? extra.listRent! : null),
    addressLine1: primary.addressLine1 ?? extra.addressLine1 ?? null,
    unit: primary.unit ?? extra.unit ?? null,
    pageRefs: pages,
    rawSnippets: [...primary.rawSnippets, ...(extra.rawSnippets ?? [])],
    photoCandidates: [...primary.photoCandidates, ...(extra.photoCandidates ?? [])],
  };
}

export async function parseRiMlsPdfBuffer(opts: {
  filename: string;
  bytes: Uint8Array;
}): Promise<MlsParseResult> {
  const pdf = await getDocumentProxy(opts.bytes.slice());
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [String(text)];
  const warnings: ExtractionWarning[] = [];
  const byMls = new Map<string, MlsListing>();
  const dedupedMlsNumbers: string[] = [];

  // Page 1 (and any page with "Brief Summary") → listing rows
  for (let i = 0; i < pages.length; i++) {
    const page = i + 1;
    const pageText = pages[i] ?? "";
    if (!/Brief Summary of Compared Listings|Status:\s*Active/i.test(pageText)) {
      continue;
    }
    // Flatten soft line breaks inside property type labels / wrapped addresses
    const flattened = pageText
      .replace(/Apartment,\s*\n\s*One\s*\n\s*Level/gi, "Apartment, One Level")
      .replace(/Apartment,\s*One\s*\n\s*Level/gi, "Apartment, One Level")
      .replace(
        /(Apartment,\s*One Level)\s*\n\s*([^\n]+\$\d)/gi,
        "$1 $2",
      );
    for (const rawLine of flattened.split(/\n+/)) {
      const listing = parseRiSummaryListingLine(rawLine, page);
      if (!listing?.mlsNumber) continue;
      const existing = byMls.get(listing.mlsNumber);
      if (existing) {
        dedupedMlsNumbers.push(listing.mlsNumber);
        byMls.set(listing.mlsNumber, mergeListings(existing, listing));
      } else {
        byMls.set(listing.mlsNumber, listing);
      }
    }
  }

  // Gallery pages enrich address/price but do not create new listings alone if summary existed
  for (let i = 0; i < pages.length; i++) {
    const page = i + 1;
    const pageText = pages[i] ?? "";
    if (!/Photo Gallery/i.test(pageText)) continue;
    const header = parseRiGalleryHeader(pageText, page);
    if (!header?.mlsNumber) continue;
    const existing = byMls.get(header.mlsNumber);
    if (existing) {
      dedupedMlsNumbers.push(header.mlsNumber);
      byMls.set(header.mlsNumber, mergeListings(existing, header));
    }
    // Do not invent gallery-only listings — photo pages lack beds/sqft and duplicate summary rows.
  }

  const listings = [...byMls.values()].sort((a, b) =>
    (a.mlsNumber ?? "").localeCompare(b.mlsNumber ?? ""),
  );

  if (listings.length === 0) {
    warnings.push({
      code: "no_listings",
      message: "No RI MLS listings could be parsed from summary or gallery pages",
    });
  }

  const rents = listings.map((l) => l.listRent).filter((n): n is number => n != null);
  const avg =
    rents.length > 0 ? Math.round(rents.reduce((s, n) => s + n, 0) / rents.length) : null;

  return {
    dialect: "ri_statewide",
    parserVersion: MLS_RI_PARSER_VERSION,
    pageCount: totalPages,
    summary: {
      dialect: "ri_statewide",
      reportDate:
        pages[0]?.match(
          /(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}/,
        )?.[0] ?? null,
      preparedBy: pages.join("\n").match(/Presented By:\s*([^\n]+)/i)?.[1]?.trim() ?? null,
      activeCount: listings.length,
      averageListRent: avg,
      notes: [
        "Summary statistics rows are not imported as listings",
        "Photo gallery pages enrich MLS identity but do not duplicate listing rows",
      ],
    },
    listings,
    warnings,
    dedupedMlsNumbers: [...new Set(dedupedMlsNumbers)],
  };
}
