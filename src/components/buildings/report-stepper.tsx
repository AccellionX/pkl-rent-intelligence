"use client";

import Link from "next/link";
import { Check, CircleAlert, CircleDot, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  REPORT_STEPS,
  deriveStepStatus,
  hrefForReportStep,
  labelStepStatus,
  nextRecommendedStep,
  type GuidedWorkflowSignals,
  type ReportStepId,
  type StepCompletionStatus,
} from "@/lib/reports/guided-workflow";

function StatusIcon({ status }: { status: StepCompletionStatus }) {
  if (status === "completed") {
    return <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden />;
  }
  if (status === "needs_attention") {
    return <CircleAlert className="h-3.5 w-3.5 text-amber-700" aria-hidden />;
  }
  if (status === "in_progress") {
    return <CircleDot className="h-3.5 w-3.5 text-navy" aria-hidden />;
  }
  return <Circle className="h-3.5 w-3.5 text-ink-subtle" aria-hidden />;
}

export function ReportStepper({
  propertyId,
  reportRunId,
  unitTypeId,
  activeStep,
  signals,
}: {
  propertyId: string;
  reportRunId?: string | null;
  unitTypeId?: string | null;
  activeStep: ReportStepId;
  signals: GuidedWorkflowSignals;
}) {
  const recommended = nextRecommendedStep(signals);

  if (!signals.hasReportRun) {
    return (
      <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Start a report for this property, unit type, and reporting period before
        working through the weekly steps.{" "}
        <Link
          href={`/buildings/${propertyId}/reports`}
          className="font-medium text-navy underline underline-offset-2"
        >
          Open report workspace
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-5 space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-white p-2 shadow-sm">
        <ol className="flex min-w-max gap-1">
          {REPORT_STEPS.map((step, index) => {
            const status = deriveStepStatus(step.id, signals);
            const href = hrefForReportStep({
              propertyId,
              stepId: step.id,
              reportRunId,
              unitTypeId,
            });
            const active = step.id === activeStep;
            const activeIndex = REPORT_STEPS.findIndex((s) => s.id === activeStep);
            // Allow revisit of done/attention steps and the next recommended step.
            // Block jumping ahead into untouched future steps.
            const reachable =
              active ||
              status === "completed" ||
              status === "needs_attention" ||
              status === "in_progress" ||
              status === "optional" ||
              step.id === recommended ||
              index <= activeIndex;
            const className = cn(
              "flex min-w-[7.5rem] flex-col gap-1 rounded-md px-2.5 py-2 transition-colors",
              active
                ? "bg-navy text-white"
                : reachable
                  ? "text-ink-muted hover:bg-surface-muted hover:text-navy"
                  : "cursor-not-allowed text-ink-subtle opacity-50",
            );
            return (
              <li key={step.id}>
                {reachable ? (
                  <Link
                    href={href}
                    className={className}
                    title={`${step.title} — ${labelStepStatus(status)}`}
                  >
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-80">
                      <StatusIcon status={status} />
                      Step {step.number}
                    </span>
                    <span className="text-xs font-medium leading-tight">
                      {step.shortTitle}
                    </span>
                    <span
                      className={cn(
                        "text-[10px]",
                        active ? "text-white/75" : "text-ink-subtle",
                      )}
                    >
                      {labelStepStatus(status)}
                    </span>
                  </Link>
                ) : (
                  <span
                    className={className}
                    title="Finish earlier steps before opening this one"
                    aria-disabled="true"
                  >
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-80">
                      <StatusIcon status={status} />
                      Step {step.number}
                    </span>
                    <span className="text-xs font-medium leading-tight">
                      {step.shortTitle}
                    </span>
                    <span className="text-[10px] text-ink-subtle">
                      {labelStepStatus(status)}
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      {recommended && recommended !== activeStep ? (
        <p className="text-xs text-ink-muted">
          Next recommended:{" "}
          <Link
            href={hrefForReportStep({
              propertyId,
              stepId: recommended,
              reportRunId,
              unitTypeId,
            })}
            className="font-medium text-navy underline underline-offset-2"
          >
            {REPORT_STEPS.find((s) => s.id === recommended)?.title}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
