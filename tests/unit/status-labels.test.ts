import { describe, expect, it } from "vitest";
import {
  labelAssemblyStatus,
  labelDriveConnection,
  labelMatchQuality,
  labelNarrativeStatus,
  labelParseStatus,
  labelReportStatus,
  labelReviewStatus,
  labelSourceType,
  labelTier,
  labelUnitStatus,
} from "@/lib/ui/status-labels";

describe("status labels", () => {
  it("maps report statuses to business-friendly copy", () => {
    expect(labelReportStatus("waiting_on_review")).toBe("Ready for review");
    expect(labelReportStatus("sent")).toBe("Completed");
    expect(labelReportStatus("saved_to_drive")).toBe("Saved to Google Drive");
    expect(labelReportStatus("in_progress")).toBe("In progress");
  });

  it("maps unit and narrative enums", () => {
    expect(labelUnitStatus("available")).toBe("Available");
    expect(labelNarrativeStatus("stale")).toBe("Needs refresh");
    expect(labelAssemblyStatus("blocked_conflicts")).toBe("Needs attention");
  });

  it("maps review, source, tier, and match quality without raw enums", () => {
    expect(labelReviewStatus("pending")).toBe("Needs attention");
    expect(labelSourceType("rentometer")).toBe("Rentometer");
    expect(labelSourceType("mls")).toBe("MLS");
    expect(labelTier("primary")).toBe("Primary");
    expect(labelMatchQuality("exact")).toBe("Exact match");
  });

  it("maps parse and Drive connection labels", () => {
    expect(labelParseStatus("parsing")).toBe("Processing");
    expect(labelParseStatus("failed")).toBe("Unable to process");
    expect(labelDriveConnection("connected")).toBe("Connected");
    expect(labelDriveConnection("not_connected")).toBe("Not connected");
  });

  it("title-cases unknown values instead of exposing snake_case", () => {
    expect(labelReportStatus("custom_status")).toBe("Custom Status");
  });
});
