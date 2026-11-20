import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleDrivePort } from "@/lib/google-drive/types";

const downloadMock = vi.fn();
const fromMock = vi.fn();
const storageFrom = vi.fn(() => ({ download: downloadMock }));

function makeSupabase(handlers: {
  report?: Record<string, unknown> | null;
  property?: Record<string, unknown> | null;
  unitType?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
  updateReport?: (patch: Record<string, unknown>) => void;
  updateSnapshot?: (patch: Record<string, unknown>) => void;
}) {
  return {
    from(table: string) {
      fromMock(table);
      if (table === "report_runs") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: handlers.report ?? null,
                error: null,
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              handlers.updateReport?.(patch);
              return { error: null };
            },
          }),
        };
      }
      if (table === "properties") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: handlers.property ?? null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "unit_types") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: handlers.unitType ?? { label: "2BR" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "report_snapshots") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: handlers.snapshot ? [handlers.snapshot] : [],
                  error: null,
                }),
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              handlers.updateSnapshot?.(patch);
              return { error: null };
            },
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    },
    storage: {
      from: storageFrom,
    },
  };
}

function makeDrivePort(overrides: Partial<GoogleDrivePort> = {}): GoogleDrivePort {
  return {
    getAboutUser: async () => ({ emailAddress: "pkl@example.com" }),
    getFolder: async (id) => ({
      id,
      name: "Property Folder",
      trashed: false,
      webViewLink: `https://drive.google.com/drive/folders/${id}`,
    }),
    listChildFolders: async () => [],
    createFolder: async ({ name, parentId }) => ({
      id: "folder-created",
      name,
      parents: [parentId],
      trashed: false,
    }),
    findFileByAppProperty: async () => null,
    findFileByName: async () => null,
    uploadPdf: async (input) => ({
      id: "file-1",
      name: input.fileName,
      mimeType: "application/pdf",
      size: input.bytes.byteLength,
      md5Checksum: "abc",
      parents: [input.folderId],
      webViewLink: "https://drive.google.com/file/d/file-1/view",
      trashed: false,
      created: true,
      verified: true,
    }),
    getFile: async (id) => ({
      id,
      name: "file.pdf",
      mimeType: "application/pdf",
      size: 100,
      trashed: false,
    }),
    ...overrides,
  };
}

