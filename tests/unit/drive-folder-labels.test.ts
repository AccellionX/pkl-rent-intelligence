import { describe, expect, it } from "vitest";
import {
  driveFolderStatusSummary,
  isDriveFolderMissingReason,
  labelDriveBackupBlocker,
  labelDriveFolderStatus,
} from "@/lib/ui/drive-folder-labels";

describe("drive folder labels", () => {
  it("labels assigned and unassigned folders for staff", () => {
    expect(labelDriveFolderStatus(false)).toBe("Not set up yet");
    expect(labelDriveFolderStatus(true, "Oak Street")).toBe("Oak Street");
    expect(driveFolderStatusSummary(false)).toMatch(/still be finalized/i);
    expect(driveFolderStatusSummary(true)).toMatch(/automatically/i);
  });

  it("maps backup blockers to plain language", () => {
    expect(labelDriveBackupBlocker("Assign a Google Drive folder to this property first.")).toBe(
      "Choose a Google Drive folder for this property first.",
    );
    expect(labelDriveBackupBlocker("Store the final PDF before saving to Drive.")).toMatch(
      /Store the final PDF/i,
    );
  });

  it("detects missing-folder skip reasons", () => {
    expect(isDriveFolderMissingReason("No Google Drive folder assigned to this property.")).toBe(
      true,
    );
    expect(isDriveFolderMissingReason("Final PDF is not stored yet.")).toBe(false);
  });
});
