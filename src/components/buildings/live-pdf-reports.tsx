"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Download, FileText, HardDrive } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { GuidedReportChrome } from "@/components/buildings/guided-report-chrome";
import { GuidedStepNav } from "@/components/buildings/guided-step-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { usePendingAction } from "@/hooks/use-pending-action";
import { hrefForReportStep } from "@/lib/reports/guided-workflow";
import {
  isDraftReportStatus,
  isFinalizedReportStatus,
  suggestedReportingPeriod,
} from "@/lib/reports/report-entry";
import { idempotentHeaders, newIdempotencyKey } from "@/lib/ui/idempotency-key";
import {
  isDriveFolderMissingReason,
  labelDriveBackupBlocker,
  labelDriveFolderStatus,
} from "@/lib/ui/drive-folder-labels";
import { labelAssemblyStatus, labelNarrativeStatus, labelReportStatus } from "@/lib/ui/status-labels";
import { apiErrorMessage, toUserFacingError } from "@/lib/ui/user-facing-error";
import { toast } from "sonner";

type ReportOption = {
  id: string;
  title: string;
  period_start: string;
  period_end: string;
  status?: string;
  unit_type_id?: string;
};

type UnitTypeOption = { id: string; label: string; beds: number | null };

type DriveStatus = {
  reportStatus: string;
  canBackup: boolean;
  blockers: string[];
  savedToDriveAt: string | null;
  driveWebViewLink: string | null;
  driveBackupError: string | null;
  driveFileName: string | null;
  finalPdfStored: boolean;
  snapshotVersion: number | null;
  propertyFolderName: string | null;
  propertyFolderAssigned: boolean;
};

