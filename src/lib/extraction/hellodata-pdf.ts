import { extractText, getDocumentProxy } from "unpdf";
import { normalizeAddress, parseCurrency, parseNumber } from "./normalize";
import {
  extractListingUrlsFromText,
  extractPdfAnnotationUrls,
  extractWebsiteFromBlock,
} from "./listing-links";
import type {
  HelloDataCompBuilding,
  HelloDataMarketUnitTypeMetric,
  HelloDataParseResult,
  HelloDataUnitTypeObservation,
} from "./hellodata-types";
import type { ExtractionWarning } from "./types";

function bedsFromLabel(label: string): number | null {
  if (/studio/i.test(label)) return 0;
  const m = label.match(/(\d+)\s*BR/i);
  return m ? Number(m[1]) : null;
}

/**
 * Parse unit-type lines from HelloData Rent Comps cards.
 * Examples:
 *   1 BR $2,146 819 $2.62
 *   2 BR $1,950 900 $2.17
 *   2 BR $2,000
 *   1 BR
 */
export function parseUnitLines(block: string): HelloDataUnitTypeObservation[] {
  const observations: HelloDataUnitTypeObservation[] = [];
  const lineRe =
    /^(Studio|\d+\s*BR)(?:\s+\$([0-9,]+)(?:\s+([0-9,]+)\s+\$([0-9.]+))?)?\s*$/gim;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(block)) !== null) {
    const label = match[1]!.replace(/\s+/g, " ").trim();
    const rent = match[2] ? parseCurrency(match[2]) : null;
    const sqft = match[3] ? parseNumber(match[3]) : null;
    const psf = match[4] ? parseNumber(match[4]) : null;
    const flags: ExtractionWarning[] = [];
    const available = rent != null;
    if (!available) {
      flags.push({
        code: "blank_row",
        message: `No ${label} available`,
        field: "rent",
      });
    }
    if (available && sqft == null) {
      flags.push({
        code: "missing_sqft",
        message: `Missing square footage for ${label}`,
        field: "sqft",
      });
    }
    observations.push({
      unitTypeLabel: label,
      beds: bedsFromLabel(label),
      rent,
      sqft,
      psf,
      available,
      rawLine: match[0],
      flags,
    });
  }
  return observations;
}

function extractRentCompsSection(text: string): string {
  // Prefer the detailed card section ("Benchmark your property...").
  const benchmark = text.search(/\nRent Comps\nBenchmark your property/i);
  if (benchmark >= 0) {
    const from = text.slice(benchmark);
    const end = from.search(
      /\nUnit Type Metrics\n|\nProperty Rankings\n|\nWeekly Market Activity\n|\nRents by Unit Type\n/,
    );
    return end > 0 ? from.slice(0, end) : from.slice(0, 12000);
  }

  const start = text.search(/\nRent Comps\n/);
  if (start < 0) return "";
  const from = text.slice(start);
  const end = from.search(
    /\nUnit Type Metrics\n|\nProperty Rankings\n|\nWeekly Market Activity\n/,
  );
  return end > 0 ? from.slice(0, end) : from.slice(0, 8000);
}

function extractSubjectMeta(text: string): {
  reportDate: string | null;
  dateRange: string | null;
  subjectName: string | null;
  subjectAddressLine: string | null;
} {
  const reportDate = text.match(/Report Date:\s*([0-9/]+)/i)?.[1] ?? null;
  const dateRange =
    text.match(/(\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] ??
    null;
  const exec = text.match(
    /Executive Summary\n([^\n]+)\n([^\n]+)\nReport Date:/i,
  );
  return {
    reportDate,
    dateRange,
    subjectName: exec?.[1]?.trim() ?? null,
    subjectAddressLine: exec?.[2]?.trim() ?? null,
  };
}

function extractMarketMetrics(text: string): HelloDataMarketUnitTypeMetric[] {
  const sectionStart = text.indexOf("Unit Type Metrics");
  if (sectionStart < 0) return [];
  const section = text.slice(sectionStart, sectionStart + 3500);
  const metrics: HelloDataMarketUnitTypeMetric[] = [];
  const blockRe =
    /(Studio|\d+\s*BRs?)\s+Trailing 1 Month\n# Listings\s+(\d+)\nDays on Market\s+(\d+)\nAvg Sqft\s+([0-9,]+)\s*ft²\nAsking Rent \/ PSF\s+\$([0-9,]+)\s*\/\s*\$([0-9.]+)\nEffective Rent \/ PSF\s+\$([0-9,]+)\s*\/\s*\$([0-9.]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(section)) !== null) {
    const label = match[1]!.replace(/\s+/g, " ").trim();
    metrics.push({
      unitTypeLabel: label,
      beds: bedsFromLabel(label.replace(/s$/i, "")),
      listings: parseNumber(match[2]),
      daysOnMarket: parseNumber(match[3]),
      avgSqft: parseNumber(match[4]),
      askingRent: parseCurrency(match[5]),
      askingPsf: parseNumber(match[6]),
      effectiveRent: parseCurrency(match[7]),
      effectivePsf: parseNumber(match[8]),
      scope: "market_trailing_1_month",
      rawBlock: match[0],
    });
  }
  return metrics;
}

