import { describe, expect, it } from "vitest";
import {
  classifyListingUrl,
  extractListingUrlsFromText,
  extractWebsiteFromBlock,
  mergeExternalLinksPreserveStaff,
  normalizeListingUrl,
} from "@/lib/extraction/listing-links";

describe("listing-links extraction", () => {
  it("normalizes bare domains and full URLs", () => {
    expect(normalizeListingUrl("pilgrimpark.com")).toBe("https://pilgrimpark.com");
    expect(normalizeListingUrl("https://www.zillow.com/apartments/x/")).toBe(
      "https://www.zillow.com/apartments/x",
    );
    expect(normalizeListingUrl("mailto:sales@rentometer.com")).toBeNull();
    expect(normalizeListingUrl("javascript:void(0)")).toBeNull();
  });

  it("ignores vendor chrome and keeps listing hosts", () => {
    const links = extractListingUrlsFromText(
      [
        "https://www.rentometer.com/",
        "https://www.hellodata.ai/?utm=1",
        "https://maps.google.com/maps?ll=1,2",
        "https://www.zillow.com/apartments/west-warwick-ri/855/",
        "https://www.apartments.com/villa-del-rio/",
        "villadelrioapartments.com",
      ].join("\n"),
    );
    expect(links.zillow).toContain("zillow.com");
    expect(links.apartments).toContain("apartments.com");
    expect(links.websites.some((u) => u.includes("villadelrioapartments.com"))).toBe(
      true,
    );
    expect(links.all.every((u) => classifyListingUrl(u) !== "ignored")).toBe(true);
  });

  it("extracts a website from a single-line HelloData card block", () => {
    const block = ["Pilgrim Park (2.74 mi)", "135 Pilgrim Avenue", "pilgrimpark.com", "2 bed $1800"].join(
      "\n",
    );
    expect(extractWebsiteFromBlock(block)).toBe("https://pilgrimpark.com");
  });

  it("never overwrites staff listing links", () => {
    const { next, changed } = mergeExternalLinksPreserveStaff(
      { zillow: "https://www.zillow.com/staff-entered" },
      {
        all: ["https://www.zillow.com/from-file", "https://example-site.com"],
        zillow: "https://www.zillow.com/from-file",
        apartments: null,
        websites: ["https://example-site.com"],
      },
    );
    expect(next.zillow).toBe("https://www.zillow.com/staff-entered");
    expect(next.website).toBe("https://example-site.com");
    expect(changed).toBe(true);
  });
});