describe("backupFinalizedReportToDrive", () => {
  beforeEach(() => {
    vi.resetModules();
    downloadMock.mockReset();
    fromMock.mockReset();
    storageFrom.mockClear();
  });

  it("rejects draft / non-finalized reports", async () => {
    const { backupFinalizedReportToDrive } = await import("@/lib/google-drive/backup");
    const supabase = makeSupabase({
      report: {
        id: "r1",
        organization_id: "o1",
        property_id: "p1",
        unit_type_id: "u1",
        title: "T",
        status: "waiting_on_review",
        period_end: "2026-11-18",
        saved_to_drive_at: null,
        drive_file_id: null,
        drive_web_view_link: null,
      },
      property: {
        id: "p1",
        name: "Test",
        drive_folder_id: "folder-1",
        drive_folder_name: "Test Folder",
      },
      snapshot: {
        id: "s1",
        version: 1,
        generated_file_bucket: "generated-reports",
        generated_file_path: "o1/reports/r1/draft-v1.pdf",
        drive_file_id: null,
        drive_confirmed_at: null,
        drive_web_view_link: null,
        drive_file_name: null,
      },
    });

    await expect(
      backupFinalizedReportToDrive({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        reportId: "r1",
        drive: makeDrivePort(),
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/finalized|Drive/i),
    });
  });

  it("rejects when final PDF path is a draft", async () => {
    const { backupFinalizedReportToDrive } = await import("@/lib/google-drive/backup");
    const supabase = makeSupabase({
      report: {
        id: "r1",
        organization_id: "o1",
        property_id: "p1",
        unit_type_id: "u1",
        title: "T",
        status: "sent",
        period_end: "2026-11-18",
        saved_to_drive_at: null,
        drive_file_id: null,
        drive_web_view_link: null,
      },
      property: {
        id: "p1",
        name: "Test",
        drive_folder_id: "folder-1",
        drive_folder_name: "Test Folder",
      },
      snapshot: {
        id: "s1",
        version: 1,
        generated_file_bucket: "generated-reports",
        generated_file_path: "o1/reports/r1/draft-v1-x.pdf",
        drive_file_id: null,
        drive_confirmed_at: null,
        drive_web_view_link: null,
        drive_file_name: null,
      },
    });

    await expect(
      backupFinalizedReportToDrive({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        reportId: "r1",
        drive: makeDrivePort(),
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/finalized PDFs|Draft/i),
    });
  });

  it("uploads finalized PDF and marks saved_to_drive only after confirm", async () => {
    const { backupFinalizedReportToDrive } = await import("@/lib/google-drive/backup");
    const pdf = new TextEncoder().encode(
      `%PDF-1.4\n${"x".repeat(120)}\n%%EOF`,
    );
    downloadMock.mockResolvedValue({
      data: {
        arrayBuffer: async () => pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength),
      },
      error: null,
    });

    const reportPatches: Record<string, unknown>[] = [];
    const snapPatches: Record<string, unknown>[] = [];
    const upload = vi.fn(async (input: { fileName: string; bytes: Uint8Array; folderId: string }) => ({
      id: "file-1",
      name: input.fileName,
      mimeType: "application/pdf",
      size: input.bytes.byteLength,
      md5Checksum: "abc",
      parents: [input.folderId],
      webViewLink: "https://drive.google.com/file/d/file-1/view",
      trashed: false,
      created: true,
      verified: true,
    }));

    const supabase = makeSupabase({
      report: {
        id: "r1",
        organization_id: "o1",
        property_id: "p1",
        unit_type_id: "u1",
        title: "T",
        status: "sent",
        period_end: "2026-11-18",
        saved_to_drive_at: null,
        drive_file_id: null,
        drive_web_view_link: null,
      },
      property: {
        id: "p1",
        name: "Fourteen B",
        drive_folder_id: "folder-1",
        drive_folder_name: "Fourteen B Folder",
      },
      snapshot: {
        id: "s1",
        version: 2,
        generated_file_bucket: "generated-reports",
        generated_file_path: "o1/reports/r1/final-v2-stamp.pdf",
        drive_file_id: null,
        drive_confirmed_at: null,
        drive_web_view_link: null,
        drive_file_name: null,
      },
      updateReport: (p) => {
        reportPatches.push(p);
      },
      updateSnapshot: (p) => {
        snapPatches.push(p);
      },
    });

    const result = await backupFinalizedReportToDrive({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      reportId: "r1",
      drive: makeDrivePort({ uploadPdf: upload }),
    });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("saved_to_drive");
    expect(result.verified).toBe(true);
    expect(reportPatches[0]?.status).toBe("saved_to_drive");
    expect(reportPatches[0]?.drive_file_id).toBe("file-1");
    expect(snapPatches[0]?.drive_file_id).toBe("file-1");
    expect(result.driveFileName).toContain("Fourteen B");
  });

  it("replays without re-upload when already saved", async () => {
    const { backupFinalizedReportToDrive } = await import("@/lib/google-drive/backup");
    const upload = vi.fn();
    const supabase = makeSupabase({
      report: {
        id: "r1",
        organization_id: "o1",
        property_id: "p1",
        unit_type_id: "u1",
        title: "T",
        status: "saved_to_drive",
        period_end: "2026-11-18",
        saved_to_drive_at: "2026-11-18T12:00:00.000Z",
        drive_file_id: "file-1",
        drive_web_view_link: "https://drive.google.com/file/d/file-1/view",
      },
      property: {
        id: "p1",
        name: "Fourteen B",
        drive_folder_id: "folder-1",
        drive_folder_name: "Fourteen B Folder",
      },
      snapshot: {
        id: "s1",
        version: 2,
        generated_file_bucket: "generated-reports",
        generated_file_path: "o1/reports/r1/final-v2-stamp.pdf",
        drive_file_id: "file-1",
        drive_confirmed_at: "2026-11-18T12:00:00.000Z",
        drive_web_view_link: "https://drive.google.com/file/d/file-1/view",
        drive_file_name: "Fourteen B — 2BR — 2026-11-18 — v2.pdf",
      },
    });

    const result = await backupFinalizedReportToDrive({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      reportId: "r1",
      drive: makeDrivePort({ uploadPdf: upload }),
    });

    expect(upload).not.toHaveBeenCalled();
    expect(result.status).toBe("already_saved");
    expect(result.replayed).toBe(true);
  });

  it("records friendly failure and preserves finalized status on Drive errors", async () => {
    const { backupFinalizedReportToDrive } = await import("@/lib/google-drive/backup");
    const pdf = new TextEncoder().encode(
      `%PDF-1.4\n${"x".repeat(120)}\n%%EOF`,
    );
    downloadMock.mockResolvedValue({
      data: {
        arrayBuffer: async () => pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength),
      },
      error: null,
    });
    const reportPatches: Record<string, unknown>[] = [];

    const supabase = makeSupabase({
      report: {
        id: "r1",
        organization_id: "o1",
        property_id: "p1",
        unit_type_id: "u1",
        title: "T",
        status: "sent",
        period_end: "2026-11-18",
        saved_to_drive_at: null,
        drive_file_id: null,
        drive_web_view_link: null,
      },
      property: {
        id: "p1",
        name: "Fourteen B",
        drive_folder_id: "folder-1",
        drive_folder_name: "Fourteen B Folder",
      },
      snapshot: {
        id: "s1",
        version: 2,
        generated_file_bucket: "generated-reports",
        generated_file_path: "o1/reports/r1/final-v2-stamp.pdf",
        drive_file_id: null,
        drive_confirmed_at: null,
        drive_web_view_link: null,
        drive_file_name: null,
      },
      updateReport: (p) => {
        reportPatches.push(p);
      },
    });

    await expect(
      backupFinalizedReportToDrive({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        reportId: "r1",
        drive: makeDrivePort({
          uploadPdf: async () => {
            const err = Object.assign(new Error("insufficientPermissions"), { code: 403 });
            throw err;
          },
        }),
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/denied|permission|sharing/i),
    });

    expect(reportPatches[0]?.drive_backup_error).toMatch(/denied|permission|sharing/i);
    expect(reportPatches[0]?.status).toBeUndefined();
  });
});