interface MapBuildingMeta {
  name: string;
  addressRaw: string | null;
  yearBuilt: number | null;
  totalUnits: number | null;
  distanceMiles: number | null;
  similarityPercent: number | null;
}

/**
 * Report Map cards are more reliable for full address + similarity %.
 */
function extractMapBuildings(text: string): MapBuildingMeta[] {
  const sectionStart = text.indexOf("Report Map");
  if (sectionStart < 0) return [];
  const section = text.slice(sectionStart, sectionStart + 8000);
  const buildings: MapBuildingMeta[] = [];

  const re =
    /(?:^|\n)([^\n]{3,80})\n([^\n]+?(?:RI|CT|MA)[^\n]*)\nYear Built\n([^\n]+)\nNumber of Units\n([^\n]+)(?:\nDistance\n([0-9.]+)\s*mi)?(?:\nSimilarity\n(\d+)%)?/gi;

  let match: RegExpExecArray | null;
  while ((match = re.exec(section)) !== null) {
    const name = match[1]!.trim();
    if (/^(Report Map|View your|Map data|HelloData)/i.test(name)) continue;
    buildings.push({
      name,
      addressRaw: match[2]!.trim(),
      yearBuilt: parseNumber(match[3]),
      totalUnits: parseNumber(match[4]),
      distanceMiles: match[5] ? Number(match[5]) : null,
      similarityPercent: match[6] ? Number(match[6]) : null,
    });
  }
  return buildings;
}

function isCompDistanceHeader(line: string): boolean {
  return /^[A-Za-z0-9].{1,80}\(\d+(?:\.\d+)?\s*mi\)$/i.test(line.trim());
}

function isLikelyManagementLine(line: string): boolean {
  return (
    /[\uE000-\uF8FF]/.test(line) ||
    /\b(LLC|Realty|Associates|Company|Companies|Group|Management|Properties|Medeiros|Picerne|Winn|Carpionato|Micozzi)\b/i.test(
      line,
    )
  );
}

function isBuildingHeader(line: string, subjectName: string | null): boolean {
  if (!line || line.length < 3 || line.length > 90) return false;
  if (
    /^(Studio|\d+\s*BR|Similarity|Leased|Exposure|Year Built|# Units|Stories|Rent|SF|PSF|Rev Mgmt|Ask to Close|Updates|HelloData|PKL Management|Benchmark|Comp Average|Map data|Created by)/i.test(
      line,
    )
  ) {
    return false;
  }
  if (/^\d+(\.\d+)?%$/.test(line)) return false;
  if (isCompDistanceHeader(line)) return true;

  // Subject card only: exact/near match to executive-summary subject name, no distance.
  if (!subjectName) return false;
  if (isLikelyManagementLine(line)) return false;
  if (/,\s*[A-Z]{2}\s+\d{5}/.test(line)) return false;
  const a = line.toLowerCase().replace(/\./g, "");
  const b = subjectName.toLowerCase().replace(/\./g, "");
  const subjectHit =
    a === b || a.includes(b.slice(0, 12)) || b.includes(a.slice(0, 12));
  if (subjectHit) return true;

  // Non-subject numeric street lines are never titles.
  if (
    /^\d/.test(line) &&
    /(Drive|Dr|Street|St|Avenue|Ave|Road|Rd|Parkway|Pkwy|Lane|Ln|Court|Ct|Turnpike|Way|Blvd|Boulevard)/i.test(
      line,
    )
  ) {
    return false;
  }
  return false;
}

/**
 * Parse HelloData "Rent Comps" building cards from the Benchmark section.
 */
