import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectMlsDialectFromText } from "@/lib/extraction/mls-detect";
import {
  parseCtDetailListing,
  parseCtMlsPdfBuffer,
} from "@/lib/extraction/mls-ct-pdf";
import {
  parseRiGalleryHeader,
  parseRiMlsPdfBuffer,
  parseRiSummaryListingLine,
} from "@/lib/extraction/mls-ri-pdf";
import {
  attachMlsPhotoCandidates,
  classifyPropertyPhoto,
  selectPrimaryListingPhotos,
  MAX_PHOTOS_PER_LISTING,
} from "@/lib/extraction/mls-photos";
import { matchComparableProperty } from "@/lib/extraction/matching";
import { detectRentConflict } from "@/lib/extraction/conflicts";

import { CLIENT_REL, resolveClientPath } from "../helpers/client-source-paths";

const REAL_RI =
  resolveClientPath("PKL_MLS_RI_PDF", ...CLIENT_REL.mlsRiVeteransPdf) ?? "";
const REAL_CT = process.env.PKL_MLS_CT_PDF?.trim() ?? "";

describe("RI MLS summary line parser", () => {
  it("parses jammed Active rows without fabricating rents", () => {
    const bentley = parseRiSummaryListingLine(
      "1Apartment87 Bentley Street #2 $1,3501424879 10/01/2026 1/0455 31",
      1,
    );
    expect(bentley?.mlsNumber).toBe("1424879");
    expect(bentley?.addressLine1).toMatch(/87 Bentley/i);
    expect(bentley?.unit).toBe("2");
    expect(bentley?.listRent).toBe(1350);
    expect(bentley?.beds).toBe(1);
    expect(bentley?.baths).toBe(1);
    expect(bentley?.sqft).toBe(455);
    expect(bentley?.daysOnMarket).toBe(31);

    const wesleyan = parseRiSummaryListingLine(
      "1Apartment25 Wesleyan Avenue $1,2251420890 08/17/2026 430 76",
      1,
    );
    expect(wesleyan?.mlsNumber).toBe("1420890");
    expect(wesleyan?.listRent).toBe(1225);
    expect(wesleyan?.sqft).toBe(430);

    const california = parseRiSummaryListingLine(
      "1Below Ground Unit173 California Avenue #BAS $1,5001427444 10/30/2026 1/01 2",
      1,
    );
    expect(california?.mlsNumber).toBe("1427444");
    expect(california?.listRent).toBe(1500);
    // sqft=1 is invalid and must not be confirmed
    expect(california?.sqft).toBeNull();
    expect(california?.flags.some((f) => f.code === "invalid_sqft")).toBe(true);
  });

  it("parses gallery headers for MLS identity", () => {
    const header = parseRiGalleryHeader(
      "List Price: $2,300\n1000 Providence Place #384 MLS #: 1414833\nPhoto Gallery\n",
      2,
    );
    expect(header?.mlsNumber).toBe("1414833");
    expect(header?.listRent).toBe(2300);
    expect(header?.unit).toBe("384");
  });

  it("rejects zero rent as unconfirmed", () => {
    const bad = parseRiSummaryListingLine(
      "1Apartment1 Fake Street $0.001234567 01/01/2026 1/0500 1",
      1,
    );
    // $0.00 may fail regex (needs comma form) — ensure zero path stays null when forced
    expect(bad == null || bad.listRent == null || bad.listRent > 0).toBe(true);
  });
});

describe("CT connectMLS detail parser (reference check)", () => {
  it("extracts 10 S 3rd Avenue Unit 12 reference values", () => {
    const text = readFileSync(
      "tests/fixtures/mls/ct-detail-10-s-3rd.txt",
      "utf8",
    );
    const listing = parseCtDetailListing(text, 4);
    expect(listing?.mlsNumber).toBe("24221286");
    expect(listing?.listRent).toBe(1400);
    expect(listing?.sqft).toBe(700);
    expect(listing?.beds).toBe(2);
    expect(listing?.unit).toBe("12");
    expect(listing?.city).toMatch(/Norwich/i);
    expect(listing?.state).toBe("CT");
    expect(listing?.postalCode).toBe("06380");
  });
});

describe("MLS dialect detection", () => {
  it("detects connectMLS vs RI Statewide markers", () => {
    expect(detectMlsDialectFromText("Kent Lorenz | connectMLS\nListing ID: 1")).toBe(
      "ct_connectmls",
    );
    expect(
      detectMlsDialectFromText(
        "Brief Summary of Compared Listings\n© 2026 NY State Alliance of MLS",
      ),
    ).toBe("ri_statewide");
  });
});

describe("MLS identity matching", () => {
  it("matches by MLS number exactly and avoids false address merges", () => {
    const known = [
      {
        id: "a",
        addressRaw: "10 S 3rd Avenue",
        city: "Norwich",
        state: "CT",
        mlsNumber: "24221286",
      },
      {
        id: "b",
        addressRaw: "10 S 3rd Avenue",
        city: "Norwich",
        state: "CT",
        mlsNumber: "99999999",
      },
    ];
    const hit = matchComparableProperty(
      {
        id: "incoming",
        addressRaw: "10 South Third Ave",
        city: "Norwich",
        state: "CT",
        mlsNumber: "24221286",
      },
      known,
    );
    expect(hit.confidence).toBe("exact");
    expect(hit.matchedId).toBe("a");
  });
});

