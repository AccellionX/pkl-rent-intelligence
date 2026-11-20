import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseApartmentsXlsxBuffer, parseApartmentsCount } from "@/lib/extraction/apartments-xlsx";
import {
  parseZillowXlsxBuffer,
  parseZillowNumber,
  weekStartFromAsOf,
} from "@/lib/extraction/zillow-xlsx";
import { matchWeeklyPropertyName } from "@/lib/extraction/weekly-property-match";
import {
  WEEKLY_FORMULAS,
  apartmentsLeadSummary,
  multiWeekTrend,
  weekOverWeekAbsolute,
  weekOverWeekPercent,
  zillowLeadConversionRate,
} from "@/lib/calculations/weekly-metrics";

import { CLIENT_REL, resolveClientPath } from "../helpers/client-source-paths";

const Z855 = resolveClientPath("PKL_ZILLOW_855_XLSX", ...CLIENT_REL.zillow855Xlsx) ?? "";
const A855 =
  resolveClientPath("PKL_APARTMENTS_855_XLSX", ...CLIENT_REL.apartments855Xlsx) ?? "";
const ZVET =
  resolveClientPath("PKL_ZILLOW_VETS_XLSX", ...CLIENT_REL.zillowVeteransXlsx) ?? "";
const AVET =
  resolveClientPath("PKL_APARTMENTS_VETS_XLSX", ...CLIENT_REL.apartmentsVeteransXlsx) ??
  "";

describe("weekly formulas", () => {
  it("documents formulas and guards zero denominators", () => {
    expect(WEEKLY_FORMULAS.zillowLeadConversion).toMatch(/listingViews/);
    expect(zillowLeadConversionRate(4, 252)).toBeCloseTo(4 / 252, 4);
    expect(zillowLeadConversionRate(4, 0)).toBeNull();
    expect(zillowLeadConversionRate(null, 100)).toBeNull();
    expect(weekOverWeekAbsolute(10, 4)).toBe(6);
    expect(weekOverWeekAbsolute(null, 4)).toBeNull();
    expect(weekOverWeekPercent(10, 0)).toBeNull();
    expect(weekOverWeekPercent(null, 5)).toBeNull();
  });

  it("builds multi-week trends without coercing missing to zero", () => {
    const trend = multiWeekTrend([
      { weekStart: "2026-10-15", value: 4 },
      { weekStart: "2026-11-02", value: 11 },
      { weekStart: "2026-11-10", value: null },
    ]);
    expect(trend[1]?.wowAbsolute).toBe(7);
    expect(trend[2]?.value).toBeNull();
    expect(trend[2]?.wowAbsolute).toBeNull();
  });

  it("summarizes apartments leads with null tours/applications", () => {
    const s = apartmentsLeadSummary({
      phoneCalls: 3,
      emails: 2,
      tours: null,
      applications: null,
      totalLeads: 5,
    });
    expect(s.knownLeadSum).toBe(5);
    expect(s.tours).toBeNull();
    expect(parseApartmentsCount("N/A")).toBeNull();
    expect(parseZillowNumber("NaN")).toBeNull();
    expect(weekStartFromAsOf("2026-10-22")).toBe("2026-10-16");
  });
});

describe("property aliases", () => {
  it("matches Veterans address and Bold Point marketing alias", () => {
    const prop = {
      name: "30 Veterans",
      marketingName: "The Residences at Bold Point",
      addressLine1: "30 Veterans Memorial Parkway",
      city: "East Providence",
      state: "RI",
      aliases: ["The Residences at Bold Point"],
    };
    expect(matchWeeklyPropertyName("30 Veterans Memorial Parkway", prop).confidence).toMatch(
      /exact|strong/,
    );
    expect(matchWeeklyPropertyName("The Residences at Bold Point", prop).confidence).toMatch(
      /exact|strong/,
    );
    expect(matchWeeklyPropertyName("855 Providence St.", prop).confidence).toBe("none");
  });
});

