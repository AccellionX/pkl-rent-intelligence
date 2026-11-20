"use client";

import Link from "next/link";
import { Suspense } from "react";
import { ReportContextHeader } from "@/components/buildings/report-context-header";
import { ReportStepper } from "@/components/buildings/report-stepper";
import { Button } from "@/components/ui/button";
import { useGuidedReport } from "@/hooks/use-guided-report";
import type { ReportStepId } from "@/lib/reports/guided-workflow";

function GuidedChromeSkeleton() {
  return (
    <div className="mb-5 space-y-3" aria-busy="true" aria-live="polite">
      <div className="h-16 animate-pulse rounded-lg border border-border bg-surface-muted/60" />
      <div className="h-14 animate-pulse rounded-lg border border-border bg-surface-muted/40" />
      <p className="text-xs text-ink-muted">Loading report workspace…</p>
    </div>
  );
}

function GuidedReportRecovery({ propertyId }: { propertyId: string }) {
  return (
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <div className="font-medium">This report is unavailable</div>
      <p className="mt-1 text-amber-900/90">
        The selected weekly report could not be loaded. Return to the property and choose a report
        to continue, or start a new one.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="gold">
          <Link href={`/buildings/${propertyId}/reports`}>Open report workspace</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/buildings/${propertyId}`}>Back to property</Link>
        </Button>
      </div>
    </div>
  );
}

function GuidedReportChromeInner({
  propertyId,
  defaultStep,
  requireReportId = false,
}: {
  propertyId: string;
  defaultStep: ReportStepId;
  /** When true, never paint a partial weekly header without URL reportId. */
  requireReportId?: boolean;
}) {
  const guided = useGuidedReport(propertyId, defaultStep);

  if (requireReportId && !guided.reportId) {
    return null;
  }

  // Without an explicit report, do not show incomplete weekly chrome.
  if (!guided.reportId) {
    return null;
  }

  // Keep stepper visible while soft-refreshing (cache or first load with reportId).
  if (guided.loading && !guided.signals.hasReportRun) {
    // Prefer a thin pulse over hiding chrome entirely when reportId is already known.
    if (guided.reportId) {
      return (
        <>
          <ReportContextHeader
            propertyId={propertyId}
            propertyName={guided.context.propertyName || "Property"}
            unitTypeLabel={guided.context.unitTypeLabel}
            periodStart={guided.context.periodStart}
            periodEnd={guided.context.periodEnd}
            reportStatus={guided.context.reportStatus}
            activeStep={guided.activeStep}
            signals={{ ...guided.signals, hasReportRun: true }}
          />
          <ReportStepper
            propertyId={propertyId}
            reportRunId={guided.reportId}
            unitTypeId={guided.unitTypeId}
            activeStep={guided.activeStep}
            signals={{ ...guided.signals, hasReportRun: true }}
          />
        </>
      );
    }
    return <GuidedChromeSkeleton />;
  }

  if (!guided.loading && guided.reportId && !guided.signals.hasReportRun) {
    return <GuidedReportRecovery propertyId={propertyId} />;
  }

  return (
    <>
      <ReportContextHeader
        propertyId={propertyId}
        propertyName={guided.context.propertyName || "Property"}
        unitTypeLabel={guided.context.unitTypeLabel}
        periodStart={guided.context.periodStart}
        periodEnd={guided.context.periodEnd}
        reportStatus={guided.context.reportStatus}
        activeStep={guided.activeStep}
        signals={guided.signals}
      />
      <ReportStepper
        propertyId={propertyId}
        reportRunId={guided.reportId}
        unitTypeId={guided.unitTypeId}
        activeStep={guided.activeStep}
        signals={guided.signals}
      />
    </>
  );
}

/** Report-scoped chrome: context header + guided stepper (not property setup). */
export function GuidedReportChrome({
  propertyId,
  defaultStep,
  requireReportId = false,
}: {
  propertyId: string;
  defaultStep: ReportStepId;
  requireReportId?: boolean;
}) {
  return (
    <Suspense fallback={<GuidedChromeSkeleton />}>
      <GuidedReportChromeInner
        propertyId={propertyId}
        defaultStep={defaultStep}
        requireReportId={requireReportId}
      />
    </Suspense>
  );
}
