import { describe, expect, it } from "vitest";
import {
  DOCUMENT_SLOTS,
  resolveSourceTypeForSlot,
  slotIdForSourceType,
  summarizeSlotUploads,
} from "@/lib/uploads/document-slots";

describe("document slots", () => {
  it("defines six weekly document slots", () => {
    expect(DOCUMENT_SLOTS).toHaveLength(6);
    expect(DOCUMENT_SLOTS.map((s) => s.id)).toEqual([
      "rentometer",
      "hellodata",
      "mls_ri",
      "mls_ct",
      "zillow",
      "apartments",
    ]);
  });

  it("maps Rentometer files by extension", () => {
    expect(resolveSourceTypeForSlot("rentometer", "comps.csv")).toBe("rentometer_csv");
    expect(resolveSourceTypeForSlot("rentometer", "comps.XLSX")).toBe("rentometer_xlsx");
    expect(resolveSourceTypeForSlot("rentometer", "comps.pdf")).toBe("rentometer_pdf");
  });

  it("keeps fixed source types for non-Rentometer slots", () => {
    expect(resolveSourceTypeForSlot("hellodata", "market.pdf")).toBe("hellodata_pdf");
    expect(resolveSourceTypeForSlot("zillow", "leads.xlsx")).toBe("zillow_xlsx");
  });

  it("maps source types back to slot ids", () => {
    expect(slotIdForSourceType("mls_ri_pdf")).toBe("mls_ri");
    expect(slotIdForSourceType("rentometer_xlsx")).toBe("rentometer");
    expect(slotIdForSourceType("unknown")).toBeNull();
  });

  it("marks slots uploaded from the latest matching document", () => {
    const summary = summarizeSlotUploads({
      reportRunId: "report-1",
      documents: [
        {
          id: "d1",
          originalFilename: "rent.csv",
          sourceType: "rentometer_csv",
          parseStatus: "parsed",
          reportRunId: "report-1",
          uploadedAt: "2026-01-02T00:00:00.000Z",
        },
        {
          id: "d2",
          originalFilename: "old-hello.pdf",
          sourceType: "hellodata_pdf",
          parseStatus: "parsed",
          reportRunId: null,
          uploadedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "d3",
          originalFilename: "bad-zillow.xlsx",
          sourceType: "zillow_xlsx",
          parseStatus: "failed",
          reportRunId: "report-1",
          uploadedAt: "2026-01-03T00:00:00.000Z",
        },
      ],
    });

    const byId = Object.fromEntries(summary.map((s) => [s.slotId, s]));
    expect(byId.rentometer?.uploaded).toBe(true);
    expect(byId.rentometer?.document?.id).toBe("d1");
    expect(byId.hellodata?.uploaded).toBe(true);
    expect(byId.hellodata?.document?.id).toBe("d2");
    expect(byId.zillow?.uploaded).toBe(false);
    expect(byId.zillow?.failed).toBe(true);
    expect(byId.apartments?.uploaded).toBe(false);
  });

  it("prefers report-scoped docs over other reports when report is active", () => {
    const summary = summarizeSlotUploads({
      reportRunId: "report-1",
      documents: [
        {
          id: "other",
          originalFilename: "other-period.xlsx",
          sourceType: "apartments_xlsx",
          parseStatus: "parsed",
          reportRunId: "report-2",
          uploadedAt: "2026-02-01T00:00:00.000Z",
        },
        {
          id: "mine",
          originalFilename: "this-period.xlsx",
          sourceType: "apartments_xlsx",
          parseStatus: "parsed",
          reportRunId: "report-1",
          uploadedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(summary.find((s) => s.slotId === "apartments")?.document?.id).toBe("mine");
  });
});
