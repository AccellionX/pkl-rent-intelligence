"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  REPORT_STEPS,
  hrefForReportStep,
  type ReportStepId,
} from "@/lib/reports/guided-workflow";

/**
 * Single primary continue control for guided report steps.
 * Keeps staff in the stepper with reportId / unitTypeId preserved.
 */
export function GuidedStepNav({
  propertyId,
  reportRunId,
  unitTypeId,
  activeStep,
  continueLabel,
  continueDisabled,
  continueHint,
  showBack = true,
}: {
  propertyId: string;
  reportRunId?: string | null;
  unitTypeId?: string | null;
  activeStep: ReportStepId;
  continueLabel?: string;
  continueDisabled?: boolean;
  continueHint?: string | null;
  showBack?: boolean;
}) {
  const idx = REPORT_STEPS.findIndex((s) => s.id === activeStep);
  const current = REPORT_STEPS[idx];
  const next = idx >= 0 && idx < REPORT_STEPS.length - 1 ? REPORT_STEPS[idx + 1] : null;
  const prev = idx > 0 ? REPORT_STEPS[idx - 1] : null;

  if (!current) return null;

  const nextHref = next
    ? hrefForReportStep({
        propertyId,
        stepId: next.id,
        reportRunId,
        unitTypeId,
      })
    : `/buildings/${propertyId}`;
  const prevHref = prev
    ? hrefForReportStep({
        propertyId,
        stepId: prev.id,
        reportRunId,
        unitTypeId,
      })
    : `/buildings/${propertyId}/reports`;

  return (
    <div className="mb-5 space-y-2 rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {showBack && prev ? (
          <Button asChild variant="outline" size="sm">
            <Link href={prevHref}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Back
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {next ? (
          continueDisabled ? (
            <Button size="sm" variant="gold" disabled>
              {continueLabel ?? current.primaryAction}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button asChild size="sm" variant="gold">
              <Link href={nextHref}>
                {continueLabel ?? current.primaryAction}
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          )
        ) : (
          <Button asChild size="sm" variant="gold">
            <Link href={`/buildings/${propertyId}`}>Return to property</Link>
          </Button>
        )}
      </div>
      {continueHint ? (
        <p className="text-xs text-ink-muted">{continueHint}</p>
      ) : null}
    </div>
  );
}
