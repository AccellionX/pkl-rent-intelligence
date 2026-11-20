import { describe, expect, it } from "vitest";
import {
  describeDocumentUploadScope,
  isDraftReportStatus,
  isFinalizedReportStatus,
  labelDocumentUploadScope,
  localDateIso,
  resolveReportWorkspaceMode,
  resolveUploadWorkspaceMode,
  suggestedReportingPeriod,
} from "@/lib/reports/report-entry";
import { hrefForReportStep } from "@/lib/reports/guided-workflow";
import { labelDocumentCenterStatus } from "@/lib/ui/status-labels";

describe("report entry helpers", () => {
  it("uses local calendar dates for suggested periods", () => {
    const noon = new Date(2026, 10, 19, 12, 0, 0); // Nov 19 local
    const period = suggestedReportingPeriod(noon);
    expect(period.end).toBe("2026-11-19");
    expect(period.start).toBe("2026-11-12");
    expect(localDateIso(noon)).toBe("2026-11-19");
  });

  it("classifies draft vs finalized statuses", () => {
    expect(isDraftReportStatus("in_progress")).toBe(true);
    expect(isDraftReportStatus("waiting_on_review")).toBe(true);
    expect(isFinalizedReportStatus("sent")).toBe(true);
    expect(isFinalizedReportStatus("saved_to_drive")).toBe(true);
    expect(isDraftReportStatus("saved_to_drive")).toBe(false);
  });

  it("keeps loading and hub modes away from download UI", () => {
    expect(
      resolveReportWorkspaceMode({
        loading: true,
        error: null,
        urlReportId: null,
        step: null,
        draftCount: 0,
        reportCount: 0,
      }),
    ).toBe("loading");

    expect(
      resolveReportWorkspaceMode({
        loading: false,
        error: null,
        urlReportId: null,
        step: null,
        draftCount: 1,
        reportCount: 1,
      }),
    ).toBe("hub_pick_draft");

    expect(
      resolveReportWorkspaceMode({
        loading: false,
        error: null,
        urlReportId: "r1",
        step: "download",
        draftCount: 1,
        reportCount: 1,
      }),
    ).toBe("guided_download");
  });

  it("builds guided Step 1 upload href after create", () => {
    const href = hrefForReportStep({
      propertyId: "p1",
      stepId: "upload",
      reportRunId: "r1",
      unitTypeId: "u1",
    });
    expect(href).toContain("/upload?");
    expect(href).toContain("buildingId=p1");
    expect(href).toContain("reportId=r1");
    expect(href).toContain("unitTypeId=u1");
    expect(href).toContain("step=upload");
  });

  it("keeps general Data Uploads separate from guided Step 1", () => {
    expect(resolveUploadWorkspaceMode({ urlReportId: null })).toBe("general");
    expect(resolveUploadWorkspaceMode({ urlReportId: "" })).toBe("general");
    expect(resolveUploadWorkspaceMode({ urlReportId: "r1" })).toBe("guided");
    expect(
      resolveUploadWorkspaceMode({ urlReportId: "r1", guidedLoading: true }),
    ).toBe("guided_loading");
  });

  it("labels property vs report document scopes", () => {
    expect(
      labelDocumentUploadScope({
        documentReportRunId: null,
        activeReportRunId: "r1",
      }),
    ).toBe("property");
    expect(
      labelDocumentUploadScope({
        documentReportRunId: "r1",
        activeReportRunId: "r1",
      }),
    ).toBe("current_report");
    expect(
      labelDocumentUploadScope({
        documentReportRunId: "r2",
        activeReportRunId: "r1",
      }),
    ).toBe("other_report");
    expect(
      describeDocumentUploadScope({
        scope: "property",
      }),
    ).toMatch(/Property library/i);
  });

  it("marks Ready for review only when pending rows remain", () => {
    expect(
      labelDocumentCenterStatus({
        parseStatus: "needs_review",
        remainingReviewCount: 3,
      }),
    ).toBe("Ready for review");
    expect(
      labelDocumentCenterStatus({
        parseStatus: "needs_review",
        remainingReviewCount: 0,
      }),
    ).toBe("Reviewed");
    expect(
      labelDocumentCenterStatus({
        parseStatus: "parsed",
        remainingReviewCount: 0,
      }),
    ).toBe("Reviewed");
  });
});
