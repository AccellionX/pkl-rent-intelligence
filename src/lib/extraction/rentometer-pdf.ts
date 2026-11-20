import { extractText, getDocumentProxy } from "unpdf";
import {
  extractRentometerReportIdFromFilename,
  normalizeAddress,
  parseCurrency,
  parseNumber,
} from "./normalize";
import type {
  ExtractionWarning,
  RentometerCandidate,
  RentometerPdfParseResult,
  RentometerSummaryMetrics,
} from "./types";

function matchNumber(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) {
      const value = parseCurrency(m[1]) ?? parseNumber(m[1]);
      if (value != null) return value;
    }
  }
  return null;
}

export function parseRentometerPdfText(
  text: string,
  filename: string,
): Omit<RentometerPdfParseResult, "kind" | "sourceType"> & {
  summary: RentometerSummaryMetrics;
} {
  const warnings: ExtractionWarning[] = [];
  const reportIdFromFilename = extractRentometerReportIdFromFilename(filename);
  const reportIdFromText =
    text.match(/Report ID:\s*([A-Za-z0-9]+)/i)?.[1] ?? null;

  if (
    reportIdFromFilename &&
    reportIdFromText &&
    reportIdFromFilename !== reportIdFromText
  ) {
    warnings.push({
      code: "report_id_mismatch",
      message: `Filename report id (${reportIdFromFilename}) does not match PDF report id (${reportIdFromText})`,
    });
  }

  const summary: RentometerSummaryMetrics = {
    reportId: reportIdFromText ?? reportIdFromFilename,
    generatedDate:
      text.match(/Generated\s+([A-Za-z0-9 ,]+?)\s*[·•]/i)?.[1]?.trim() ??
      text.match(/Report generated:\s*([^\n]+)/i)?.[1]?.trim() ??
      null,
    sampleSize: matchNumber(text, [
      /Sample Size\s+(\d+)/i,
      /Results based on\s+(\d+)/i,
    ]),
    averageRent: matchNumber(text, [
      /Sample Mean\s*\$?\s*([0-9,.]+)/i,
      /AVERAGE\s*\$?\s*([0-9,.]+)/i,
    ]),
    medianRent: matchNumber(text, [
      /Sample Median\s*\$?\s*([0-9,.]+)/i,
      /MEDIAN\s*\$?\s*([0-9,.]+)/i,
    ]),
    percentile25: matchNumber(text, [
      /25TH PERCENTILE\s*\$?\s*([0-9,.]+)/i,
      /25th\s*[–-]\s*75th Percentile\s*\$?\s*([0-9,.]+)/i,
    ]),
    percentile75: matchNumber(text, [
      /75TH PERCENTILE\s*\$?\s*([0-9,.]+)/i,
      /25th\s*[–-]\s*75th Percentile\s*\$?[0-9,.]+\s*[–-]\s*\$?\s*([0-9,.]+)/i,
    ]),
    sampleMin: matchNumber(text, [/Sample Min\s*\$?\s*([0-9,.]+)/i]),
    sampleMax: matchNumber(text, [/Sample Max\s*\$?\s*([0-9,.]+)/i]),
    sampleStdDev: matchNumber(text, [
      /Sample Standard Deviation\s*\$?\s*([0-9,.]+)/i,
    ]),
    radiusMiles: matchNumber(text, [/([0-9.]+)\s*mile radius/i]),
    bedroomFilter: matchNumber(text, [/(\d+)\s*-bedroom/i]),
    subjectAddressRaw:
      text.match(
        /\n([0-9].+?(?:St|Ave|Rd|Dr|Pkwy|Blvd|Ln|Way)[^\n]*)\nResults based on/i,
      )?.[1]?.trim() ?? null,
    source: reportIdFromText || text.includes("AVERAGE") ? "pdf_summary" : "filename",
  };

  // Supplemental listings from PDF are reference-only (not approved comps).
  const supplementalListings: RentometerCandidate[] = [];
  const listingLine =
    /([A-Z])\s+(\d{1,6}[^\$\n]+?)\s+(\d+(?:\.\d+)?)\s*mi\s+\$([0-9,]+)\s+([0-9,]*)\s*(?:ft²)?\s*\$?([0-9.]*)\s*(?:\/ft²)?\s+(\d+)\s*bed\s+(\d+(?:\.\d+)?)ba\s+(\w+)\s+([A-Za-z]+(?:\s+\d{4})?)/gi;

  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = listingLine.exec(text)) !== null) {
    const addressRaw = match[2]!.trim().replace(/\s+/g, " ");
    const rent = parseCurrency(match[4]);
    const sqft = parseNumber(match[5] || null);
    supplementalListings.push({
      rowIndex: idx,
      rowRef: `pdf:${match[1]}`,
      raw: {
        letter: match[1]!,
        address: addressRaw,
        distance: match[3]!,
        rent: match[4]!,
        sqft: match[5] ?? "",
        beds: match[7]!,
        baths: match[8]!,
        propertyType: match[9]!,
        lastSeen: match[10]!,
      },
      name: null,
      address: normalizeAddress(addressRaw),
      rent,
      sqft,
      psf: parseNumber(match[6] || null),
      beds: parseNumber(match[7]),
      baths: parseNumber(match[8]),
      distanceMiles: parseNumber(match[3]),
      propertyType: match[9]!,
      listDate: match[10]!,
      outlier: null,
      listingUrl: null,
      isSubjectLikely: false,
      isBlankRow: false,
      flags: [],
      includeAsCompCandidate: false, // PDF listings are never auto candidates
    });
    idx += 1;
  }

  if (!summary.averageRent && !summary.medianRent && !summary.sampleSize) {
    warnings.push({
      code: "parse_partial",
      message: "Could not extract Rentometer summary statistics from PDF text",
    });
  }

  return {
    summary,
    supplementalListings,
    warnings,
    reportIdFromFilename,
    textExcerpt: text.slice(0, 1500),
  };
}

export async function parseRentometerPdfBuffer(opts: {
  filename: string;
  bytes: Uint8Array;
}): Promise<RentometerPdfParseResult> {
  const pdf = await getDocumentProxy(opts.bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const joined = Array.isArray(text) ? text.join("\n") : String(text ?? "");
  const parsed = parseRentometerPdfText(joined, opts.filename);
  return {
    kind: "pdf",
    sourceType: "rentometer_pdf",
    ...parsed,
  };
}