function parseRentCompBuildings(
  section: string,
  subjectName: string | null,
  mapByName: Map<string, MapBuildingMeta>,
): HelloDataCompBuilding[] {
  const cleaned = section
    .replace(/\nHelloData\.ai Page \|[^\n]+/g, "\n")
    .replace(/\n\d+\n(?=\n|[A-Z])/g, "\n")
    .replace(/\nSimilarity Leased % \(Adv\)[^\n]*/g, "\n");

  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Locate card starts: subject name match and/or "Name (x.xx mi)" headers only.
  const starts: number[] = [];
  let subjectHeaderSeen = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!isBuildingHeader(line, subjectName)) continue;
    const window = lines.slice(i, i + 10).join("\n");
    if (!/(Studio|\d+\s*BR)/i.test(window)) continue;
    if (!isCompDistanceHeader(line)) {
      if (subjectHeaderSeen) continue;
      subjectHeaderSeen = true;
    }
    starts.push(i);
  }

  const buildings: HelloDataCompBuilding[] = [];

  for (let s = 0; s < starts.length; s++) {
    const start = starts[s]!;
    const end = s + 1 < starts.length ? starts[s + 1]! : lines.length;
    const partLines = lines.slice(start, end);
    const part = partLines.join("\n");
    const titleLine = partLines[0]!;
    const distanceMatch = titleLine.match(/\((\d+(?:\.\d+)?)\s*mi\)$/i);
    const name = titleLine.replace(/\s*\(\d+(?:\.\d+)?\s*mi\)$/i, "").trim();
    if (/^(Rent Comps|Benchmark)/i.test(name)) continue;

    const addressLine =
      partLines.find(
        (l, idx) =>
          idx > 0 &&
          !isLikelyManagementLine(l) &&
          (/^\d/.test(l) ||
            /Street|St|Avenue|Ave|Drive|Dr|Road|Rd|Parkway|Pkwy|Lane|Court|Turnpike/i.test(
              l,
            )),
      ) ?? null;
    const cityLine =
      partLines.find(
        (l) => /,\s*[A-Z]{2}\s+\d{5}/.test(l) && !isLikelyManagementLine(l),
      ) ?? null;

    const stats = part.match(/\b((?:19|20)\d{2})\s+(\d+)\s+(\d+)\b/);
    const yearBuilt = stats ? Number(stats[1]) : null;
    const totalUnits = stats ? Number(stats[2]) : null;
    const stories = stats ? Number(stats[3]) : null;

    const mapMeta =
      mapByName.get(name.toLowerCase()) ??
      [...mapByName.values()].find((m) =>
        m.name.toLowerCase().includes(name.toLowerCase().slice(0, 12)),
      );

    const isSubject =
      !distanceMatch &&
      (subjectName
        ? name.toLowerCase().includes(subjectName.toLowerCase().slice(0, 10)) ||
          subjectName.toLowerCase().includes(name.toLowerCase().slice(0, 10))
        : buildings.length === 0);

    const scrub = (s: string | null | undefined) =>
      s
        ? s.replace(/[\uE000-\uF8FF]/g, " ").replace(/\s+/g, " ").trim()
        : null;

    const cardAddress = [scrub(addressLine), scrub(cityLine)]
      .filter(Boolean)
      .join(", ");
    const addressRaw = cardAddress || scrub(mapMeta?.addressRaw) || null;

    const unitTypes = parseUnitLines(part);
    if (!unitTypes.length) continue;

    buildings.push({
      name: scrub(name) ?? name,
      address: normalizeAddress(addressRaw),
      cityStateZipRaw: scrub(cityLine),
      distanceMiles:
        distanceMatch != null
          ? Number(distanceMatch[1])
          : isSubject
            ? 0
            : (mapMeta?.distanceMiles ?? null),
      similarityPercent: mapMeta?.similarityPercent ?? null,
      yearBuilt: yearBuilt ?? mapMeta?.yearBuilt ?? null,
      totalUnits: totalUnits ?? mapMeta?.totalUnits ?? null,
      stories,
      managementCompany: null,
      websiteUrl: extractWebsiteFromBlock(part),
      isSubject,
      unitTypes,
      pageRef: "Rent Comps",
      rawBlock: part.slice(0, 1200),
    });
  }

  // Ensure only one subject; if multiple flagged, keep first.
  let subjectSeen = false;
  for (const b of buildings) {
    if (b.isSubject) {
      if (subjectSeen) b.isSubject = false;
      subjectSeen = true;
    }
  }

  return buildings;
}

/**
 * Fallback: property rows from "Rents by Unit Type" when card rents are sparse.
 * These rows are often portfolio-level (not always bedroom-specific) — flagged as such.
 */
