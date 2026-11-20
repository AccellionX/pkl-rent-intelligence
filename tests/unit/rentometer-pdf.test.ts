import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseRentometerPdfBuffer,
  parseRentometerPdfText,
} from "@/lib/extraction/rentometer-pdf";

import { CLIENT_REL, resolveClientPath } from "../helpers/client-source-paths";

const REAL_855_PDF =
  resolveClientPath("PKL_RENTOMETER_855_PDF", ...CLIENT_REL.rentometer855Pdf) ?? "";

const REAL_VETS_PDF = process.env.PKL_RENTOMETER_VETS_PDF?.trim() ?? "";

const SYNTHETIC_TEXT = `
Generated Nov 14, 2026 · rentometer.com Report ID: qPiKWT24DL0
855 Providence St West Warwick, RI 02893
Results based on 21, 2-bedroom, single bath rentals seen within 3 months in a 3.00 mile radius.
AVERAGE
$2,033 ±3%
MEDIAN
$2,085
25TH PERCENTILE
$1,833
75TH PERCENTILE
$2,232
Sample Size 21
Sample Min $1,400.0
Sample Max $2,480.0
Sample Median $2,085
Sample Mean $2,033
Sample Standard Deviation $296
25th – 75th Percentile $1,833 – 2,232
A 855 Providence St, West Warwick, RI 02893 0.0 mi $2,085 900 ft² $2.32/ft² 2 bed 1ba Apartment Oct 2026
B 303 Greenwich Ave, Warwick, RI 02886 0.91 mi $2,480 1,040 ft² $2.38/ft² 2 bed 1ba Apartment Oct 2026
`;

describe("Rentometer PDF summary parser", () => {
  it("extracts dataset-level summary metrics from text", () => {
    const parsed = parseRentometerPdfText(
      SYNTHETIC_TEXT,
      "20261114-Rentometer-855-2-bed-qPiKWT24DL0.pdf",
    );
    expect(parsed.summary.reportId).toBe("qPiKWT24DL0");
    expect(parsed.summary.sampleSize).toBe(21);
    expect(parsed.summary.averageRent).toBe(2033);
    expect(parsed.summary.medianRent).toBe(2085);
    expect(parsed.summary.percentile25).toBe(1833);
    expect(parsed.summary.percentile75).toBe(2232);
    expect(parsed.summary.sampleMin).toBe(1400);
    expect(parsed.summary.sampleMax).toBe(2480);
    // Supplemental listings are never includeAsCompCandidate
    expect(parsed.supplementalListings.length).toBeGreaterThan(0);
    expect(parsed.supplementalListings.every((l) => !l.includeAsCompCandidate)).toBe(
      true,
    );
  });

  it("flags filename vs PDF report id mismatch", () => {
    const parsed = parseRentometerPdfText(
      SYNTHETIC_TEXT,
      "report-OTHERID99.pdf",
    );
    expect(parsed.warnings.some((w) => w.code === "report_id_mismatch")).toBe(true);
  });

  (existsSync(REAL_855_PDF) ? it : it.skip)(
    "parses real 855 PDF buffer and matches CSV report id",
    async () => {
      const bytes = new Uint8Array(readFileSync(REAL_855_PDF));
      const parsed = await parseRentometerPdfBuffer({
        filename: path.basename(REAL_855_PDF),
        bytes,
      });
      expect(parsed.summary.reportId).toBe("qPiKWT24DL0");
      expect(parsed.reportIdFromFilename).toBe("qPiKWT24DL0");
      expect(parsed.summary.sampleSize).toBe(21);
      expect(parsed.summary.averageRent).toBe(2033);
      expect(parsed.summary.medianRent).toBe(2085);
      expect(
        parsed.supplementalListings.every((l) => !l.includeAsCompCandidate),
      ).toBe(true);
    },
  );

  (existsSync(REAL_VETS_PDF) ? it : it.skip)(
    "parses Veterans Rentometer PDF summary without inventing comps",
    async () => {
      const bytes = new Uint8Array(readFileSync(REAL_VETS_PDF));
      const parsed = await parseRentometerPdfBuffer({
        filename: path.basename(REAL_VETS_PDF),
        bytes,
      });
      expect(parsed.summary.reportId).toBeTruthy();
      expect(parsed.summary.sampleSize == null || parsed.summary.sampleSize > 0).toBe(
        true,
      );
      expect(
        parsed.supplementalListings.every((l) => !l.includeAsCompCandidate),
      ).toBe(true);
    },
  );
});
