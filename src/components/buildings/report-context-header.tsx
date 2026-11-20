"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { labelReportStatus } from "@/lib/ui/status-labels";
import {
  REPORT_STEPS,
  deriveStepStatus,
  type GuidedWorkflowSignals,
  type ReportStepId,
} from "@/lib/reports/guided-workflow";

export function ReportContextHeader({
  propertyId,
  propertyName,
  unitTypeLabel,
  periodStart,
  periodEnd,
  reportStatus,
  activeStep,
  signals,
  stepTitle,
  stepDescription,
}: {
  propertyId: string;
  propertyName: string;
  unitTypeLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  reportStatus: string | null;
  activeStep: ReportStepId;
  signals: GuidedWorkflowSignals;
  stepTitle?: string;
  stepDescription?: string;
}) {
  const step = REPORT_STEPS.find((s) => s.id === activeStep);
  const completedCount = REPORT_STEPS.filter(
    (s) => deriveStepStatus(s.id, signals) === "completed",
  ).length;
  const progressPct = Math.round((completedCount / REPORT_STEPS.length) * 100);

  return (
    <div className="mb-5 space-y-3 rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
            Weekly report
          </div>
          <h2 className="font-display text-xl font-semibold text-navy">
            {propertyName}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            {unitTypeLabel ? <span>{unitTypeLabel}</span> : null}
            {periodStart && periodEnd ? (
              <span>
                · {periodStart} – {periodEnd}
              </span>
            ) : (
              <span>· Select a reporting period</span>
            )}
            {reportStatus ? (
              <Badge variant="outline">{labelReportStatus(reportStatus)}</Badge>
            ) : null}
            <Badge variant="outline">Progress {progressPct}%</Badge>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/buildings/${propertyId}`}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Save & return to property
          </Link>
        </Button>
      </div>
      <div>
        <div className="text-base font-semibold text-navy">
          {stepTitle ?? step?.title}
        </div>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          {stepDescription ?? step?.description}
        </p>
      </div>
    </div>
  );
}