describe("createPropertyDriveFolder", () => {
  it("reuses an existing child folder instead of creating a duplicate", async () => {
    const { createPropertyDriveFolder } = await import("@/lib/google-drive/folders");
    const createFolder = vi.fn();
    const listChildFolders = vi.fn(async () => [
      {
        id: "existing",
        name: "Fourteen B (Providence, RI)",
        trashed: false,
      },
    ]);

    const updates: Record<string, unknown>[] = [];
    const supabase = {
      from(table: string) {
        if (table === "properties") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "p1",
                    name: "Fourteen B",
                    city: "Providence",
                    state: "RI",
                    drive_folder_id: null,
                    organization_id: "o1",
                  },
                  error: null,
                }),
              }),
            }),
            update: (patch: Record<string, unknown>) => ({
              eq: async () => {
                updates.push(patch);
                return { error: null };
              },
            }),
          };
        }
        if (table === "organizations") {
          return {
            select: () => ({
              limit: async () => ({ data: [{ drive_reports_root_folder_id: "root" }], error: null }),
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    drive_reports_root_folder_id: "root",
                    drive_reports_root_folder_name: "PKL Reports",
                    drive_connection_checked_at: null,
                    drive_connection_error: null,
                  },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            limit: async () => ({ data: [], error: null }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      },
    };

    const result = await createPropertyDriveFolder({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      propertyId: "p1",
      organizationId: "o1",
      drive: makeDrivePort({ listChildFolders, createFolder }),
    });

    expect(createFolder).not.toHaveBeenCalled();
    expect(result.folderId).toBe("existing");
    expect(updates[0]?.drive_folder_id).toBe("existing");
  });
});