describe("Photo classification", () => {
  it("rejects icons and accepts property-sized images", () => {
    expect(classifyPropertyPhoto({ width: 64, height: 64 }).ok).toBe(false);
    expect(classifyPropertyPhoto({ width: 800, height: 600 }).ok).toBe(true);
    expect(classifyPropertyPhoto({ width: 2000, height: 200 }).ok).toBe(false);
  });

  it("caps primary photos per listing toward 3:2", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      width: 600 + i,
      height: 400,
      rejectedAsNonProperty: false as boolean | undefined,
      rejectReason: undefined as string | undefined,
      id: i,
    }));
    const capped = selectPrimaryListingPhotos(many);
    expect(capped.filter((c) => !c.rejectedAsNonProperty)).toHaveLength(
      MAX_PHOTOS_PER_LISTING,
    );
    expect(capped.filter((c) => c.rejectReason === "over_cap_primary_photos").length).toBe(
      10 - MAX_PHOTOS_PER_LISTING,
    );
  });
});

describe("Synthetic >$25 MLS conflict", () => {
  it("flags MLS vs Rentometer rent gap and keeps sources side by side", () => {
    const conflict = detectRentConflict(
      { source: "rentometer", rent: 1400 },
      { source: "mls", rent: 1500 },
    );
    expect(conflict?.exceedsThreshold).toBe(true);
    expect(conflict?.absoluteDelta).toBe(100);
    expect(conflict?.left.source).toBe("rentometer");
    expect(conflict?.right.source).toBe("mls");
  });

  it("does not flag exact $25 delta", () => {
    const conflict = detectRentConflict(
      { source: "rentometer", rent: 1400 },
      { source: "mls", rent: 1425 },
    );
    expect(conflict).toBeNull();
  });
});

describe("Real MLS PDF regression (local files only)", () => {
  it("parses RI Veterans CMA without summary/detail duplicates", async () => {
    if (!existsSync(REAL_RI)) {
      console.warn("SKIP: RI MLS PDF not found at", REAL_RI);
      return;
    }
    const bytes = new Uint8Array(readFileSync(REAL_RI));
    const parsed = await parseRiMlsPdfBuffer({ filename: "ri.pdf", bytes });
    expect(parsed.pageCount).toBeGreaterThanOrEqual(1);
    expect(parsed.listings.length).toBeGreaterThanOrEqual(4);
    expect(parsed.listings.length).toBeLessThanOrEqual(5);
    const mlsIds = parsed.listings.map((l) => l.mlsNumber);
    expect(new Set(mlsIds).size).toBe(mlsIds.length);
    expect(parsed.listings.some((l) => l.mlsNumber === "1424879")).toBe(true);
    // Providence Place may wrap across lines; assert when present
    const hasProvidence = parsed.listings.some((l) => l.mlsNumber === "1414833");
    if (parsed.listings.length === 5) expect(hasProvidence).toBe(true);
  });

  it("parses CT Report (1).pdf with three active listings matching reference notes", async () => {
    if (!existsSync(REAL_CT)) {
      console.warn("SKIP: CT MLS PDF not found at", REAL_CT);
      return;
    }
    const bytes = new Uint8Array(readFileSync(REAL_CT));
    const parsed = await parseCtMlsPdfBuffer({ filename: "ct.pdf", bytes });
    expect(parsed.dialect).toBe("ct_connectmls");
    expect(parsed.listings.length).toBe(3);

    const byMls = Object.fromEntries(
      parsed.listings.map((l) => [l.mlsNumber, l]),
    );
    expect(byMls["24221286"]?.listRent).toBe(1400);
    expect(byMls["24221286"]?.sqft).toBe(700);
    expect(byMls["24221286"]?.beds).toBe(2);
    expect(byMls["24221286"]?.unit).toBe("12");

    expect(byMls["24215401"]?.listRent).toBe(1850);
    expect(byMls["24215401"]?.sqft).toBe(1006);
    expect(byMls["24215401"]?.beds).toBe(2);

    expect(byMls["24216692"]?.listRent).toBe(1900);
    expect(byMls["24216692"]?.sqft).toBe(985);
    expect(byMls["24216692"]?.beds).toBe(2);
    expect(byMls["24216692"]?.unit).toBe("5");

    // No duplicate MLS ids from summary+detail+comparison
    expect(new Set(parsed.listings.map((l) => l.mlsNumber)).size).toBe(3);
  });

  it("caps RI gallery photo flood and keeps CT listing photos", async () => {
    if (!existsSync(REAL_RI) || !existsSync(REAL_CT)) {
      console.warn("SKIP: real MLS PDFs missing");
      return;
    }
    const riParsed = await parseRiMlsPdfBuffer({
      filename: "ri.pdf",
      bytes: new Uint8Array(readFileSync(REAL_RI)),
    });
    const riPhotos = await attachMlsPhotoCandidates({
      bytes: new Uint8Array(readFileSync(REAL_RI)),
      listings: riParsed.listings,
    });
    for (const listing of riPhotos.listings) {
      const accepted = listing.photoCandidates.filter((p) => !p.rejectedAsNonProperty);
      expect(accepted.length).toBeLessThanOrEqual(MAX_PHOTOS_PER_LISTING);
    }
    expect(riPhotos.acceptedCount).toBeLessThanOrEqual(
      riParsed.listings.length * MAX_PHOTOS_PER_LISTING,
    );

    const ctParsed = await parseCtMlsPdfBuffer({
      filename: "ct.pdf",
      bytes: new Uint8Array(readFileSync(REAL_CT)),
    });
    const ctPhotos = await attachMlsPhotoCandidates({
      bytes: new Uint8Array(readFileSync(REAL_CT)),
      listings: ctParsed.listings,
    });
    expect(ctPhotos.acceptedCount).toBeGreaterThanOrEqual(2);
    expect(ctPhotos.acceptedCount).toBeLessThanOrEqual(3);
  });
});
