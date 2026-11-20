import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseHelloDataPdfBuffer } from "@/lib/extraction/hellodata-pdf";

import { CLIENT_REL, resolveClientPath } from "../helpers/client-source-paths";

const REAL_855_HD =
  resolveClientPath("PKL_HELLODATA_855_PDF", ...CLIENT_REL.hellodata855Pdf) ?? "";

const REAL_VETS_HD =
  resolveClientPath("PKL_HELLODATA_VETS_PDF", ...CLIENT_REL.hellodataVeteransPdf) ?? "";

describe("HelloData real PDF regression (local files only)", () => {
  it("parses 855 Providence HelloData when present", async () => {
    if (!existsSync(REAL_855_HD)) {
      console.warn("SKIP: 855 HelloData PDF not found at", REAL_855_HD);
      return;
    }
    const bytes = new Uint8Array(readFileSync(REAL_855_HD));
    const parsed = await parseHelloDataPdfBuffer({
      filename: "855_Providence_St_-11-14-2026.pdf",
      bytes,
    });
    expect(parsed.reportDate).toBe("11/14/2026");
    expect(parsed.subjectName).toMatch(/855 Providence/i);
    expect(parsed.buildings.some((b) => b.isSubject)).toBe(true);
    expect(parsed.comparableBuildings.length).toBe(18);
    expect(parsed.comparableBuildings.every((b) => !b.isSubject)).toBe(true);
    expect(parsed.marketMetrics.some((m) => m.beds === 2 && m.askingRent === 2152)).toBe(
      true,
    );
    const with2br = parsed.comparableBuildings.filter((b) =>
      b.unitTypes.some((u) => u.beds === 2 && u.available && u.rent != null),
    );
    expect(with2br.length).toBe(10);
  });

  it("parses 30 Veterans HelloData when present", async () => {
    if (!existsSync(REAL_VETS_HD)) {
      console.warn("SKIP: Veterans HelloData PDF not found at", REAL_VETS_HD);
      return;
    }
    const bytes = new Uint8Array(readFileSync(REAL_VETS_HD));
    const parsed = await parseHelloDataPdfBuffer({
      filename: "06 HelloData report 11-08-2026.pdf",
      bytes,
    });
    expect(parsed.reportDate).toBe("11/8/2026");
    expect(parsed.subjectName).toMatch(/Bold Point/i);
    expect(parsed.comparableBuildings).toHaveLength(4);
    const kettle = parsed.comparableBuildings.find((b) => /Kettle Point/i.test(b.name));
    expect(kettle?.unitTypes.find((u) => u.beds === 1)?.rent).toBe(2326);
    expect(parsed.marketMetrics.find((m) => m.beds === 1)?.daysOnMarket).toBe(48);
  });
});
