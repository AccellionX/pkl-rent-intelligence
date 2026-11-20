import { describe, expect, it } from "vitest";
import {
  assertReportStatusTransition,
  canTransitionReportStatus,
} from "@/domain/report-status";

describe("report completion path", () => {
  it("requires waiting_on_review before sent", () => {
    expect(canTransitionReportStatus("in_progress", "sent")).toBe(false);
    expect(canTransitionReportStatus("in_progress", "waiting_on_review")).toBe(true);
    expect(canTransitionReportStatus("waiting_on_review", "sent")).toBe(true);
    expect(() => assertReportStatusTransition("in_progress", "sent")).toThrow(
      /Invalid report status transition/,
    );
  });
});
