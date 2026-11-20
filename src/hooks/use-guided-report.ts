"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  GuidedWorkflowSignals,
  ReportStepId,
} from "@/lib/reports/guided-workflow";
import { REPORT_STEPS } from "@/lib/reports/guided-workflow";

const EMPTY_SIGNALS: GuidedWorkflowSignals = {
  hasReportRun: false,
  documentCountForPeriod: 0,
  pendingComparableReviews: 0,
  pendingConflictCount: 0,
  subjectPhotoCount: 0,
  compsWithSelectedPhotos: 0,
  includedComparableCount: 0,
  hasPeriodWeeklyData: false,
  hasRecommendedRange: false,
  narrativeApproved: false,
  narrativeStale: false,
  finalPdfReady: false,
  driveConfigured: false,
  driveSaved: false,
};

type GuidedContext = {
  propertyName: string;
  unitTypeLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  reportStatus: string | null;
};

const EMPTY_CONTEXT: GuidedContext = {
  propertyName: "",
  unitTypeLabel: null,
  periodStart: null,
  periodEnd: null,
  reportStatus: null,
};

/** Cross-page cache so the stepper does not blank on every step navigation. */
const guidedCache = new Map<
  string,
  { signals: GuidedWorkflowSignals; context: GuidedContext }
>();

function cacheKey(propertyId: string, reportId: string, unitTypeId: string | null) {
  return `${propertyId}:${reportId}:${unitTypeId ?? ""}`;
}

export function useGuidedReport(propertyId: string, defaultStep: ReportStepId) {
  const searchParams = useSearchParams();
  const reportId = searchParams.get("reportId");
  const unitTypeId = searchParams.get("unitTypeId");
  const stepParam = searchParams.get("step") as ReportStepId | null;
  const activeStep: ReportStepId =
    stepParam && REPORT_STEPS.some((s) => s.id === stepParam)
      ? stepParam
      : defaultStep;

  const initialCached =
    reportId != null ? guidedCache.get(cacheKey(propertyId, reportId, unitTypeId)) : undefined;

  const [signals, setSignals] = useState<GuidedWorkflowSignals>(
    initialCached?.signals ?? EMPTY_SIGNALS,
  );
  const [context, setContext] = useState<GuidedContext>(
    initialCached?.context ?? EMPTY_CONTEXT,
  );
  const [loading, setLoading] = useState(!initialCached);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams();
    if (reportId) qs.set("reportId", reportId);
    if (unitTypeId) qs.set("unitTypeId", unitTypeId);

    const key = reportId ? cacheKey(propertyId, reportId, unitTypeId) : null;
    const cached = key ? guidedCache.get(key) : undefined;

    queueMicrotask(() => {
      if (cancelled) return;
      // Soft refresh: keep prior chrome when we already know this report.
      if (cached) {
        setSignals(cached.signals);
        setContext(cached.context);
        setLoading(false);
      } else if (!reportId) {
        setSignals(EMPTY_SIGNALS);
        setLoading(true);
      } else {
        setLoading(true);
      }
    });

    fetch(`/api/properties/${propertyId}/guided-progress?${qs.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.ok) return;
        const apiSignals = json.data.signals as GuidedWorkflowSignals;
        // Never silently adopt an auto-picked report when the URL has no reportId.
        if (!reportId) {
          setSignals({
            ...EMPTY_SIGNALS,
            subjectPhotoCount: apiSignals.subjectPhotoCount ?? 0,
            driveConfigured: apiSignals.driveConfigured ?? false,
          });
          setContext({
            propertyName: json.data.propertyName ?? "",
            unitTypeLabel: null,
            periodStart: null,
            periodEnd: null,
            reportStatus: null,
          });
          return;
        }
        const nextContext: GuidedContext = {
          propertyName: json.data.propertyName ?? "",
          unitTypeLabel: json.data.unitTypeLabel ?? null,
          periodStart: json.data.periodStart ?? null,
          periodEnd: json.data.periodEnd ?? null,
          reportStatus: json.data.reportStatus ?? null,
        };
        setSignals(apiSignals);
        setContext(nextContext);
        guidedCache.set(cacheKey(propertyId, reportId, unitTypeId), {
          signals: apiSignals,
          context: nextContext,
        });
      })
      .catch(() => {
        if (!cancelled && !reportId) setSignals(EMPTY_SIGNALS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [propertyId, reportId, unitTypeId]);

  return useMemo(
    () => ({
      reportId,
      unitTypeId,
      activeStep,
      signals,
      context,
      loading,
    }),
    [reportId, unitTypeId, activeStep, signals, context, loading],
  );
}
