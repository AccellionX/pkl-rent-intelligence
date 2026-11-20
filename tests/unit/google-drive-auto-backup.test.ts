import { beforeEach, describe, expect, it, vi } from "vitest";

describe("attemptAutomaticDriveBackup", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.GOOGLE_DRIVE_CLIENT_ID;
    delete process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  });

  it("skips when Drive credentials are missing", async () => {
    const { attemptAutomaticDriveBackup } = await import("@/lib/google-drive/auto-backup");
    const outcome = await attemptAutomaticDriveBackup({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: {} as any,
      reportId: "r1",
    });
    expect(outcome.attempted).toBe(false);
    if (!outcome.attempted) {
      expect(outcome.reason).toMatch(/not connected/i);
    }
  });

  it("skips when report is not completed", async () => {
    process.env.GOOGLE_DRIVE_CLIENT_ID = "cid";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "sec";
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = "tok";

    const supabase = {
      from(table: string) {
        if (table === "report_runs") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "r1", status: "waiting_on_review", property_id: "p1" },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              order: () => ({ limit: async () => ({ data: [], error: null }) }),
            }),
          }),
        };
      },
    };

    const { attemptAutomaticDriveBackup } = await import("@/lib/google-drive/auto-backup");
    const { resetGoogleDrivePortForTests } = await import("@/lib/google-drive/client");
    resetGoogleDrivePortForTests();

    const outcome = await attemptAutomaticDriveBackup({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      reportId: "r1",
    });
    expect(outcome.attempted).toBe(false);
    if (!outcome.attempted) {
      expect(outcome.reason).toMatch(/completed/i);
    }
  });
});
