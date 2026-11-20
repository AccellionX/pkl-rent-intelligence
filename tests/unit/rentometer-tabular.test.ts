import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRentometerTabular } from "@/lib/extraction/rentometer-tabular";
import * as XLSX from "xlsx";
import { CLIENT_REL, resolveClientPath } from "../helpers/client-source-paths";

const FIXTURE_DIR = path.join(process.cwd(), "tests/fixtures/rentometer");
const SYNTHETIC = path.join(FIXTURE_DIR, "synthetic-2bed.csv");
const REORDERED = path.join(FIXTURE_DIR, "synthetic-reordered.csv");

const REAL_855_CSV =
  resolveClientPath("PKL_RENTOMETER_855_CSV", ...CLIENT_REL.rentometer855Csv) ?? "";

describe("Rentometer tabular parser", () => {
  it("parses synthetic fixture with currency, blanks, dups, and suspicious sqft", () => {
    const text = readFileSync(SYNTHETIC, "utf8");
    const result = parseRentometerTabular({
      filename: "synthetic-2bed-qTESTID01.csv",
      sourceType: "rentometer_csv",
      text,
      subjectAddress: "100 Example St, Sample City, RI 02900",
    });

    expect(result.reportIdFromFilename).toBe("qTESTID01");
    expect(result.rowCount).toBeGreaterThan(5);
    expect(result.candidates.some((c) => c.isSubjectLikely)).toBe(true);
    expect(result.candidates.some((c) => c.flags.some((f) => f.code === "blank_row"))).toBe(
      true,
    );
    expect(
      result.candidates.some((c) => c.flags.some((f) => f.code === "missing_sqft")),
    ).toBe(true);
    expect(
      result.candidates.some((c) => c.flags.some((f) => f.code === "suspicious_sqft")),
    ).toBe(true);

    const dupAddress = result.candidates.filter(
      (c) => c.address?.normalized?.includes("500 duplex ct"),
    );
    expect(dupAddress.length).toBe(2);
    // Same-address rows preserved (not collapsed).
    expect(dupAddress.every((c) => c.includeAsCompCandidate || c.isSubjectLikely || c.rent)).toBe(
      true,
    );

    const currencyRow = result.candidates.find((c) =>
      c.address?.raw?.includes("200 Demo Ave"),
    );
    expect(currencyRow?.rent).toBe(2480);
  });

  it("supports reordered / alternate headers", () => {
    const text = readFileSync(REORDERED, "utf8");
    const result = parseRentometerTabular({
      filename: "reordered.csv",
      sourceType: "rentometer_csv",
      text,
    });
    expect(result.warnings.some((w) => w.code === "unsupported_layout")).toBe(false);
    expect(result.candidateCount).toBe(2);
    expect(result.candidates[0]?.rent).toBe(2100);
  });

  it("parses excel buffers with the same mapping", () => {
    const wb = XLSX.utils.book_new();
    const data = [
      {
        address: "10 Excel St, Town, RI 02800, USA",
        "distance (mi)": 1,
        price: "$1,900",
        "size (sqft)": 800,
        bedrooms: 2,
        baths: "1ba",
        "property type": "Apartment",
        "list date": "10/01/2026",
        outlier: "FALSE",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const written = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const buffer = written.buffer.slice(
      written.byteOffset,
      written.byteOffset + written.byteLength,
    ) as ArrayBuffer;

    const result = parseRentometerTabular({
      filename: "sample.xlsx",
      sourceType: "rentometer_xlsx",
      buffer,
    });
    expect(result.warnings.some((w) => w.code === "unsupported_layout")).toBe(false);
    expect(result.candidateCount).toBe(1);
    expect(result.candidates[0]?.rent).toBe(1900);
  });

  it("rejects unsupported layouts", () => {
    const result = parseRentometerTabular({
      filename: "bad.csv",
      sourceType: "rentometer_csv",
      text: "foo,bar\n1,2\n",
    });
    expect(result.warnings.some((w) => w.code === "unsupported_layout")).toBe(true);
    expect(result.candidateCount).toBe(0);
  });

  it("does not invent unavailable fields", () => {
    const result = parseRentometerTabular({
      filename: "minimal.csv",
      sourceType: "rentometer_csv",
      text: "address,price\n\"1 Main St, City, RI 02903, USA\",1500\n",
    });
    expect(result.candidates[0]?.sqft).toBeNull();
    expect(result.candidates[0]?.beds).toBeNull();
    expect(result.candidates[0]?.flags.some((f) => f.code === "missing_sqft")).toBe(true);
  });
});

describe("855 Providence Rentometer CSV (real file)", () => {
  const hasReal = existsSync(REAL_855_CSV);

  (hasReal ? it : it.skip)("parses real 855 CSV with expected shape", () => {
    const text = readFileSync(REAL_855_CSV, "utf8");
    const result = parseRentometerTabular({
      filename: path.basename(REAL_855_CSV),
      sourceType: "rentometer_csv",
      text,
      subjectAddress: "855 Providence St, West Warwick, RI 02893",
    });

    expect(result.reportIdFromFilename).toBe("qPiKWT24DL0");
    // Papa may retain a trailing blank line depending on file newline style.
    expect(result.rowCount).toBeGreaterThanOrEqual(22);
    expect(result.rowCount).toBeLessThanOrEqual(23);
    expect(result.candidates.filter((c) => c.isSubjectLikely).length).toBeGreaterThan(0);
    expect(result.candidateCount).toBeGreaterThan(10);
    // Preserve same-address raw rows (Meshanticut / Old Carriage)
    const mesh = result.candidates.filter((c) =>
      (c.address?.raw ?? "").includes("444 Meshanticut"),
    );
    expect(mesh.length).toBe(5);
    const carriage = result.candidates.filter((c) =>
      (c.address?.raw ?? "").includes("35 Old Carriage"),
    );
    expect(carriage.length).toBe(2);
    expect(result.candidates.some((c) => c.flags.some((f) => f.code === "blank_row"))).toBe(
      true,
    );
    expect(
      result.candidates.some((c) => c.flags.some((f) => f.code === "suspicious_sqft")),
    ).toBe(true);

    // Spot-check numeric extraction from first non-subject candidate
    const greenwich = result.candidates.find((c) =>
      (c.address?.raw ?? "").includes("303 Greenwich"),
    );
    expect(greenwich?.rent).toBe(2480);
    expect(greenwich?.sqft).toBe(1040);
    expect(greenwich?.beds).toBe(2);
    expect(greenwich?.baths).toBe(1);
  });
});
