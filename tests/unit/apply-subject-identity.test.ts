import { describe, expect, it } from "vitest";
import { mergeExternalLinksPreserveStaff } from "@/lib/extraction/listing-links";
import { normalizeAddress } from "@/lib/extraction/normalize";

describe("subject identity fill rules", () => {
  it("normalizes HelloData-style subject addresses without inventing streets", () => {
    const addr = normalizeAddress("855 Providence Street, West Warwick, RI 02893");
    expect(addr?.line1?.toLowerCase()).toContain("providence");
    expect(addr?.city).toMatch(/West Warwick/i);
    expect(addr?.state).toBe("RI");
    expect(addr?.postalCode).toBe("02893");
  });

  it("only adds missing external link keys", () => {
    const { next, changed } = mergeExternalLinksPreserveStaff(
      { apartments: "https://www.apartments.com/existing/" },
      {
        all: [
          "https://www.zillow.com/new",
          "https://www.apartments.com/from-file",
          "https://property-site.com",
        ],
        zillow: "https://www.zillow.com/new",
        apartments: "https://www.apartments.com/from-file",
        websites: ["https://property-site.com"],
      },
    );
    expect(changed).toBe(true);
    expect(next.apartments).toBe("https://www.apartments.com/existing/");
    expect(next.zillow).toBe("https://www.zillow.com/new");
    expect(next.website).toBe("https://property-site.com");
  });
});
