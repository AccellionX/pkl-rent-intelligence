"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Check,
  FileSpreadsheet,
  FileText,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDemoStore } from "@/store/demo-store";
import {
  parseCsvFile,
  parseExcelFile,
  simulatePdfExtraction,
} from "@/lib/parse-upload";
import { mapParseStatusToUi } from "@/lib/extraction/upload-status";
import { ModeGate } from "@/components/live/mode-gate";
import { GuidedReportChrome } from "@/components/buildings/guided-report-chrome";
import { GuidedStepNav } from "@/components/buildings/guided-step-nav";
import { useLiveOrg } from "@/hooks/use-live-org";
import {
  describeDocumentUploadScope,
  labelDocumentUploadScope,
  resolveUploadWorkspaceMode,
} from "@/lib/reports/report-entry";
import { idempotentHeaders, newIdempotencyKey } from "@/lib/ui/idempotency-key";
import { labelParseStatus } from "@/lib/ui/status-labels";
import { apiErrorMessage, toUserFacingError } from "@/lib/ui/user-facing-error";
import {
  hrefForReviewSurface,
  isComparableCandidateFieldKey,
  labelReviewSurface,
  primaryReviewSurface,
  summarizePendingBySurface,
} from "@/lib/uploads/review-routing";
import {
  DOCUMENT_SLOTS,
  getDocumentSlot,
  resolveSourceTypeForSlot,
  summarizeSlotUploads,
  type DocumentSlotId,
} from "@/lib/uploads/document-slots";
import { createId, sleep } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

type LiveExtraction = {
  id: string;
  field_key: string;
  raw_value: string | null;
  normalized_value: Record<string, unknown> | null;
  review_status: string;
  uncertainty_notes: string | null;
  row_ref: string | null;
};

function UploadContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlBuildingId = searchParams.get("buildingId") ?? "";
  const urlReportId = searchParams.get("reportId") ?? "";
  const urlUnitTypeId = searchParams.get("unitTypeId") ?? "";
  const uploadMode = resolveUploadWorkspaceMode({ urlReportId });
  const isGuidedUpload = uploadMode !== "general";
  /** Arrived from a property (Documents / guided Step 1) — keep that building selected. */
  const fromProperty = Boolean(urlBuildingId);
  const [buildingId, setBuildingId] = useState(urlBuildingId);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  // Customer-facing upload is always live; ModeGate blocks unconfigured/demo.
  const appMode = "live" as const;
  const [selectedSlotId, setSelectedSlotId] = useState<DocumentSlotId | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  // Never default to the first org property — require URL or explicit selection.
  const [propertyId, setPropertyId] = useState(urlBuildingId);
  const [reportRunId, setReportRunId] = useState(urlReportId);
  const [unitTypeId, setUnitTypeId] = useState(urlUnitTypeId);
  const [liveDocumentId, setLiveDocumentId] = useState<string | null>(null);
  const [liveExtractions, setLiveExtractions] = useState<LiveExtraction[]>([]);
  const [liveStatus, setLiveStatus] = useState<string>("pending");
  /** Inline accept/exclude stays collapsed — uploads default to review later. */
  const [reviewNowOpen, setReviewNowOpen] = useState(false);
  const [reviewReason, setReviewReason] = useState("Verified against source file");
  const [matchTier, setMatchTier] = useState<"strongest" | "moderate" | "context">(
    "moderate",
  );
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [liveConflicts, setLiveConflicts] = useState<
    Array<{
      id: string;
      left_source: string;
      right_source: string;
      absolute_delta: number | null;
      status: string;
      left_value: Record<string, unknown>;
      right_value: Record<string, unknown>;
    }>
  >([]);
  const [conflictNote, setConflictNote] = useState("");
  const [chosenRent, setChosenRent] = useState("");
  const [documentCenter, setDocumentCenter] = useState<
    Array<{
      id: string;
      originalFilename: string;
      sourceType: string;
      sourceTypeLabel: string;
      statusLabel: string;
      uploadedAt: string;
      extractedRowCount: number;
      remainingReviewCount: number;
      comparablePendingCount: number;
      primaryReviewLabel: string;
      reviewHref: string;
      parseStatus: string;
      unitTypeId?: string | null;
      reportRunId?: string | null;
    }>
  >([]);
  const [preview, setPreview] = useState<{
    columns: string[];
    rows: Record<string, string | number>[];
    summary: string;
  } | null>(null);
  const uploads = useDemoStore((s) => s.uploads);
  const addUpload = useDemoStore((s) => s.addUpload);
  const updateUpload = useDemoStore((s) => s.updateUpload);
  const liveOrg = useLiveOrg();
  const [liveProperties, setLiveProperties] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [liveUnitTypes, setLiveUnitTypes] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [liveReports, setLiveReports] = useState<
    Array<{ id: string; title: string; period_end: string | null }>
  >([]);

  useEffect(() => {
    // Keep guided upload locked to URL context across refresh / resume.
    queueMicrotask(() => {
      if (urlBuildingId) {
        setBuildingId(urlBuildingId);
        setPropertyId(urlBuildingId);
      }
      if (urlReportId) setReportRunId(urlReportId);
      if (urlUnitTypeId) setUnitTypeId(urlUnitTypeId);
    });
  }, [urlBuildingId, urlReportId, urlUnitTypeId]);

  useEffect(() => {
    if (!liveOrg.organizationId) return;
    const orgId = liveOrg.organizationId;
    let cancelled = false;
    fetch(`/api/properties?organizationId=${orgId}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.ok) return;
        const props = (json.data.properties ?? []) as Array<{ id: string; name: string }>;
        setLiveProperties(props.map((p) => ({ id: p.id, name: p.name })));
        setOrganizationId((prev) => prev || orgId);
        // Prefer the property from the URL (Documents / report Step 1).
        // Never fall back to props[0] when the URL has no buildingId.
        if (urlBuildingId && props.some((p) => p.id === urlBuildingId)) {
          setPropertyId(urlBuildingId);
          setBuildingId(urlBuildingId);
        }
      })
      .catch(() => {
        if (!cancelled) setLiveProperties([]);
      });
    return () => {
      cancelled = true;
    };
  }, [appMode, liveOrg.organizationId, urlBuildingId]);

  function refreshDocumentCenter(pid: string) {
    fetch(`/api/properties/${pid}/documents`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) return;
        setDocumentCenter(json.data.documents ?? []);
      })
      .catch(() => {
        /* non-blocking */
      });
  }

  useEffect(() => {
    if (!propertyId) {
      queueMicrotask(() => {
        setLiveUnitTypes([]);
        setLiveReports([]);
        setDocumentCenter([]);
      });
      return;
    }
    let cancelled = false;
    refreshDocumentCenter(propertyId);
    fetch(`/api/properties/${propertyId}/unit-types`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.ok) return;
        const uts = (json.data.unitTypes ?? []) as Array<{ id: string; label: string }>;
        setLiveUnitTypes(uts.map((u) => ({ id: u.id, label: u.label })));
        // Guided mode keeps URL unit type; general mode waits for explicit choice.
        if (!isGuidedUpload) {
          setUnitTypeId((prev) => (prev && uts.some((u) => u.id === prev) ? prev : ""));
        }
      })
      .catch(() => {
        if (!cancelled) setLiveUnitTypes([]);
      });
    fetch(`/api/properties/${propertyId}/reports`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.ok) return;
        const reports = (json.data.reports ?? []) as Array<{
          id: string;
          title: string;
          period_end: string | null;
        }>;
        setLiveReports(
          reports.map((r) => ({
            id: r.id,
            title: r.title,
            period_end: r.period_end,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setLiveReports([]);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, isGuidedUpload]);

  const selectedPropertyName = useMemo(
    () => liveProperties.find((p) => p.id === propertyId)?.name ?? "",
    [liveProperties, propertyId],
  );
  const activeReportMeta = useMemo(
    () => liveReports.find((r) => r.id === reportRunId) ?? null,
    [liveReports, reportRunId],
  );
  /** Avoid painting guided form placeholders before property/report labels resolve. */
  const guidedLabelsReady =
    !isGuidedUpload ||
    Boolean(
      propertyId &&
        reportRunId &&
        selectedPropertyName &&
        activeReportMeta &&
        liveProperties.length > 0,
    );
  const unitTypeLabelById = useMemo(() => {
    const map = new Map(liveUnitTypes.map((u) => [u.id, u.label]));
    return map;
  }, [liveUnitTypes]);
  const reportTitleById = useMemo(() => {
    const map = new Map(liveReports.map((r) => [r.id, r.title]));
    return map;
  }, [liveReports]);

  const buildingOptions = useMemo(
    () => [] as Array<{ id: string; name: string; isFeatured?: boolean }>,
    [],
  );

  async function handleDemoFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "xlsx", "xls", "csv"].includes(ext)) {
      toast.error("Supported formats: PDF, Excel, CSV");
      return;
    }

    const fileType = ext === "pdf" ? "pdf" : ext === "csv" ? "csv" : "xlsx";
    const uploadId = createId("up");
    addUpload({
      id: uploadId,
      fileName: file.name,
      fileType,
      uploadedAt: new Date().toISOString(),
      buildingId,
      status: "processing",
      extractedFields: {},
      confidence: 0,
    });

    setProcessing(true);
    setProgress(12);
    setPreview(null);

    try {
      const tick = window.setInterval(() => {
        setProgress((p) => Math.min(p + 11, 88));
      }, 180);

      await sleep(700);

      let result;
      if (fileType === "csv") result = await parseCsvFile(file);
      else if (fileType === "xlsx") result = await parseExcelFile(file);
      else result = await simulatePdfExtraction(file);

      clearInterval(tick);
      setProgress(100);
      await sleep(250);

      updateUpload(uploadId, {
        status: "complete",
        extractedFields: result.extractedFields,
        confidence: result.confidence,
      });
      setPreview({
        columns: result.columns,
        rows: result.rows.slice(0, 8),
        summary: result.summary,
      });
      toast.success(
        fileType === "pdf"
          ? "File uploaded successfully."
          : "Your file is ready for review.",
        { description: result.summary },
      );
    } catch (err) {
      console.error(err);
      updateUpload(uploadId, { status: "failed", confidence: 0 });
      toast.error("Could not process file");
    } finally {
      setProcessing(false);
      setTimeout(() => setProgress(0), 600);
    }
  }

  async function handleLiveFile(file: File) {
    if (!organizationId || !propertyId) {
      toast.error("Select a property before uploading");
      return;
    }
    if (!selectedSlotId) {
      toast.error("Choose which document type you are uploading");
      return;
    }
    if (processing) return;

    const sourceType = resolveSourceTypeForSlot(selectedSlotId, file.name);
    const slotLabel = getDocumentSlot(selectedSlotId).label;

    setProcessing(true);
    setProgress(15);
    setLiveStatus("uploading");
    setLiveExtractions([]);
    setPreview(null);
    const idempotencyKey = newIdempotencyKey();

    try {
      const form = new FormData();
      form.set("file", file);
      form.set("sourceType", sourceType);
      form.set("organizationId", organizationId.trim());
      form.set("propertyId", propertyId.trim());
      if (reportRunId.trim()) form.set("reportRunId", reportRunId.trim());
      if (unitTypeId.trim()) form.set("unitTypeId", unitTypeId.trim());

      setProgress(45);
      setLiveStatus("processing");

      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: idempotentHeaders(idempotencyKey),
        body: form,
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(apiErrorMessage(json, "Upload failed"));
      }

      setProgress(100);
      setLiveDocumentId(json.data.document.id);
      setLiveStatus(mapParseStatusToUi(json.data.document.parse_status));
      setLiveExtractions(json.data.extractions ?? []);
      setReviewNowOpen(false);
      refreshDocumentCenter(propertyId.trim());

      const isHello = sourceType === "hellodata_pdf";
      const isMls =
        sourceType === "mls_ri_pdf" || sourceType === "mls_ct_pdf";
      const candidateRows = (json.data.extractions as LiveExtraction[])
        .filter((e) =>
          isHello
            ? e.field_key.startsWith("hellodata.comp.")
            : isMls
              ? e.field_key.startsWith("mls.listing.")
              : e.field_key.startsWith("candidate."),
        )
        .slice(0, 12)
        .map((e) => {
          const n = (e.normalized_value ?? {}) as Record<string, unknown>;
          const address = n.address as { raw?: string } | null;
          const match = n.match as { confidence?: string } | undefined;
          return {
            row: e.row_ref ?? "",
            name: String(n.name ?? ""),
            address: address?.raw ?? "",
            rent: String(n.rent ?? ""),
            match: match?.confidence ?? "",
            status: e.review_status,
            notes: e.uncertainty_notes ?? "",
          };
        });

      const conflictCount = json.data.parseSummary.conflictCount ?? 0;
      const candidateCount =
        json.data.parseSummary.candidateCount ??
        (json.data.parseSummary.matchSummary
          ? Object.values(
              json.data.parseSummary.matchSummary as Record<string, number>,
            ).reduce((a: number, b) => a + Number(b), 0)
          : candidateRows.length);

      setPreview({
        columns: isHello
          ? ["row", "name", "address", "match", "status", "notes"]
          : ["row", "address", "rent", "match", "status", "notes"],
        rows: candidateRows,
        summary: `Saved ${json.data.parseSummary.extractionCount} extracted item${
          json.data.parseSummary.extractionCount === 1 ? "" : "s"
        }${candidateCount ? ` · ${candidateCount} ready for review later` : ""}${
          conflictCount ? ` · ${conflictCount} rent differences to verify` : ""
        }`,
      });

      if (propertyId.trim()) {
        const conflictsRes = await fetch(
          `/api/properties/${propertyId.trim()}/conflicts?status=pending`,
        );
        const conflictsJson = await conflictsRes.json();
        if (conflictsRes.ok && conflictsJson.ok) {
          setLiveConflicts(conflictsJson.data.conflicts ?? []);
        }
      }

      toast.success(`${slotLabel} uploaded`, {
        description:
          "Saved for review later. Choose the next document type, or continue when ready.",
      });

      // Advance to the next missing slot so staff can keep going without re-picking.
      const slotStatuses = summarizeSlotUploads({
        documents: documentCenter,
        reportRunId,
      });
      const nextMissing = DOCUMENT_SLOTS.find((slot) => {
        if (slot.id === selectedSlotId) return false;
        const status = slotStatuses.find((s) => s.slotId === slot.id);
        return !status?.uploaded;
      });
      if (nextMissing) setSelectedSlotId(nextMissing.id);
    } catch (err) {
      console.error(err);
      setLiveStatus("failed");
      toast.error(toUserFacingError(err, "Upload failed"), {
        description: "The failed file is kept for audit. Fix the export and upload again to retry.",
      });
    } finally {
      setProcessing(false);
      setTimeout(() => setProgress(0), 600);
    }
  }

  async function handleFile(file: File) {
    if (appMode === "live") {
      await handleLiveFile(file);
      return;
    }
    await handleDemoFile(file);
  }

  async function submitReview(
    extractionId: string,
    decision: "accepted" | "rejected",
    tierOverride?: "strongest" | "moderate" | "context",
  ) {
    if (reviewBusyId) {
      toast.message("Still saving the previous decision — try again in a moment.");
      return;
    }
    setReviewBusyId(extractionId);
    try {
      const response = await fetch(`/api/extractions/${extractionId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          reason: reviewReason || "Reviewed in upload workspace",
          unitTypeId: unitTypeId.trim() || undefined,
          matchTier:
            decision === "accepted" ? (tierOverride ?? matchTier) : undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error?.message ?? "Review failed");
      }
      setLiveExtractions((prev) =>
        prev.map((e) =>
          e.id === extractionId
            ? { ...e, review_status: json.data.extraction.review_status }
            : e,
        ),
      );
      toast.success(decision === "accepted" ? "Accepted." : "Excluded.");
    } catch (err) {
      toast.error(toUserFacingError(err, "Review failed"));
    } finally {
      setReviewBusyId(null);
    }
  }

  async function resolveConflict(conflictId: string) {
    if (reviewBusyId) {
      toast.message("Still saving the previous decision — try again in a moment.");
      return;
    }
    const rent = Number(chosenRent);
    if (!Number.isFinite(rent) || rent <= 0) {
      toast.error("Enter a positive verified rent to resolve");
      return;
    }
    if (!conflictNote.trim()) {
      toast.error("Reviewer note is required");
      return;
    }
    setReviewBusyId(conflictId);
    try {
      const response = await fetch(`/api/conflicts/${conflictId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "resolved",
          chosenRent: rent,
          reviewerNote: conflictNote.trim(),
          verifiedListingSource: "manual verification",
          verifiedAt: new Date().toISOString().slice(0, 10),
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error?.message ?? "Conflict resolve failed");
      }
      setLiveConflicts((prev) => prev.filter((c) => c.id !== conflictId));
      toast.success("Conflict resolved — draft KPIs will exclude unresolved rows only");
    } catch (err) {
      toast.error(toUserFacingError(err, "Could not resolve conflict"));
    } finally {
      setReviewBusyId(null);
    }
  }

  const reviewableCandidates = liveExtractions.filter((e) =>
    isComparableCandidateFieldKey(e.field_key),
  );
  const pendingBySurface = summarizePendingBySurface(
    liveExtractions
      .filter((e) => e.review_status === "pending")
      .map((e) => ({ field_key: e.field_key })),
  );
  const nonComparablePending = liveExtractions.filter(
    (e) =>
      e.review_status === "pending" && !isComparableCandidateFieldKey(e.field_key),
  );

  const slotStatuses = useMemo(
    () =>
      summarizeSlotUploads({
        documents: documentCenter,
        reportRunId,
      }),
    [documentCenter, reportRunId],
  );
  const uploadedSlotCount = slotStatuses.filter((s) => s.uploaded).length;
  const selectedSlot = selectedSlotId ? getDocumentSlot(selectedSlotId) : null;
  const selectedSlotStatus = selectedSlotId
    ? slotStatuses.find((s) => s.slotId === selectedSlotId) ?? null
    : null;

  useEffect(() => {
    if (selectedSlotId || !propertyId) return;
    const firstMissing = slotStatuses.find((s) => !s.uploaded)?.slotId ?? DOCUMENT_SLOTS[0]?.id;
    if (firstMissing) setSelectedSlotId(firstMissing);
  }, [propertyId, selectedSlotId, slotStatuses]);

  return (
    <div>
      <Topbar
        title={isGuidedUpload ? "Upload documents" : "Data Uploads"}
        subtitle={
          isGuidedUpload
            ? "Step 1 of your weekly report — upload sources for this property and period"
            : "Manage property documents outside an active weekly report"
        }
      />
      <div className="px-6 py-5">
        <Breadcrumbs
          items={
            (isGuidedUpload || fromProperty) && propertyId
              ? [
                  { label: "Dashboard", href: "/" },
                  { label: "Properties", href: "/buildings" },
                  {
                    label: selectedPropertyName || "Property",
                    href: `/buildings/${propertyId}`,
                  },
                  { label: isGuidedUpload ? "Upload" : "Documents" },
                ]
              : [{ label: "Dashboard", href: "/" }, { label: "Data Uploads" }]
          }
        />
        {isGuidedUpload && propertyId ? (
          <GuidedReportChrome
            propertyId={propertyId}
            defaultStep="upload"
            requireReportId
          />
        ) : (
          <div className="mb-5 rounded-xl border border-border bg-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
              Document library
            </div>
            <h2 className="mt-1 font-display text-xl font-semibold text-navy">
              {propertyId
                ? selectedPropertyName || (fromProperty ? "Loading property…" : "Selected property")
                : "Choose a property to continue"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              {propertyId
                ? fromProperty
                  ? "This property was selected from the property page. Upload files here, or start a weekly report when you are ready."
                  : "Upload property-level files or attach them to a weekly report. This is not an active report workspace until you start or continue a report."
                : "Select a property below. We will not assume one for you."}
            </p>
            {propertyId ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="gold">
                  <Link href={`/buildings/${propertyId}/reports`}>
                    Start or continue report
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/buildings/${propertyId}`}>Open property setup</Link>
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {isGuidedUpload && propertyId && reportRunId ? (
          <GuidedStepNav
            propertyId={propertyId}
            reportRunId={reportRunId}
            unitTypeId={unitTypeId || null}
            activeStep="upload"
            continueLabel="Continue to comparable review"
            continueHint={
              documentCenter.some((d) => d.remainingReviewCount > 0)
                ? "Uploads are saved. Review comparables next — you can finish accepting listings there."
                : uploadedSlotCount >= DOCUMENT_SLOTS.length
                  ? "All six document types are uploaded. Continue when you are ready."
                  : uploadedSlotCount > 0 || liveDocumentId
                    ? `${uploadedSlotCount} of ${DOCUMENT_SLOTS.length} document types uploaded. You can continue or finish the checklist.`
                    : "Choose each document type below and upload the matching file, then continue."
            }
          />
        ) : null}

        <div className="mb-4 flex flex-wrap gap-2">
          <Badge variant="outline">Rent conflicts over $25 need verification</Badge>
          <Badge variant="outline">You can leave and resume review anytime</Badge>
          {isGuidedUpload ? (
            <Badge variant="outline">Uploads stay on this report property</Badge>
          ) : (
            <Badge variant="outline">Property library uploads can be reused later</Badge>
          )}
        </div>

        {isGuidedUpload && !guidedLabelsReady ? (
          <div
            className="mb-5 space-y-3 rounded-xl border border-border bg-white p-4 shadow-sm"
            aria-busy="true"
          >
            <div className="h-10 animate-pulse rounded-md bg-surface-muted/60" />
            <div className="h-40 animate-pulse rounded-md bg-surface-muted/40" />
            <p className="text-xs text-ink-muted">Preparing upload workspace for this report…</p>
          </div>
        ) : null}

        <div
          className={`grid gap-6 lg:grid-cols-5 ${
            isGuidedUpload && !guidedLabelsReady ? "hidden" : ""
          }`}
        >
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>
                {appMode === "live" ? "Upload documents" : "Upload comps or unit schedule"}
              </CardTitle>
              <CardDescription>
                {appMode === "live"
                  ? "Choose each document type, upload the matching file, and watch the checklist mark complete. This helps avoid missing or mislabeled sources."
                  : "Drop a PDF for simulated extraction, or CSV/Excel for real parsing"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {appMode === "live" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-2 text-sm font-medium">Organization</div>
                    <Input
                      value={
                        liveOrg.organizations.find(
                          (o) => o.id === (organizationId || liveOrg.organizationId),
                        )?.name ?? ""
                      }
                      placeholder="Loading organization…"
                      readOnly
                    />
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-medium">Property</div>
                    {isGuidedUpload ? (
                      <Input
                        value={selectedPropertyName}
                        readOnly
                        aria-label="Property locked to this report"
                      />
                    ) : fromProperty && propertyId ? (
                      <div className="space-y-2">
                        <Input
                          value={selectedPropertyName || "Loading property…"}
                          readOnly
                          aria-label="Property selected from property page"
                        />
                        <button
                          type="button"
                          className="text-xs font-medium text-navy underline-offset-2 hover:underline"
                          onClick={() => {
                            setPropertyId("");
                            setBuildingId("");
                            setUnitTypeId("");
                            setReportRunId("");
                            setDocumentCenter([]);
                            router.replace("/upload");
                          }}
                        >
                          Choose a different property
                        </button>
                      </div>
                    ) : (
                      <Select
                        value={propertyId || undefined}
                        onValueChange={(v) => {
                          setPropertyId(v);
                          setBuildingId(v);
                          setUnitTypeId("");
                          setReportRunId("");
                          router.replace(`/upload?buildingId=${encodeURIComponent(v)}`);
                        }}
                        disabled={processing}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a property" />
                        </SelectTrigger>
                        <SelectContent>
                          {propertyId &&
                          !liveProperties.some((p) => p.id === propertyId) ? (
                            <SelectItem value={propertyId}>
                              Loading property…
                            </SelectItem>
                          ) : null}
                          {liveProperties.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-medium">
                      {isGuidedUpload ? "Unit type" : "Unit type (optional)"}
                    </div>
                    {isGuidedUpload ? (
                      <Input
                        value={unitTypeLabelById.get(unitTypeId) || ""}
                        readOnly
                      />
                    ) : (
                      <Select
                        value={unitTypeId || undefined}
                        onValueChange={setUnitTypeId}
                        disabled={processing || !propertyId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select unit type" />
                        </SelectTrigger>
                        <SelectContent>
                          {liveUnitTypes.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <div className="mb-2 text-sm font-medium">
                      {isGuidedUpload ? "Report" : "Attach to report (optional)"}
                    </div>
                    {isGuidedUpload ? (
                      <Input
                        value={
                          activeReportMeta
                            ? `${activeReportMeta.title}${
                                activeReportMeta.period_end
                                  ? ` · through ${activeReportMeta.period_end}`
                                  : ""
                              }`
                            : ""
                        }
                        readOnly
                      />
                    ) : (
                      <Select
                        value={reportRunId || "__none__"}
                        onValueChange={(v) =>
                          setReportRunId(v === "__none__" ? "" : v)
                        }
                        disabled={processing || !propertyId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="None — property-level upload" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            None — property-level upload
                          </SelectItem>
                          {liveReports.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.title}
                              {r.period_end ? ` · ${r.period_end}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-2 text-sm font-medium">Associate with building</div>
                  <Select value={buildingId} onValueChange={setBuildingId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select building" />
                    </SelectTrigger>
                    <SelectContent>
                      {buildingOptions.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                          {b.isFeatured ? " ★" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {appMode === "live" ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-navy">Document checklist</div>
                      <p className="text-xs text-ink-muted">
                        Select a type, then upload that file. Uploaded types stay checked so you can
                        see what is still missing.
                      </p>
                    </div>
                    <Badge variant={uploadedSlotCount === DOCUMENT_SLOTS.length ? "success" : "outline"}>
                      {uploadedSlotCount} of {DOCUMENT_SLOTS.length} uploaded
                    </Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {DOCUMENT_SLOTS.map((slot) => {
                      const status = slotStatuses.find((s) => s.slotId === slot.id);
                      const selected = selectedSlotId === slot.id;
                      const uploaded = Boolean(status?.uploaded);
                      const failed = Boolean(status?.failed);
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          disabled={processing}
                          onClick={() => setSelectedSlotId(slot.id)}
                          className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                            selected
                              ? "border-gold bg-gold/10"
                              : uploaded
                                ? "border-emerald-200 bg-emerald-50/60 hover:border-emerald-300"
                                : failed
                                  ? "border-rose-200 bg-rose-50/50 hover:border-rose-300"
                                  : "border-border bg-white hover:border-gold/40"
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                              uploaded
                                ? "bg-emerald-600 text-white"
                                : failed
                                  ? "bg-rose-600 text-white"
                                  : selected
                                    ? "border-2 border-gold bg-white"
                                    : "border border-border bg-surface-muted/40"
                            }`}
                            aria-hidden
                          >
                            {uploaded ? (
                              <Check className="h-3 w-3" />
                            ) : failed ? (
                              <AlertCircle className="h-3 w-3" />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-navy">{slot.label}</span>
                            <span className="mt-0.5 block text-xs text-ink-muted">
                              {uploaded && status?.document
                                ? status.document.originalFilename
                                : failed && status?.document
                                  ? `Upload failed · ${status.document.originalFilename}`
                                  : slot.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {appMode === "live" && !selectedSlot ? (
                <div className="rounded-xl border border-dashed border-border bg-surface/40 px-6 py-10 text-center">
                  <UploadCloud className="mx-auto mb-3 h-8 w-8 text-ink-subtle" />
                  <div className="font-medium text-navy">Select a document type above</div>
                  <p className="mt-1 text-sm text-ink-muted">
                    The upload button appears after you choose which file you are adding.
                  </p>
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (selectedSlot || appMode !== "live") setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (appMode === "live" && !selectedSlot) {
                      toast.error("Choose which document type you are uploading");
                      return;
                    }
                    const file = e.dataTransfer.files?.[0];
                    if (file) void handleFile(file);
                  }}
                  className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
                    dragging
                      ? "border-gold bg-gold/10"
                      : "border-border bg-surface/60 hover:border-gold/40"
                  }`}
                >
                  <UploadCloud className="mb-3 h-8 w-8 text-navy" />
                  <div className="font-medium text-navy">
                    {selectedSlot
                      ? selectedSlotStatus?.uploaded
                        ? `Replace ${selectedSlot.label}`
                        : `Upload ${selectedSlot.label}`
                      : "Drop a file here"}
                  </div>
                  <p className="mt-1 max-w-sm text-sm text-ink-muted">
                    {selectedSlot
                      ? `${selectedSlot.description}. Only this document type will be saved.`
                      : "PDF · XLSX · CSV. Files are stored privately for your organization."}
                  </p>
                  {selectedSlotStatus?.uploaded && selectedSlotStatus.document ? (
                    <p className="mt-2 text-xs text-emerald-800">
                      Current file: {selectedSlotStatus.document.originalFilename}
                    </p>
                  ) : null}
                  <div className="mt-4">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={selectedSlot?.accept ?? ".pdf,.xlsx,.xls,.csv"}
                      className="hidden"
                      disabled={processing || (appMode === "live" && !selectedSlot)}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleFile(file);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="gold"
                      pending={processing}
                      disabled={appMode === "live" && !selectedSlot}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {selectedSlot
                        ? selectedSlotStatus?.uploaded
                          ? `Replace ${selectedSlot.label}`
                          : `Upload ${selectedSlot.label}`
                        : "Browse files"}
                    </Button>
                  </div>
                </div>
              )}

              {processing && (
                <div className="space-y-2 rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-navy">
                    <Sparkles className="h-4 w-4 text-gold" />
                    {progress < 90 ? "Extracting structured fields…" : "Finalizing…"}
                  </div>
                  <Progress value={progress} />
                  {appMode === "live" && (
                    <div className="text-xs text-ink-muted">
                      Status: {mapParseStatusToUi(liveStatus, liveStatus as "uploading" | "processing" | undefined)}
                    </div>
                  )}
                </div>
              )}

              {preview && (
                <div className="space-y-3 rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-navy" />
                    <span className="text-sm font-medium">{preview.summary}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-left text-xs">
                      <thead className="border-b border-border text-ink-subtle">
                        <tr>
                          {preview.columns.map((c) => (
                            <th key={c} className="px-2 py-1.5 font-medium">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row, idx) => (
                          <tr key={idx} className="border-b border-border/60">
                            {preview.columns.map((c) => (
                              <td key={c} className="px-2 py-1.5">
                                {String(row[c] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {appMode === "live" &&
                liveDocumentId &&
                (reviewableCandidates.length > 0 ||
                  nonComparablePending.length > 0 ||
                  liveConflicts.length > 0) && (
                  <div className="space-y-3 rounded-lg border border-border bg-surface/40 p-4">
                    <div className="text-sm font-medium text-navy">
                      Saved for review later
                    </div>
                    <p className="text-sm text-ink-muted">
                      This file is stored and ready when you need it. Keep uploading more
                      sources, or review now if you want to work through it immediately.
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-ink-muted">
                      {reviewableCandidates.length > 0 ? (
                        <li>
                          {reviewableCandidates.length} comparable candidate
                          {reviewableCandidates.length === 1 ? "" : "s"} ·{" "}
                          {labelReviewSurface("comparable_candidates")}
                        </li>
                      ) : null}
                      {(
                        Object.entries(pendingBySurface) as Array<
                          [keyof typeof pendingBySurface, number]
                        >
                      )
                        .filter(
                          ([surface, n]) =>
                            n > 0 && surface !== "comparable_candidates",
                        )
                        .map(([surface, n]) => (
                          <li key={surface}>
                            {n} · {labelReviewSurface(surface)}
                          </li>
                        ))}
                      {liveConflicts.length > 0 ? (
                        <li>
                          {liveConflicts.length} rent difference
                          {liveConflicts.length === 1 ? "" : "s"} to verify
                        </li>
                      ) : null}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="gold"
                        type="button"
                        onClick={() => {
                          setLiveDocumentId(null);
                          setLiveExtractions([]);
                          setLiveConflicts([]);
                          setPreview(null);
                          setReviewNowOpen(false);
                        }}
                      >
                        Keep uploading
                      </Button>
                      {reviewableCandidates.length > 0 ||
                      nonComparablePending.length > 0 ? (
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={hrefForReviewSurface({
                              propertyId,
                              surface:
                                reviewableCandidates.length > 0
                                  ? "comparable_candidates"
                                  : primaryReviewSurface(pendingBySurface),
                              documentId: liveDocumentId,
                              reportRunId: reportRunId || null,
                              unitTypeId: unitTypeId || null,
                            })}
                          >
                            Review now
                          </Link>
                        </Button>
                      ) : null}
                      {reviewableCandidates.length > 0 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          onClick={() => setReviewNowOpen((open) => !open)}
                        >
                          {reviewNowOpen ? "Hide quick review" : "Quick review here"}
                        </Button>
                      ) : null}
                    </div>

                    {reviewNowOpen && reviewableCandidates.length > 0 ? (
                      <div className="space-y-3 border-t border-border pt-3">
                        <p className="text-xs text-ink-muted">
                          Optional quick review on this page. You can also leave and finish
                          later from Document center.
                        </p>
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <div className="mb-1 text-xs font-medium">Match tier (on accept)</div>
                            <Select
                              value={matchTier}
                              onValueChange={(v) =>
                                setMatchTier(v as "strongest" | "moderate" | "context")
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="strongest">Strongest</SelectItem>
                                <SelectItem value="moderate">Moderate</SelectItem>
                                <SelectItem value="context">Context</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <div className="mb-1 text-xs font-medium">Review reason</div>
                            <Textarea
                              value={reviewReason}
                              onChange={(e) => setReviewReason(e.target.value)}
                              placeholder="Review reason"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          {reviewableCandidates.slice(0, 40).map((e) => {
                            const n = (e.normalized_value ?? {}) as {
                              name?: string;
                              address?: { raw?: string; line1?: string };
                              rent?: number;
                              sqft?: number | null;
                              distanceMiles?: number | null;
                              distanceFlagged?: boolean;
                              photoCount?: number;
                              mlsNumber?: string | null;
                              includeAsCompCandidate?: boolean;
                              match?: { confidence?: string };
                              unitTypes?: Array<{
                                unitTypeLabel: string;
                                available: boolean;
                              }>;
                            };
                            const missingUnit = n.unitTypes?.find((u) => !u.available);
                            const sourceBadge = e.field_key.startsWith("hellodata.")
                              ? "HelloData"
                              : e.field_key.startsWith("mls.listing.")
                                ? "MLS"
                                : "Rentometer";
                            const label =
                              n.name ?? n.address?.line1 ?? n.address?.raw ?? e.field_key;
                            return (
                              <div
                                key={e.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 px-3 py-2 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="font-medium text-navy">{label}</span>
                                    <Badge variant="outline">{sourceBadge}</Badge>
                                    {n.mlsNumber ? (
                                      <Badge variant="outline">MLS# {n.mlsNumber}</Badge>
                                    ) : null}
                                  </div>
                                  <div className="text-ink-muted">
                                    Rent {n.rent ?? "—"}
                                    {n.sqft != null ? ` · ${n.sqft} sqft` : ""}
                                    {` · ${e.review_status}`}
                                    {missingUnit
                                      ? ` · No ${missingUnit.unitTypeLabel} available`
                                      : ""}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    pending={reviewBusyId === e.id}
                                    disabled={
                                      e.review_status === "accepted" ||
                                      (reviewBusyId != null && reviewBusyId !== e.id)
                                    }
                                    onClick={() => void submitReview(e.id, "accepted")}
                                  >
                                    Accept
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    pending={reviewBusyId === e.id}
                                    disabled={
                                      e.review_status === "rejected" ||
                                      (reviewBusyId != null && reviewBusyId !== e.id)
                                    }
                                    onClick={() => void submitReview(e.id, "rejected")}
                                  >
                                    Exclude
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {liveConflicts.length > 0 ? (
                          <div className="space-y-2 border-t border-border pt-3">
                            <div className="text-sm font-medium text-navy">
                              Rent differences ({liveConflicts.length})
                            </div>
                            <Input
                              value={chosenRent}
                              onChange={(e) => setChosenRent(e.target.value)}
                              placeholder="Verified rent"
                            />
                            <Textarea
                              value={conflictNote}
                              onChange={(e) => setConflictNote(e.target.value)}
                              placeholder="Reviewer note (required)"
                            />
                            {liveConflicts.map((c) => {
                              const leftRent = (c.left_value as { rent?: number }).rent;
                              const rightRent = (c.right_value as { rent?: number }).rent;
                              return (
                                <div
                                  key={c.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 px-3 py-2 text-xs"
                                >
                                  <div>
                                    <div className="font-medium text-navy">
                                      {c.left_source} ${leftRent ?? "—"} vs {c.right_source} $
                                      {rightRent ?? "—"}
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    pending={reviewBusyId === c.id}
                                    disabled={reviewBusyId != null && reviewBusyId !== c.id}
                                    onClick={() => void resolveConflict(c.id)}
                                  >
                                    Resolve
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Document center</CardTitle>
              <CardDescription>
                {propertyId
                  ? `Files for ${selectedPropertyName || "this property"} only. Leave anytime and resume review without uploading again.`
                  : "Select a property to see its uploaded documents."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {appMode === "live" && liveDocumentId ? (
                <div className="rounded-lg border border-border p-3">
                  <div className="text-sm font-medium text-navy">Latest upload</div>
                  <div className="mt-1 text-xs text-ink-muted">
                    Status: {labelParseStatus(liveStatus)}
                  </div>
                  <div className="mt-2 text-xs text-ink-muted">
                    {reviewableCandidates.length > 0
                      ? `${reviewableCandidates.length} comparable candidate(s) ready for review`
                      : nonComparablePending.length > 0
                        ? `${nonComparablePending.length} item(s) imported — open the linked review area above`
                        : `${liveExtractions.length} extracted row(s) stored`}
                  </div>
                </div>
              ) : null}

              {appMode === "live" ? (
                !propertyId ? (
                  <EmptyState
                    icon={FileText}
                    title="No property selected"
                    description="Choose a property to view its document library. Documents from other properties stay separate."
                  />
                ) : documentCenter.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title="No documents yet"
                    description="Upload Rentometer, HelloData, MLS, Zillow, or Apartments.com exports for this property."
                  />
                ) : (
                  documentCenter.map((doc) => {
                    const scope = labelDocumentUploadScope({
                      documentReportRunId: doc.reportRunId,
                      activeReportRunId: reportRunId || null,
                      activeReportTitle: activeReportMeta?.title,
                      otherReportTitle: reportTitleById.get(
                        String(doc.reportRunId ?? ""),
                      ),
                    });
                    const scopeLabel = describeDocumentUploadScope({
                      scope,
                      activeReportTitle: activeReportMeta?.title,
                      otherReportTitle: reportTitleById.get(
                        String(doc.reportRunId ?? ""),
                      ),
                      periodLabel: activeReportMeta?.period_end
                        ? `through ${activeReportMeta.period_end}`
                        : null,
                    });
                    const unitLabel = unitTypeLabelById.get(
                      String(doc.unitTypeId ?? ""),
                    );
                    return (
                    <div key={doc.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-navy">
                            {doc.originalFilename}
                          </div>
                          <div className="mt-1 text-xs text-ink-muted">
                            {doc.sourceTypeLabel}
                            {selectedPropertyName ? ` · ${selectedPropertyName}` : ""}
                            {unitLabel ? ` · ${unitLabel}` : ""}
                            {" · "}
                            {new Date(doc.uploadedAt).toLocaleString()}
                          </div>
                          <div className="mt-1 text-xs text-ink-muted">{scopeLabel}</div>
                          <div className="mt-1 text-xs text-ink-muted">
                            {doc.extractedRowCount} extracted · {doc.remainingReviewCount}{" "}
                            remaining to review
                          </div>
                          {doc.remainingReviewCount > 0 ? (
                            <div className="mt-1 text-xs text-ink-muted">
                              Review in: {doc.primaryReviewLabel}
                            </div>
                          ) : null}
                        </div>
                        <Badge
                          variant={
                            doc.parseStatus === "failed"
                              ? "danger"
                              : doc.remainingReviewCount > 0
                                ? "warning"
                                : "success"
                          }
                        >
                          {doc.statusLabel}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {doc.remainingReviewCount > 0 ? (
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={
                                doc.reviewHref?.startsWith("/buildings/")
                                  ? doc.reviewHref
                                  : `/buildings/${propertyId}`
                              }
                            >
                              {doc.comparablePendingCount > 0
                                ? "Continue review"
                                : "Review information"}
                            </Link>
                          </Button>
                        ) : (
                          <Button asChild size="sm" variant="ghost">
                            <Link
                              href={
                                doc.reviewHref?.startsWith("/buildings/")
                                  ? doc.reviewHref
                                  : `/buildings/${propertyId}`
                              }
                            >
                              View details
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                    );
                  })
                )
              ) : uploads.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No uploads yet"
                  description="Upload a CSV of comps or a PDF pricing packet to see extracted fields."
                />
              ) : (
                uploads.map((u) => (
                  <div key={u.id} className="rounded-lg border border-border p-3">
                    <div className="truncate text-sm font-medium text-navy">
                      {u.fileName}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

export default function UploadPage() {
  return (
    <ModeGate>
      <Suspense fallback={<div className="p-6 text-sm text-ink-muted">Loading upload…</div>}>
        <UploadContent />
      </Suspense>
    </ModeGate>
  );
}