function extractRentsByUnitTypeRows(text: string): Array<{
  name: string;
  daysOnMarket: number | null;
  avgSqft: number | null;
  avgRent: number | null;
  avgPsf: number | null;
  available: boolean;
  rawLine: string;
}> {
  const start = text.indexOf("Rents by Unit Type");
  if (start < 0) return [];
  const section = text.slice(start, start + 4000);
  const rows: Array<{
    name: string;
    daysOnMarket: number | null;
    avgSqft: number | null;
    avgRent: number | null;
    avgPsf: number | null;
    available: boolean;
    rawLine: string;
  }> = [];

  const lineRe =
    /^([A-Za-z0-9][^\n]{1,60}?)\s+(\d+)\s+(\d+)\s+(\d+)\s+([0-9,]+)\s+([0-9,]+)\s+([0-9,]+)\s+\$([0-9,]+)\s+\$([0-9,]+)\s+\$([0-9,]+)\s+\$([0-9.]+)/gm;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(section)) !== null) {
    const name = match[1]!.trim();
    if (/Comp Average|Track rent|# Leased/i.test(name)) continue;
    rows.push({
      name,
      daysOnMarket: parseNumber(match[3]),
      avgSqft: parseNumber(match[6]),
      avgRent: parseCurrency(match[9]),
      avgPsf: parseNumber(match[11]),
      available: true,
      rawLine: match[0],
    });
  }

  // Unavailable rows: "Name 0 0 --"
  const blankRe = /^([A-Za-z0-9][^\n]{1,60}?)\s+0\s+0\s+--\s*$/gm;
  while ((match = blankRe.exec(section)) !== null) {
    const name = match[1]!.trim();
    if (/Comp Average/i.test(name)) continue;
    rows.push({
      name,
      daysOnMarket: null,
      avgSqft: null,
      avgRent: null,
      avgPsf: null,
      available: false,
      rawLine: match[0],
    });
  }

  return rows;
}

export function parseHelloDataPdfText(text: string): HelloDataParseResult {
  const warnings: ExtractionWarning[] = [];
  const meta = extractSubjectMeta(text);
  const mapBuildings = extractMapBuildings(text);
  const mapByName = new Map(
    mapBuildings.map((b) => [b.name.toLowerCase(), b]),
  );
  const rentCompsSection = extractRentCompsSection(text);

  if (!rentCompsSection) {
    warnings.push({
      code: "parse_partial",
      message: "Could not locate HelloData Rent Comps Benchmark section",
    });
  }

  const buildings = parseRentCompBuildings(
    rentCompsSection,
    meta.subjectName,
    mapByName,
  );
  const comparableBuildings = buildings.filter((b) => !b.isSubject);
  const marketMetrics = extractMarketMetrics(text);
  const rentsByUnitType = extractRentsByUnitTypeRows(text);

  if (rentsByUnitType.length) {
    warnings.push({
      code: "parse_partial",
      message:
        "Rents by Unit Type rows captured for audit; bedroom semantics may be report-filter-scoped — prefer Rent Comps card unit lines for unit-type rents",
    });
  }

  if (!buildings.length) {
    warnings.push({
      code: "unsupported_layout",
      message: "No HelloData comparable buildings could be parsed from PDF text",
    });
  }

  const missingUnitCount = comparableBuildings.filter((b) =>
    b.unitTypes.some((u) => !u.available),
  ).length;
  if (missingUnitCount > 0) {
    warnings.push({
      code: "blank_row",
      message: `${missingUnitCount} comparable building(s) missing one or more unit-type rents`,
    });
  }

  const subjectBuilding = buildings.find((b) => b.isSubject);
  const subjectAddress =
    subjectBuilding?.address ??
    normalizeAddress(
      [
        mapBuildings.find((b) =>
          meta.subjectName
            ? b.name.toLowerCase().includes(meta.subjectName.toLowerCase().slice(0, 10))
            : false,
        )?.addressRaw,
        meta.subjectAddressLine,
      ]
        .filter(Boolean)
        .join(", "),
    );

  const documentListingLinks = extractListingUrlsFromText(text);

  return {
    kind: "hellodata_pdf",
    sourceType: "hellodata_pdf",
    reportDate: meta.reportDate,
    dateRange: meta.dateRange,
    subjectName: meta.subjectName,
    subjectAddress,
    documentListingLinks,
    buildings,
    comparableBuildings,
    marketMetrics,
    warnings,
    textExcerpt: text.slice(0, 2000),
  };
}

export async function parseHelloDataPdfBuffer(opts: {
  filename: string;
  bytes: Uint8Array;
}): Promise<HelloDataParseResult> {
  void opts.filename;
  const pdf = await getDocumentProxy(opts.bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const joined = Array.isArray(text) ? text.join("\n") : String(text ?? "");
  const parsed = parseHelloDataPdfText(joined);
  const annotLinks = await extractPdfAnnotationUrls(pdf);
  const merged = extractListingUrlsFromText(
    [...parsed.documentListingLinks.all, ...annotLinks.all].join("\n"),
  );
  return { ...parsed, documentListingLinks: merged };
}
