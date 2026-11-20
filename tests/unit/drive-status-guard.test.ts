import { describe, expect, it } from "vitest";

/** Mirrors LivePdfReports stale-response guard for Drive status. */
function mergeDriveStatus(
  prev: { reportStatus: string } | null,
  next: { reportStatus: string },
  driveSaving: boolean,
) {
  if (
    prev?.reportStatus === "saved_to_drive" &&
    next.reportStatus !== "saved_to_drive" &&
    !driveSaving
  ) {
    return prev;
  }
  return next;
}

describe("drive status stale guard", () => {
  it("does not let an older in-progress response overwrite saved_to_drive", () => {
    const prev = { reportStatus: "saved_to_drive" };
    const next = { reportStatus: "sent" };
    expect(mergeDriveStatus(prev, next, false)).toEqual(prev);
  });

  it("allows updates while a save is in flight", () => {
    const prev = { reportStatus: "saved_to_drive" };
    const next = { reportStatus: "sent" };
    expect(mergeDriveStatus(prev, next, true)).toEqual(next);
  });

  it("accepts confirmed saved_to_drive", () => {
    const prev = { reportStatus: "sent" };
    const next = { reportStatus: "saved_to_drive" };
    expect(mergeDriveStatus(prev, next, false)).toEqual(next);
  });
});
