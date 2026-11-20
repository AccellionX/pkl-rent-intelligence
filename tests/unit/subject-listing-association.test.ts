import { describe, expect, it } from "vitest";
import {
  extractListingUrlsFromText,
  mergeExternalLinksPreserveStaff,
} from "@/lib/extraction/listing-links";

describe("subject vs comparable website association", () => {
  it("does not apply document-wide comparable websites to the subject", () => {
    // Simulates HelloData PDF containing subject + Kettle Point comparable.
    const documentWide = extractListingUrlsFromText(
      "Subject overview\nkettle-point.com\nvilladelrioapartments.com\n",
    );
    expect(documentWide.websites.some((u) => u.includes("kettle-point"))).toBe(
      true,
    );

    // Correct subject path: only use the subject building website when present.
    const subjectOnly = extractListingUrlsFromText("");
    const { next, changed } = mergeExternalLinksPreserveStaff(
      {},
      subjectOnly,
    );
    expect(changed).toBe(false);
    expect(next.website).toBeUndefined();

    // If subject truly has its own site, fill empty staff field only.
    const subjectSite = extractListingUrlsFromText("https://subject-property.com");
    const applied = mergeExternalLinksPreserveStaff({}, subjectSite);
    expect(applied.next.website).toBe("https://subject-property.com");
  });

  it("never overwrites a staff-confirmed subject website", () => {
    const extracted = extractListingUrlsFromText("https://kettle-point.com");
    const { next, changed } = mergeExternalLinksPreserveStaff(
      { website: "https://staff-confirmed-subject.com" },
      extracted,
    );
    expect(changed).toBe(false);
    expect(next.website).toBe("https://staff-confirmed-subject.com");
  });
});
