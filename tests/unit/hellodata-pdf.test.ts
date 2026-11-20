import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHelloDataPdfText } from "@/lib/extraction/hellodata-pdf";

const fixture = readFileSync(
  resolve(__dirname, "../fixtures/hellodata/synthetic-rent-comps.txt"),
  "utf8",
);

describe("HelloData PDF text parser", () => {
  it("extracts subject meta, comps, and market metrics from synthetic layout", () => {
    const parsed = parseHelloDataPdfText(fixture);

    expect(parsed.kind).toBe("hellodata_pdf");
    expect(parsed.reportDate).toBe("11/08/2026");
    expect(parsed.subjectName).toMatch(/Bold Point/i);
    expect(parsed.buildings.some((b) => b.isSubject)).toBe(true);
    expect(parsed.comparableBuildings.length).toBeGreaterThanOrEqual(2);

    const subject = parsed.buildings.find((b) => b.isSubject)!;
    expect(subject.unitTypes.some((u) => u.beds === 1 && u.rent === 2146)).toBe(
      true,
    );

    const harbor = parsed.comparableBuildings.find((b) =>
      /Harbor View Apartments/i.test(b.name),
    );
    expect(harbor).toBeTruthy();
    expect(harbor!.name).toBe("Harbor View Apartments");
    expect(harbor!.distanceMiles).toBe(0.8);
    const missing2br = harbor!.unitTypes.find((u) => /2\s*BR/i.test(u.unitTypeLabel));
    expect(missing2br?.available).toBe(false);
    expect(missing2br?.flags.some((f) => /No 2 BR available/i.test(f.message))).toBe(
      true,
    );

    expect(parsed.marketMetrics.length).toBeGreaterThanOrEqual(1);
    const oneBrMarket = parsed.marketMetrics.find((m) => m.beds === 1);
    expect(oneBrMarket?.daysOnMarket).toBe(48);
    expect(oneBrMarket?.scope).toBe("market_trailing_1_month");
  });

  it("never treats subject as a comparable building", () => {
    const parsed = parseHelloDataPdfText(fixture);
    expect(parsed.comparableBuildings.every((b) => !b.isSubject)).toBe(true);
  });
});
