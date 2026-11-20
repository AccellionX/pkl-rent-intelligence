import type { CanonicalReportPayload } from "@/lib/reports/types";
import { evaluatePayloadReadiness } from "@/lib/reports/readiness";

export type PdfMode = "draft" | "final";

export type FinalizationCheck = {
  ok: boolean;
  modeAllowed: PdfMode[];
  /** Hard required items — never skipped by acknowledgment. */
  blockers: string[];
  warnings: string[];
  /** Acknowledgeable warning keys still outstanding. */
  acknowledgeableKeys: string[];
  /** True when only acknowledgeable warnings remain. */
  readyAfterAck: boolean;
};

/**
 * Draft PDFs may render with incomplete data + visible DRAFT label.
 * Final PDFs use the shared readiness model (required + ack'd warnings).
 * Never auto-approves comps.
 */
export function evaluatePdfFinalization(
  payload: CanonicalReportPayload,
  acknowledgedKeys: string[] = [],
): FinalizationCheck {
  const readiness = evaluatePayloadReadiness(payload, acknowledgedKeys);
  const warnings = [
    ...payload.quality.warnings,
    ...readiness.warnings.map((w) => w.message),
    ...readiness.optional.map((o) => o.message),
  ];

  if (payload.availableUnits.length === 0) {
    warnings.push("No available units listed");
  }
  const incompleteUnits = payload.availableUnits.filter((u) => Boolean(u.incomplete));
  if (incompleteUnits.length > 0) {
    warnings.push(
      `${incompleteUnits.length} incomplete subject unit(s) need review before finalization`,
    );
  }

  const acknowledgeableKeys = readiness.warnings
    .filter((w) => w.acknowledgeable && !acknowledgedKeys.includes(w.key))
    .map((w) => w.key);
  const hardBlockers = readiness.required.map((r) => r.message);

  return {
    ok: readiness.canFinalize,
    modeAllowed: readiness.canFinalize ? ["draft", "final"] : ["draft"],
    blockers: hardBlockers,
    warnings,
    acknowledgeableKeys,
    readyAfterAck: hardBlockers.length === 0 && acknowledgeableKeys.length > 0,
  };
}

export function assertCanRenderPdf(
  payload: CanonicalReportPayload,
  mode: PdfMode,
  acknowledgedKeys: string[] = [],
): FinalizationCheck {
  const check = evaluatePdfFinalization(payload, acknowledgedKeys);
  if (mode === "final" && !check.ok) {
    const detail = [
      ...check.blockers,
      ...check.acknowledgeableKeys.map((k) => `Acknowledge remaining item: ${k}`),
    ].join("; ");
    throw new Error(`Final PDF blocked: ${detail || "requirements not met"}`);
  }
  return check;
}