function downloadBase64Pdf(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function downloadStoredPdf(reportId: string) {
  const res = await fetch(`/api/reports/${reportId}/pdf/download`);
  const json = await res.json();
  if (!res.ok || !json?.data?.signedUrl) {
    throw new Error(apiErrorMessage(json, "Could not download the report PDF"));
  }
  const a = document.createElement("a");
  a.href = json.data.signedUrl as string;
  a.download = `report-${reportId}.pdf`;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function LivePdfReports({ propertyId }: { propertyId: string }) {
  return (
    <Suspense
      fallback={
        <div>
          <Topbar title="Weekly report" />
          <PageSkeleton rows={3} />
        </div>
      }
    >
      <LivePdfReportsInner propertyId={propertyId} />
    </Suspense>
  );
}

function LivePdfReportsInner({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlReportId = searchParams.get("reportId");
  const urlUnitTypeId = searchParams.get("unitTypeId");
  const urlStep = searchParams.get("step");
  const onDownloadStep = urlStep === "download" || urlStep === "preview";

  const [propertyName, setPropertyName] = useState("Property");
  const [reports, setReports] = useState<ReportOption[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitTypeOption[]>([]);
  /** Active report for PDF actions — always mirrors URL when present. */
  const reportId = urlReportId;
  const [showStartReport, setShowStartReport] = useState(false);
  const [ackMissingWeekly, setAckMissingWeekly] = useState(false);
  const [ackDeferPending, setAckDeferPending] = useState(false);
  const [status, setStatus] = useState<{
    assemblyStatus?: string;
    finalization?: {
      ok: boolean;
      blockers: string[];
      warnings: string[];
      acknowledgeableKeys?: string[];
      readyAfterAck?: boolean;
    };
    eligibleGroupedCount?: number;
    narrativeStatus?: string | null;
  } | null>(null);
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusTick, setStatusTick] = useState(0);
  const [driveSaving, setDriveSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const drivePollGen = useRef(0);
  const periodDefaults = suggestedReportingPeriod();
  const [createForm, setCreateForm] = useState({
    title: "",
    unitTypeId: "",
    periodStart: periodDefaults.start,
    periodEnd: periodDefaults.end,
    preparedBy: "",
  });
  const { pending, run } = usePendingAction();

  const drafts = useMemo(
    () => reports.filter((r) => isDraftReportStatus(r.status)),
    [reports],
  );
  const finalized = useMemo(
    () => reports.filter((r) => isFinalizedReportStatus(r.status)),
    [reports],
  );

  /** Hub = no URL report (or not on download/preview). Download UI only with explicit report + step. */
  const showHub = !reportId || !onDownloadStep;
  const showDownloadWorkspace = Boolean(reportId && onDownloadStep);

  function loadReports() {
    return Promise.all([
      fetch(`/api/properties/${propertyId}`).then((r) =>
        r.json().then((json) => ({ ok: r.ok, json })),
      ),
      fetch(`/api/properties/${propertyId}/reports`).then((r) =>
        r.json().then((json) => ({ ok: r.ok, json })),
      ),
      fetch(`/api/properties/${propertyId}/unit-types`).then((r) =>
        r.json().then((json) => ({ ok: r.ok, json })),
      ),
    ]).then(([propRes, repRes, utRes]) => {
      if (!propRes.ok) throw new Error(apiErrorMessage(propRes.json, "Could not load property"));
      if (!repRes.ok) throw new Error(apiErrorMessage(repRes.json, "Could not load reports"));
      setPropertyName(propRes.json.data?.property?.name ?? "Property");
      const list = (repRes.json.data?.reports ?? []) as ReportOption[];
      setReports(list);
      // Never silently select a report into local state — URL is the source of truth.
      const uts = (utRes.ok ? (utRes.json.data?.unitTypes ?? []) : []) as UnitTypeOption[];
      setUnitTypes(uts);
      setCreateForm((f) => ({
        ...f,
        unitTypeId: f.unitTypeId || urlUnitTypeId || uts[0]?.id || "",
        title:
          f.title ||
          `${propRes.json.data?.property?.name ?? "Property"} — ${uts[0]?.label ?? "Unit"} weekly`,
      }));
      setLoading(false);
      setError(null);
    });
  }

  useEffect(() => {
    let cancelled = false;
    loadReports().catch((e) => {
      if (!cancelled) {
        setError(toUserFacingError(e, "Could not load reports"));
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  async function createReport() {
    await run(async () => {
      setMessage(null);
      const idempotencyKey = newIdempotencyKey();
      try {
        if (!createForm.unitTypeId) throw new Error("Select a unit type before creating a report");
        if (!createForm.title.trim()) throw new Error("Enter a report title");
        const res = await fetch(`/api/properties/${propertyId}/reports`, {
          method: "POST",
          headers: idempotentHeaders(idempotencyKey, {
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            unitTypeId: createForm.unitTypeId,
            title: createForm.title.trim(),
            periodStart: createForm.periodStart,
            periodEnd: createForm.periodEnd,
            preparedBy: createForm.preparedBy.trim() || null,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(apiErrorMessage(json, "Could not create report"));
        }
        const created = json.data.report as ReportOption & { unit_type_id?: string };
        toast.success("Report created — opening guided upload");
        setReports((prev) => [created, ...prev]);
        setShowStartReport(false);
        // Enter guided Step 1 immediately — never stay on legacy PDF download UI.
        router.replace(
          hrefForReportStep({
            propertyId,
            stepId: "upload",
            reportRunId: created.id,
            unitTypeId: createForm.unitTypeId || created.unit_type_id || null,
          }),
        );
      } catch (e) {
        const msg = toUserFacingError(e, "Could not create report");
        setMessage(msg);
        toast.error(msg);
      }
    });
  }

  function openGuidedReport(report: ReportOption, step: "upload" | "download" = "upload") {
    router.push(
      hrefForReportStep({
        propertyId,
        stepId: step,
        reportRunId: report.id,
        unitTypeId: report.unit_type_id || urlUnitTypeId || createForm.unitTypeId || null,
      }),
    );
  }

  // Bare ?reportId= without step must not open download UI — send staff into guided Step 1.
  useEffect(() => {
    if (!urlReportId || urlStep) return;
    const match = reports.find((r) => r.id === urlReportId);
    router.replace(
      hrefForReportStep({
        propertyId,
        stepId: "upload",
        reportRunId: urlReportId,
        unitTypeId: match?.unit_type_id || urlUnitTypeId || createForm.unitTypeId || null,
      }),
    );
  }, [
    urlReportId,
    urlStep,
    reports,
    propertyId,
    urlUnitTypeId,
    createForm.unitTypeId,
    router,
  ]);

  useEffect(() => {
    if (!reportId || !showDownloadWorkspace) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setStatusLoading(true);
      setStatusError(null);
    });
    Promise.all([
      fetch(`/api/reports/${reportId}/pdf`).then((r) =>
        r.json().then((json) => ({ ok: r.ok, json })),
      ),
      fetch(`/api/reports/${reportId}/drive`).then((r) =>
        r.json().then((json) => ({ ok: r.ok, json })),
      ),
    ])
      .then(([pdfRes, driveRes]) => {
        if (cancelled) return;
        if (!pdfRes.ok) throw new Error(apiErrorMessage(pdfRes.json, "Could not load PDF status"));
        setStatus(pdfRes.json.data);
        if (driveRes.ok) setDrive(driveRes.json.data.drive as DriveStatus);
        setStatusError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = toUserFacingError(e, "Could not load PDF status");
        setStatusError(msg);
        setMessage(msg);
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, statusTick, showDownloadWorkspace]);

  async function refreshDrive(expectedGen?: number) {
    if (!reportId) return null;
    const res = await fetch(`/api/reports/${reportId}/drive`);
    const json = await res.json();
    if (!res.ok || !json.ok) return null;
    if (expectedGen != null && expectedGen !== drivePollGen.current) return null;
    const next = json.data.drive as DriveStatus;
    setDrive((prev) => {
      // Never let a stale "in progress" response overwrite a confirmed Drive save.
      if (
        prev?.reportStatus === "saved_to_drive" &&
        next.reportStatus !== "saved_to_drive" &&
        !driveSaving
      ) {
        return prev;
      }
      return next;
    });
    return next;
  }

  async function pollDriveUntilSettled() {
    const gen = ++drivePollGen.current;
    setDriveSaving(true);
    try {
      for (let i = 0; i < 12; i++) {
        const next = await refreshDrive(gen);
        if (!next || gen !== drivePollGen.current) return next;
        if (next.reportStatus === "saved_to_drive" || next.driveBackupError) {
          return next;
        }
        if (next.reportStatus === "sent" && next.canBackup) {
          // Completed but backup still pending — keep showing saving.
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      return await refreshDrive(gen);
    } finally {
      if (gen === drivePollGen.current) setDriveSaving(false);
    }
  }

  async function generateDraft() {
    if (!reportId) return;
    await run(async () => {
      setMessage(null);
      const idempotencyKey = newIdempotencyKey();
      try {
        const res = await fetch(`/api/reports/${reportId}/pdf`, {
          method: "POST",
          headers: idempotentHeaders(idempotencyKey, {
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ mode: "draft", store: false }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(apiErrorMessage(json, "Could not generate draft PDF"));
        downloadBase64Pdf(json.data.pdfBase64, json.data.filename);
        setMessage(
          json.data.finalization?.ok
            ? `Draft PDF downloaded (${json.data.pageCount} pages). Ready to finalize.`
            : `Draft PDF downloaded (${json.data.pageCount} pages). Finalization still blocked — resolve blockers below.`,
        );
        setStatus((s) => ({
          ...s,
          finalization: json.data.finalization,
        }));
      } catch (e) {
        setMessage(toUserFacingError(e, "Could not generate draft PDF"));
      }
    });
  }

  async function lockSnapshot() {
    if (!reportId) return;
    await run(async () => {
      setMessage(null);
      try {
        const res = await fetch(`/api/reports/${reportId}/snapshot`, {
          method: "POST",
          headers: idempotentHeaders(newIdempotencyKey()),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(apiErrorMessage(json, "Could not lock report snapshot"));
        setMessage(
          json.data?.snapshot?.reused
            ? `Using approved report version ${json.data?.snapshot?.version ?? "—"}. Generate the final PDF when ready.`
            : `New approved report version ${json.data?.snapshot?.version ?? "—"} created. Generate the final PDF when ready.`,
        );
        toast.success("Approved report version ready");
        setStatusTick((n) => n + 1);
      } catch (e) {
        const msg = toUserFacingError(e, "Could not lock report snapshot");
        setMessage(msg);
        toast.error(msg);
      }
    });
  }

  async function finalize() {
    if (!reportId) return;
    await run(async () => {
      setMessage(null);
      const idempotencyKey = newIdempotencyKey();
      try {
        const res = await fetch(`/api/reports/${reportId}/pdf/finalize`, {
          method: "POST",
          headers: {
            ...idempotentHeaders(idempotencyKey),
            "content-type": "application/json",
          },
          body: JSON.stringify({
            acknowledgedWarningKeys: [
              ...(ackMissingWeekly ? ["missing_weekly"] : []),
              ...(ackDeferPending ? ["defer_pending_comps"] : []),
            ],
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          const blockers = json?.error?.details?.blockers;
          const blockerText = Array.isArray(blockers) ? blockers.join("; ") : null;
          const raw = apiErrorMessage(json, blockerText ?? "Could not finalize PDF");
          if (/snapshot/i.test(raw)) {
            throw new Error(
              "Lock a snapshot after approving the narrative, then store the final PDF.",
            );
          }
          throw new Error(raw);
        }
        setMessage(
          json.data.pageCount != null
            ? `Final PDF ready (version ${json.data.version}, ${json.data.pageCount} pages). Downloading…`
            : `Final PDF ready (version ${json.data.version}). Downloading…`,
        );
        toast.success("Final PDF ready");
        try {
          await downloadStoredPdf(reportId);
          setMessage(
            json.data.pageCount != null
              ? `Final PDF downloaded (version ${json.data.version}, ${json.data.pageCount} pages).`
              : `Final PDF downloaded (version ${json.data.version}).`,
          );
        } catch (downloadErr) {
          setMessage(
            toUserFacingError(
              downloadErr,
              "Final PDF was stored, but download did not start. Use Download final PDF.",
            ),
          );
        }
        await refreshDrive();
        setStatusTick((n) => n + 1);
      } catch (e) {
        const msg = toUserFacingError(e, "Could not finalize PDF");
        setMessage(msg);
        toast.error(msg);
      }
    });
  }

  async function downloadFinalPdf() {
    if (!reportId) return;
    await run(async () => {
      setMessage(null);
      try {
        await downloadStoredPdf(reportId);
        setMessage("Final PDF download started.");
        toast.success("Download started");
      } catch (e) {
        const msg = toUserFacingError(e, "Could not download the report PDF");
        setMessage(msg);
        toast.error(msg);
      }
    });
  }

  async function transitionTo(toStatus: string) {
    const res = await fetch(`/api/reports/${reportId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStatus }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(apiErrorMessage(json, "Could not update report status"));
    }
    return json;
  }

  async function markFinalized() {
    if (!reportId) return;
    const folderReady = Boolean(drive?.propertyFolderAssigned);
    if (!folderReady) {
      const proceed = window.confirm(
        "You can complete this report now. Google Drive backup is not set up for this property yet, so the PDF will not be saved to Drive automatically. Continue?",
      );
      if (!proceed) return;
    }
    await run(async () => {
      try {
        // Lifecycle: in_progress → waiting_on_review → sent (then optional Drive).
        if (drive?.reportStatus === "in_progress") {
          await transitionTo("waiting_on_review");
        }
        const json = await transitionTo("sent");
        const driveBackup = json.data?.driveBackup as
          | { attempted: false; reason?: string }
          | { attempted: true; ok: true; driveFileName?: string }
          | { attempted: true; ok: false; message?: string }
          | null
          | undefined;

        if (folderReady) {
          setDriveSaving(true);
          const settled = await pollDriveUntilSettled();
          if (
            (driveBackup?.attempted && driveBackup.ok) ||
            settled?.reportStatus === "saved_to_drive"
          ) {
            toast.success("Report completed and saved to Google Drive.");
          } else if (driveBackup?.attempted && !driveBackup.ok) {
            toast.success("Report completed.");
            toast.error(
              toUserFacingError(
                "message" in driveBackup ? driveBackup.message : null,
                "Could not save to Google Drive. You can retry from this page.",
              ),
            );
          } else if (settled?.driveBackupError) {
            toast.success("Report completed.");
            toast.error(
              toUserFacingError(
                settled.driveBackupError,
                "Could not save to Google Drive. You can retry from this page.",
              ),
            );
          } else {
            toast.success("Report completed.");
          }
        } else {
          setDriveSaving(false);
          toast.success("Report completed.");
          if (
            !driveBackup?.attempted &&
            isDriveFolderMissingReason(
              driveBackup && "reason" in driveBackup ? driveBackup.reason : null,
            )
          ) {
            toast.message(
              "Set up a Google Drive folder anytime, then return here to save this PDF — no need to regenerate it.",
            );
          }
          await refreshDrive();
        }
        setStatusTick((n) => n + 1);
      } catch (e) {
        setDriveSaving(false);
        toast.error(toUserFacingError(e, "Could not mark the report as completed"));
      }
    });
  }

  async function saveToDrive() {
    if (!reportId) return;
    await run(async () => {
      setMessage(null);
      setDriveSaving(true);
      try {
        const res = await fetch(`/api/reports/${reportId}/drive`, {
          method: "POST",
          headers: idempotentHeaders(newIdempotencyKey()),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(apiErrorMessage(json, "Could not save PDF to Google Drive"));
        }
        const backup = json.data.backup;
        const settled = await pollDriveUntilSettled();
        setMessage(
          backup.status === "already_saved" || backup.replayed
            ? `Already saved to Google Drive (${backup.driveFileName}).`
            : `Report saved to Google Drive: ${backup.driveFileName ?? settled?.driveFileName ?? ""}`,
        );
        toast.success(
          backup.status === "already_saved"
            ? "Already saved to Google Drive."
            : "Report saved to Google Drive.",
        );
      } catch (e) {
        const msg = toUserFacingError(e, "Could not save PDF to Google Drive");
        setMessage(msg);
        toast.error(msg);
        setDriveSaving(false);
        await refreshDrive();
      }
    });
  }

  if (error) {
    return (
      <div>
        <Topbar title="Reports" />
        <div className="px-6 py-5">
          <EmptyState
            icon={Building2}
            title="Could not load reports"
            description={error}
            actionLabel="Retry"
            onAction={() => router.refresh()}
          />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <Topbar title="Weekly report" subtitle={propertyName} />
        <div className="px-6 py-5">
          <PageSkeleton rows={3} />
          <p className="mt-2 text-sm text-ink-muted">Loading report workspace…</p>
        </div>
      </div>
    );
  }

  const startReportForm = (
    <Card className="mb-5">
      <CardHeader>
        <CardTitle>Start a report</CardTitle>
        <CardDescription>
          Confirm the unit type and reporting period before creating. Suggested dates are a
          starting point only — change them when you need a historical week.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2 space-y-1">
          <Label htmlFor="report-title">Title</Label>
          <Input
            id="report-title"
            value={createForm.title}
            onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Property — 1BR weekly"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="report-unit-type">Unit type</Label>
          <select
            id="report-unit-type"
            className="h-10 w-full cursor-pointer rounded-md border border-border bg-white px-3 text-sm"
            value={createForm.unitTypeId}
            onChange={(e) => setCreateForm((f) => ({ ...f, unitTypeId: e.target.value }))}
          >
            {unitTypes.length === 0 ? (
              <option value="">Add a unit type on the property first</option>
            ) : (
              unitTypes.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                  {u.beds != null ? ` (${u.beds} bed)` : ""}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="report-prepared-by">Prepared by (optional)</Label>
          <Input
            id="report-prepared-by"
            value={createForm.preparedBy}
            onChange={(e) => setCreateForm((f) => ({ ...f, preparedBy: e.target.value }))}
            placeholder="Agent name"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="report-period-start">Period start</Label>
          <Input
            id="report-period-start"
            type="date"
            value={createForm.periodStart}
            onChange={(e) => setCreateForm((f) => ({ ...f, periodStart: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="report-period-end">Period end</Label>
          <Input
            id="report-period-end"
            type="date"
            value={createForm.periodEnd}
            onChange={(e) => setCreateForm((f) => ({ ...f, periodEnd: e.target.value }))}
          />
        </div>
        <p className="md:col-span-2 text-xs text-ink-muted">
          Selected period: {createForm.periodStart || "—"} → {createForm.periodEnd || "—"}. These
          dates are saved on the report and used for weekly performance and the PDF.
        </p>
        <div className="md:col-span-2 flex flex-wrap gap-2">
          <Button
            variant="gold"
            pending={pending}
            disabled={
              !createForm.unitTypeId ||
              !createForm.title.trim() ||
              !createForm.periodStart ||
              !createForm.periodEnd
            }
            onClick={() => void createReport()}
          >
            Create report and open Step 1
          </Button>
          {reports.length > 0 && showStartReport ? (
            <Button variant="ghost" onClick={() => setShowStartReport(false)}>
              Cancel
            </Button>
          ) : null}
        </div>
        {message ? <p className="md:col-span-2 text-xs text-ink-muted">{message}</p> : null}
      </CardContent>
    </Card>
  );

  return (
    <div>
      <Topbar
        title={showDownloadWorkspace ? "Download and save" : "Weekly report"}
        subtitle={propertyName}
      />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={[
            { label: "Portfolio", href: "/" },
            { label: "Buildings", href: "/buildings" },
            { label: propertyName, href: `/buildings/${propertyId}` },
            { label: "Reports" },
          ]}
        />

        {showDownloadWorkspace ? (
          <GuidedReportChrome propertyId={propertyId} defaultStep="download" />
        ) : null}

        {showHub ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-navy">Report workspace</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Start a new weekly report or continue an in-progress draft. Final PDF tools appear
                only on the Download step after you work through the guided journey.
              </p>
            </div>

            {drafts.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Continue a draft</CardTitle>
                  <CardDescription>
                    Choose the exact report to resume — drafts are never switched automatically.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {drafts.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium text-navy">{r.title}</div>
                        <div className="text-xs text-ink-muted">
                          {r.period_start} → {r.period_end} · {labelReportStatus(r.status ?? "in_progress")}
                        </div>
                      </div>
                      <Button size="sm" variant="gold" onClick={() => openGuidedReport(r, "upload")}>
                        Continue report
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {finalized.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Completed reports</CardTitle>
                  <CardDescription>View download and Drive options for finished runs.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {finalized.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium text-navy">{r.title}</div>
                        <div className="text-xs text-ink-muted">
                          {r.period_start} → {r.period_end} · {labelReportStatus(r.status ?? "sent")}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openGuidedReport(r, "download")}
                      >
                        Open download
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {(showStartReport || reports.length === 0 || drafts.length === 0) && startReportForm}

            {!showStartReport && reports.length > 0 ? (
              <Button variant="outline" onClick={() => setShowStartReport(true)}>
                Start another report
              </Button>
            ) : null}

            {reports.length === 0 && !showStartReport ? (
              <EmptyState
                icon={FileText}
                title="No report runs yet"
                description="Create a report with an explicit reporting period to open guided Step 1."
                actionLabel="Start a report"
                onAction={() => setShowStartReport(true)}
              />
            ) : null}
          </div>
        ) : null}

        {showDownloadWorkspace ? (
          <div className="space-y-5">
            {reportId ? (
              <GuidedStepNav
                propertyId={propertyId}
                reportRunId={reportId}
                unitTypeId={urlUnitTypeId}
                activeStep={urlStep === "preview" ? "preview" : "download"}
                continueLabel={
                  urlStep === "preview" ? "Continue to download" : "Return to property"
                }
              />
            ) : null}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Download and save</CardTitle>
                  <CardDescription>
                    Generate the final PDF when the report is ready, then download it. Google Drive
                    backup is optional.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="report">Selected report</Label>
                  <select
                    id="report"
                    className="h-10 w-full max-w-xl cursor-pointer rounded-md border border-border bg-white px-3 text-sm"
                    value={reportId ?? ""}
                    onChange={(e) => {
                      const next = reports.find((r) => r.id === e.target.value);
                      if (!next) return;
                      setAckMissingWeekly(false);
                      setAckDeferPending(false);
                      openGuidedReport(next, "download");
                    }}
                  >
                    {reports.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title} ({r.period_start} → {r.period_end})
                      </option>
                    ))}
                  </select>
                </div>

                {statusLoading && !status ? (
                  <div className="text-sm text-ink-muted" aria-live="polite">
                    Checking whether this report is ready…
                  </div>
                ) : statusError && !status ? (
                  <div className="rounded-lg border border-border bg-surface-muted/50 p-3 text-sm">
                    <p className="text-ink-muted">{statusError}</p>
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="outline"
                      onClick={() => setStatusTick((n) => n + 1)}
                    >
                      Retry status check
                    </Button>
                  </div>
                ) : status ? (
                  <div className="rounded-lg border border-border bg-surface-muted/50 p-3 text-sm">
                    <div>
                      Report data:{" "}
                      {status.assemblyStatus
                        ? labelAssemblyStatus(status.assemblyStatus)
                        : "—"}
                    </div>
                    <div>
                      Approved buildings in pricing set: {status.eligibleGroupedCount ?? "—"}
                    </div>
                    <div>
                      Narrative:{" "}
                      {status.narrativeStatus
                        ? labelNarrativeStatus(status.narrativeStatus)
                        : "Not started"}
                    </div>
                    <div>
                      Ready for final PDF:{" "}
                      {status.finalization?.ok ||
                      ((ackMissingWeekly ||
                        !status.finalization?.acknowledgeableKeys?.includes("missing_weekly")) &&
                        (ackDeferPending ||
                          !status.finalization?.acknowledgeableKeys?.includes(
                            "defer_pending_comps",
                          )) &&
                        status.finalization?.readyAfterAck)
                        ? "Yes"
                        : "Not yet"}
                    </div>
                    {status.finalization && status.finalization.blockers.length > 0 ? (
                      <ul className="mt-2 list-disc pl-5 text-xs text-ink-muted">
                        {status.finalization.blockers.map((b) => (
                          <li key={b}>{toUserFacingError(b, b)}</li>
                        ))}
                      </ul>
                    ) : null}
                    {status.finalization?.acknowledgeableKeys?.includes("defer_pending_comps") ? (
                      <label className="mt-3 flex items-start gap-2 text-xs text-ink-muted">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={ackDeferPending}
                          onChange={(e) => setAckDeferPending(e.target.checked)}
                        />
                        <span>
                          Leave remaining pending listings out of this report (they stay available
                          to review later).
                        </span>
                      </label>
                    ) : null}
                    {status.finalization?.acknowledgeableKeys?.includes("missing_weekly") ? (
                      <label className="mt-3 flex items-start gap-2 text-xs text-ink-muted">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={ackMissingWeekly}
                          onChange={(e) => setAckMissingWeekly(e.target.checked)}
                        />
                        <span>
                          I understand weekly marketing figures for this period are missing and
                          want to finalize anyway (they will not be invented).
                        </span>
                      </label>
                    ) : null}
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="ghost"
                      onClick={() => setStatusTick((n) => n + 1)}
                    >
                      Refresh status
                    </Button>
                  </div>
                ) : (
                  <div className="text-sm text-ink-muted" aria-live="polite">
                    Select a report to check readiness.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="gold"
                    onClick={() => void finalize()}
                    pending={pending}
                    disabled={
                      !reportId ||
                      !(
                        status?.finalization?.ok ||
                        (Boolean(status?.finalization?.readyAfterAck) &&
                          (!status?.finalization?.acknowledgeableKeys?.includes(
                            "missing_weekly",
                          ) ||
                            ackMissingWeekly) &&
                          (!status?.finalization?.acknowledgeableKeys?.includes(
                            "defer_pending_comps",
                          ) ||
                            ackDeferPending))
                      )
                    }
                  >
                    <Download className="h-4 w-4" />
                    Generate and download final PDF
                  </Button>
                  {drive?.finalPdfStored ? (
                    <Button
                      variant="outline"
                      onClick={() => void downloadFinalPdf()}
                      pending={pending}
                      disabled={!reportId}
                    >
                      Download final PDF
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    onClick={() => void generateDraft()}
                    pending={pending}
                    disabled={!reportId}
                  >
                    Preview draft PDF
                  </Button>
                  {status?.narrativeStatus === "approved" ? (
                    <Button
                      variant="outline"
                      onClick={() => void lockSnapshot()}
                      pending={pending}
                      disabled={!reportId}
                    >
                      Refresh approved version
                    </Button>
                  ) : null}
                </div>
                {message ? (
                  <p className="text-xs text-ink-muted" role="status">
                    {message}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Save to Google Drive
                </CardTitle>
                <CardDescription>
                  Optional backup after the final PDF is stored. You can download the PDF without
                  Google Drive. Set up a folder later and save without regenerating the report.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {drive &&
                !drive.propertyFolderAssigned &&
                drive.reportStatus !== "saved_to_drive" ? (
                  <div
                    className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 space-y-2"
                    role="status"
                  >
                    <p className="font-medium text-navy">Google Drive backup is not set up</p>
                    <p className="text-ink-muted">
                      You can still store the final PDF, mark the report complete, and download it.
                      Choose a backup folder when you are ready, then return here to save this PDF.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        router.push(`/buildings/${propertyId}#property-drive-folder`)
                      }
                    >
                      Set up backup folder
                    </Button>
                  </div>
                ) : null}

                {driveSaving ? (
                  <div
                    className="rounded-lg border border-border bg-surface-muted/50 p-3 text-sm"
                    aria-live="polite"
                  >
                    Saving to Google Drive…
                  </div>
                ) : drive ? (
                  <div className="rounded-lg border border-border bg-surface-muted/50 p-3 space-y-1">
                    <p>
                      Report status:{" "}
                      <span className="font-medium text-navy">
                        {labelReportStatus(drive.reportStatus)}
                      </span>
                    </p>
                    <p>
                      Backup folder:{" "}
                      <span className="font-medium text-navy">
                        {labelDriveFolderStatus(
                          drive.propertyFolderAssigned,
                          drive.propertyFolderName,
                        )}
                      </span>
                    </p>
                    <p>
                      Final PDF: {drive.finalPdfStored ? "Ready" : "Not stored yet"}
                      {drive.snapshotVersion != null ? ` (version ${drive.snapshotVersion})` : ""}
                    </p>
                    {drive.reportStatus === "saved_to_drive" && drive.savedToDriveAt ? (
                      <p>
                        Saved to Google Drive:{" "}
                        {new Date(drive.savedToDriveAt).toLocaleString()}
                        {drive.driveFileName ? ` · ${drive.driveFileName}` : ""}
                      </p>
                    ) : null}
                    {drive.reportStatus === "saved_to_drive" && drive.driveWebViewLink ? (
                      <a
                        href={drive.driveWebViewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-navy underline-offset-2 hover:underline"
                      >
                        Open in Google Drive
                      </a>
                    ) : null}
                    {drive.driveBackupError ? (
                      <p className="text-rose-800" role="status">
                        {toUserFacingError(
                          drive.driveBackupError,
                          "Could not save to Google Drive. You can retry after checking the folder.",
                        )}
                      </p>
                    ) : null}
                    {drive.blockers.length > 0 && drive.reportStatus !== "saved_to_drive" ? (
                      <ul className="list-disc pl-5 text-xs text-ink-muted">
                        {drive.blockers.map((b) => (
                          <li key={b}>{labelDriveBackupBlocker(b)}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-ink-muted">Checking backup status…</p>
                )}

                <div className="flex flex-wrap gap-2">
                  {drive?.reportStatus === "waiting_on_review" ||
                  drive?.reportStatus === "in_progress" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      pending={pending}
                      disabled={!drive?.finalPdfStored}
                      onClick={() => void markFinalized()}
                    >
                      Mark report complete
                    </Button>
                  ) : null}
                  <Button
                    variant="gold"
                    size="sm"
                    pending={pending}
                    disabled={
                      !reportId ||
                      (!drive?.canBackup && drive?.reportStatus !== "saved_to_drive")
                    }
                    onClick={() => void saveToDrive()}
                  >
                    {drive?.reportStatus === "saved_to_drive"
                      ? "Already saved to Google Drive"
                      : drive?.driveBackupError
                        ? "Retry Google Drive backup"
                        : "Save to Google Drive"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      router.push(`/buildings/${propertyId}#property-drive-folder`)
                    }
                  >
                    {drive?.propertyFolderAssigned
                      ? "Open backup folder settings"
                      : "Set up backup folder"}
                  </Button>
                </div>
              </CardContent>
            </Card>

          </div>
        ) : null}
      </div>
    </div>
  );
}
