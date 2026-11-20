import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { runIdempotent } from "@/lib/api/idempotency";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";
import { assembleReportPayload } from "@/lib/reports/assemble";
import { evaluatePdfFinalization } from "@/lib/pdf/finalization";
import { renderCanonicalReportPdf } from "@/lib/pdf/render";
import {
  attachPdfToSnapshot,
  uploadGeneratedReportPdf,
} from "@/lib/pdf/storage";
import { assertNoClientProspectPii } from "@/lib/privacy/client-report-payload";
import { loadReportPhotoDataUrls } from "@/lib/photos/load-for-pdf";
import { attemptAutomaticDriveBackup } from "@/lib/google-drive/auto-backup";
import { isLiveMode } from "@/lib/supabase/env";
import type { CanonicalReportPayload } from "@/lib/reports/types";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Final PDF from the latest approved immutable snapshot payload.
 * Blocked when comps/narrative/pricing incomplete — never auto-approves comps.
 * Does NOT transition status to saved_to_drive (Drive is a later task).
 * Idempotent: Idempotency-Key coalesces duplicates; existing snapshot PDF short-circuits.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    if (!isLiveMode()) throw validationError("This action isn't available right now. Please try again later.");
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();

    const { data: report, error } = await supabase
      .from("report_runs")
      .select("id, organization_id, status")
      .eq("id", id)
      .maybeSingle();
    if (error) throw validationError("Failed to load report", error.message);
    if (!report) throw notFoundError("Report not found");
    await requireOrgMembership(supabase, user, report.organization_id);

    if (report.status === "saved_to_drive") {
      throw validationError("Report already saved to Drive — PDF is locked");
    }

    let acknowledgedKeys: string[] = [];
    try {
      const body = (await request.clone().json()) as {
        acknowledgedWarningKeys?: string[];
      };
      if (Array.isArray(body?.acknowledgedWarningKeys)) {
        acknowledgedKeys = body.acknowledgedWarningKeys.filter(
          (k): k is string => typeof k === "string",
        );
      }
    } catch {
      /* empty body ok */
    }

    const live = await assembleReportPayload(supabase, id);
    const liveCheck = evaluatePdfFinalization(live, acknowledgedKeys);
    if (!liveCheck.ok) {
      throw validationError("Final PDF blocked", {
        blockers: [
          ...liveCheck.blockers,
          ...liveCheck.acknowledgeableKeys.map(
            (k) => `Acknowledge remaining item: ${k}`,
          ),
        ],
      });
    }

    const { data: snapshots, error: snapErr } = await supabase
      .from("report_snapshots")
      .select("id, version, payload, generated_file_path, generated_file_bucket")
      .eq("report_run_id", id)
      .order("version", { ascending: false })
      .limit(1);
    if (snapErr) throw validationError("Failed to load snapshot", snapErr.message);
    const snapshot = snapshots?.[0];
    if (!snapshot) {
      throw validationError(
        "No approved immutable snapshot — create a snapshot after narrative approval",
      );
    }

    // Natural idempotency: already finalized for this snapshot version.
    if (snapshot.generated_file_path) {
      const auto = await attemptAutomaticDriveBackup({
        supabase,
        reportId: id,
      });
      let driveStatus:
        | "not_saved"
        | "saved_to_drive"
        | "already_saved"
        | "backup_failed"
        | "skipped" = "not_saved";
      let driveBackupMessage: string | undefined;
      if (!auto.attempted) {
        driveStatus = "skipped";
        driveBackupMessage = auto.reason;
      } else if (auto.ok) {
        driveStatus =
          auto.backup.status === "already_saved" ? "already_saved" : "saved_to_drive";
      } else {
        driveStatus = "backup_failed";
        driveBackupMessage = auto.message;
      }

      return jsonOk(
        {
          snapshotId: snapshot.id,
          version: snapshot.version,
          storage: {
            bucket: snapshot.generated_file_bucket ?? "report-pdfs",
            path: snapshot.generated_file_path,
          },
          driveStatus,
          driveBackupMessage,
          note:
            driveStatus === "saved_to_drive" || driveStatus === "already_saved"
              ? "Final PDF already stored and saved to Google Drive."
              : "Final PDF already stored for this snapshot.",
          replayed: true,
          pdfByteLength: null,
        },
        { status: 200 },
      );
    }

    type FinalizePayload = {
      snapshotId: string;
      version: number;
      storage: { bucket: string; path: string };
      driveStatus: "not_saved" | "saved_to_drive" | "already_saved" | "backup_failed" | "skipped";
      driveBackupMessage?: string;
      note: string;
      replayed: boolean;
      pdfByteLength: number | null;
      engine?: string;
      pageCount?: number;
    };

    const result = await runIdempotent<FinalizePayload>({
      request,
      organizationId: report.organization_id,
      userId: user.id,
      route: `POST /api/reports/${id}/pdf/finalize`,
      supabase,
      execute: async () => {
        // Re-check path under lock (race with parallel finalize).
        const { data: fresh } = await supabase
          .from("report_snapshots")
          .select("id, version, payload, generated_file_path, generated_file_bucket")
          .eq("id", snapshot.id)
          .maybeSingle();
        if (fresh?.generated_file_path) {
          const auto = await attemptAutomaticDriveBackup({
            supabase,
            reportId: id,
          });
          let driveStatus: FinalizePayload["driveStatus"] = "not_saved";
          let driveBackupMessage: string | undefined;
          if (!auto.attempted) {
            driveStatus = "skipped";
            driveBackupMessage = auto.reason;
          } else if (auto.ok) {
            driveStatus =
              auto.backup.status === "already_saved" ? "already_saved" : "saved_to_drive";
          } else {
            driveStatus = "backup_failed";
            driveBackupMessage = auto.message;
          }
          return {
            data: {
              snapshotId: fresh.id,
              version: fresh.version,
              storage: {
                bucket: fresh.generated_file_bucket ?? "report-pdfs",
                path: fresh.generated_file_path,
              },
              driveStatus,
              driveBackupMessage,
              note:
                driveStatus === "saved_to_drive" || driveStatus === "already_saved"
                  ? "Final PDF already stored and saved to Google Drive."
                  : "Final PDF already stored for this snapshot.",
              replayed: true,
              pdfByteLength: null,
            },
            status: 200,
          };
        }

        const payload = (fresh?.payload ?? snapshot.payload) as unknown as CanonicalReportPayload;
        if (!payload.property.photos) {
          payload.property.photos = (payload.property.photoPaths ?? []).map((path, i) => ({
            id: `snapshot-${i}`,
            storagePath: path,
            comparablePropertyId: null,
            sortOrder: i,
            crop: null,
          }));
        }
        assertNoClientProspectPii(payload);
        const snapCheck = evaluatePdfFinalization(payload, acknowledgedKeys);
        if (!snapCheck.ok) {
          throw validationError("Snapshot payload cannot finalize", {
            blockers: snapCheck.blockers,
          });
        }

        const photoDataUrls = await loadReportPhotoDataUrls(
          supabase,
          payload.property.photos,
        );

        const rendered = await renderCanonicalReportPdf({
          payload,
          mode: "final",
          photoDataUrls,
          acknowledgedWarningKeys: acknowledgedKeys,
        });

        const stored = await uploadGeneratedReportPdf({
          supabase,
          organizationId: report.organization_id,
          reportRunId: id,
          version: snapshot.version,
          mode: "final",
          bytes: rendered.bytes,
        });

        await attachPdfToSnapshot({
          supabase,
          snapshotId: snapshot.id,
          bucket: stored.bucket,
          path: stored.path,
        });

        await supabase
          .from("report_runs")
          .update({
            notes: `Final PDF v${snapshot.version} stored.`.slice(0, 5000),
          })
          .eq("id", id);

        // Best-effort automatic backup when the report is already completed.
        const auto = await attemptAutomaticDriveBackup({
          supabase,
          reportId: id,
        });
        let driveStatus: FinalizePayload["driveStatus"] = "not_saved";
        let driveBackupMessage: string | undefined;
        if (!auto.attempted) {
          driveStatus = "skipped";
          driveBackupMessage = auto.reason;
        } else if (auto.ok) {
          driveStatus =
            auto.backup.status === "already_saved" ? "already_saved" : "saved_to_drive";
        } else {
          driveStatus = "backup_failed";
          driveBackupMessage = auto.message;
        }

        return {
          data: {
            snapshotId: snapshot.id,
            version: snapshot.version,
            engine: rendered.engine,
            pageCount: rendered.pageCount,
            storage: stored,
            driveStatus,
            driveBackupMessage,
            note:
              driveStatus === "saved_to_drive" || driveStatus === "already_saved"
                ? "Final PDF stored and saved to Google Drive."
                : "Final PDF stored. Save to Google Drive when the report is completed and a folder is assigned.",
            replayed: false,
            pdfByteLength: rendered.bytes.byteLength,
          },
          status: 201,
        };
      },
    });

    return jsonOk(result.data, { status: result.status });
  } catch (error) {
    return jsonError(error);
  }
}
