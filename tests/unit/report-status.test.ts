import { describe, expect, it } from "vitest";
import {
  assertReportStatusTransition,
  canTransitionReportStatus,
  listAllowedReportTransitions,
} from "@/domain/report-status";

describe("report status transitions", () => {
  it("allows the Phase 1 happy path", () => {
    expect(canTransitionReportStatus("in_progress", "waiting_on_review")).toBe(true);
    expect(canTransitionReportStatus("waiting_on_review", "sent")).toBe(true);
    expect(canTransitionReportStatus("sent", "saved_to_drive")).toBe(true);
  });

  it("allows returning from review to in progress", () => {
    expect(canTransitionReportStatus("waiting_on_review", "in_progress")).toBe(true);
  });

  it("blocks invalid and terminal transitions", () => {
    expect(canTransitionReportStatus("in_progress", "sent")).toBe(false);
    expect(canTransitionReportStatus("in_progress", "saved_to_drive")).toBe(false);
    expect(canTransitionReportStatus("saved_to_drive", "in_progress")).toBe(false);
    expect(canTransitionReportStatus("sent", "waiting_on_review")).toBe(false);
  });

  it("lists allowed targets", () => {
    expect(listAllowedReportTransitions("sent")).toEqual(["saved_to_drive"]);
    expect(listAllowedReportTransitions("saved_to_drive")).toEqual([]);
  });

  it("throws on assert for invalid transition", () => {
    expect(() =>
      assertReportStatusTransition("in_progress", "saved_to_drive"),
    ).toThrow(/Invalid report status transition/);
  });
});
