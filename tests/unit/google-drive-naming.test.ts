import { describe, expect, it } from "vitest";
import { parseDriveFolderId } from "@/lib/google-drive/folder-id";
import {
  buildFinalizedDriveFileName,
  buildPropertyFolderName,
  sanitizeDriveNamePart,
} from "@/lib/google-drive/naming";
import { mapGoogleDriveError } from "@/lib/google-drive/errors";

describe("Drive naming", () => {
  it("sanitizes unsafe characters", () => {
    expect(sanitizeDriveNamePart('855/Providence: "2BR"')).toBe('855 Providence 2BR');
  });

  it("builds finalized file names with property, unit, date, version", () => {
    const name = buildFinalizedDriveFileName({
      propertyName: "Fourteen B Test",
      unitTypeLabel: "2BR",
      periodEnd: "2026-11-18",
      version: 3,
    });
    expect(name).toBe("Fourteen B Test — 2BR — 2026-11-18 — v3.pdf");
  });

  it("includes a short report id so distinct runs do not collide", () => {
    const name = buildFinalizedDriveFileName({
      propertyName: "Fourteen B Test",
      unitTypeLabel: "2BR",
      periodEnd: "2026-11-18",
      version: 1,
      reportId: "13c1aa0e-3c5e-40f1-a1a9-037d96f7e1b7",
    });
    expect(name).toBe("Fourteen B Test — 2BR — 2026-11-18 — v1 — 13c1aa0e.pdf");
  });

  it("builds property folder names without colliding on similar names alone", () => {
    expect(buildPropertyFolderName("Oak", "Providence", "RI")).toBe("Oak (Providence, RI)");
  });
});

describe("parseDriveFolderId", () => {
  it("accepts raw ids and folder URLs", () => {
    expect(parseDriveFolderId("1AbCdEfGhIjKlMnOpQrStUvWxYz")).toBe(
      "1AbCdEfGhIjKlMnOpQrStUvWxYz",
    );
    expect(
      parseDriveFolderId("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz"),
    ).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz");
  });

  it("rejects blank or invalid values", () => {
    expect(parseDriveFolderId("")).toBeNull();
    expect(parseDriveFolderId("not a folder")).toBeNull();
  });
});

describe("mapGoogleDriveError", () => {
  it("maps missing credentials and auth failures to friendly messages", () => {
    expect(mapGoogleDriveError(new Error("GOOGLE_DRIVE_ not configured"), "x").message).toMatch(
      /not connected/i,
    );
    expect(mapGoogleDriveError({ code: 401, message: "invalid_grant" }, "x").message).toMatch(
      /expired|reconnect/i,
    );
    expect(mapGoogleDriveError({ code: 403, message: "forbidden" }, "x").message).toMatch(
      /denied|permission/i,
    );
  });

  it("never returns raw googleapis dumps as the primary message", () => {
    const err = mapGoogleDriveError(
      { code: 500, message: "GaxiosError: Request had invalid authentication credentials." },
      "Could not save the finalized PDF to Google Drive.",
    );
    expect(err.message).not.toMatch(/GaxiosError/i);
  });
});