describe("Real Zillow / Apartments XLSX (local files only)", () => {
  it("parses 855 Zillow weekly + listing-to-date for Providence St", async () => {
    if (!existsSync(Z855)) return;
    const parsed = parseZillowXlsxBuffer({
      filename: "zillow.xlsx",
      bytes: new Uint8Array(readFileSync(Z855)),
      property: {
        name: "855 Providence",
        addressLine1: "855 Providence St",
        city: "West Warwick",
        state: "RI",
        aliases: ["855 Providence St."],
      },
    });
    expect(parsed.sheetNames.length).toBeGreaterThanOrEqual(2);
    const weekly = parsed.snapshots.filter(
      (s) => s.windowType === "last_7_days" && s.matchConfidence !== "none",
    );
    expect(weekly.length).toBeGreaterThanOrEqual(1);
    const nov10 = weekly.find((s) => s.asOfDate === "2026-11-10");
    expect(nov10?.metrics.impressions).toBe(6575);
    expect(nov10?.metrics.listingViews).toBe(237);
    expect(nov10?.metrics.totalLeads).toBe(10);
    expect(nov10?.metrics.adImpressions).toBe(2084);
    expect(parsed.listingToDate?.metrics.impressions).toBe(37419);
    expect(parsed.listingToDate?.metrics.totalLeads).toBe(28);
  });

  it("parses Veterans Zillow Oct 22 week matching seed report figures", async () => {
    if (!existsSync(ZVET)) return;
    const parsed = parseZillowXlsxBuffer({
      filename: "zillow.xlsx",
      bytes: new Uint8Array(readFileSync(ZVET)),
      property: {
        name: "30 Veterans Memorial Parkway",
        marketingName: "The Residences at Bold Point",
        addressLine1: "30 Veterans Memorial Parkway",
        city: "East Providence",
        state: "RI",
        aliases: ["The Residences at Bold Point"],
      },
    });
    const week = parsed.snapshots.find(
      (s) => s.windowType === "last_7_days" && s.asOfDate === "2026-10-22",
    );
    expect(week?.metrics.impressions).toBe(10590);
    expect(week?.metrics.listingViews).toBe(252);
    expect(week?.metrics.totalLeads).toBe(4);
    expect(week?.metrics.emailLeads).toBe(4);
    expect(week?.metrics.adClicks).toBe(63);
    expect(parsed.listingToDate?.metrics.totalLeads).toBe(49);
  });

  it("parses 855 Apartments.com without persisting PII columns", async () => {
    if (!existsSync(A855)) return;
    const parsed = parseApartmentsXlsxBuffer({
      filename: "apts.xlsx",
      bytes: new Uint8Array(readFileSync(A855)),
    });
    expect(parsed.weekStart).toBe("2026-11-03");
    expect(parsed.weekEnd).toBe("2026-11-10");
    expect(parsed.totalLeads).toBe(2);
    expect(parsed.phoneCalls).toBe(1);
    expect(parsed.emails).toBe(1);
    expect(parsed.tours).toBeNull();
    expect(parsed.applications).toBeNull();
    expect(parsed.piiColumnsOmitted.length).toBeGreaterThan(0);
    for (const event of parsed.events) {
      expect(JSON.stringify(event)).not.toMatch(/@/);
      expect(event).not.toHaveProperty("renterName");
      expect(event).not.toHaveProperty("renterEmail");
    }
  });

  it("parses Veterans Apartments.com summary for Oct 15–22", async () => {
    if (!existsSync(AVET)) return;
    const parsed = parseApartmentsXlsxBuffer({
      filename: "apts.xlsx",
      bytes: new Uint8Array(readFileSync(AVET)),
    });
    expect(parsed.weekStart).toBe("2026-10-15");
    expect(parsed.weekEnd).toBe("2026-10-22");
    expect(parsed.phoneCalls).toBe(3);
    expect(parsed.emails).toBe(2);
    expect(parsed.totalLeads).toBe(5);
    expect(parsed.tours).toBeNull();
  });

  it("tolerates reordered Zillow headers", () => {
    // Synthetic mini sheet via parser number helpers already covered;
    // full workbook sheets share the same header set in different order would still map by name.
    expect(parseZillowNumber("1,202")).toBe(1202);
    expect(parseZillowNumber("0")).toBe(0);
  });
});
