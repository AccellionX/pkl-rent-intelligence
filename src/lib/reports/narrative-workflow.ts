import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/domain/database.types";
import { assembleReportPayload } from "./assemble";
import {
  generateClaudeNarrative,
  buildDeterministicNarrativeDraft,
  getAnthropicApiKey,
} from "./claude-narrative";
import {
  mergePreservingUserEdits,
  serializeNarrativeDocument,
  sectionsToPlainText,
} from "./narrative-document";
import type { NarrativeDocument, NarrativeSections } from "./types";

type Client = SupabaseClient<Database>;

function assertEditable(status: string) {
  if (status === "saved_to_drive") {
    throw new Error("Finalized reports saved to Drive cannot be edited");
  }
}

async function persistNarrative(
  supabase: Client,
  reportId: string,
  doc: NarrativeDocument,
  approvedPlain: string | null,
) {
  const { data, error } = await supabase
    .from("report_runs")
    .update({
      narrative_draft: serializeNarrativeDocument(doc),
      narrative_approved: approvedPlain,
    })
    .eq("id", reportId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function generateNarrativeForReport(opts: {
  supabase: Client;
  reportId: string;
  userId: string;
  preserveUserEdits?: boolean;
  force?: boolean;
  /** Test-only: use deterministic draft instead of Claude. */
  useDeterministicDraft?: boolean;
}) {
  const assembled = await assembleReportPayload(opts.supabase, opts.reportId);
  assertEditable(assembled.report.status);

  if (assembled.narrative.stale && !opts.force && !opts.preserveUserEdits) {
    // Still allow regenerate, but surface stale warning.
  }

  if (
    assembled.status === "blocked_conflicts" &&
    assembled.pricing.stats.eligibleGroupedCount === 0
  ) {
    throw new Error("Cannot generate narrative while assembly is blocked by conflicts");
  }

  const previous = assembled.narrative.document;
  let sections: NarrativeSections;
  let model: string | null = null;
  let usedLiveClaude = false;
  let claudeUsage: {
    inputTokens: number | null;
    outputTokens: number | null;
    latencyMs: number;
  } | null = null;
  const warnings: string[] = [...assembled.quality.warnings];

  if (opts.useDeterministicDraft || !getAnthropicApiKey()) {
    sections = buildDeterministicNarrativeDraft(assembled);
    model = opts.useDeterministicDraft
      ? "deterministic-test-draft"
      : "deterministic-fallback-no-api-key";
    if (!getAnthropicApiKey() && !opts.useDeterministicDraft) {
      warnings.push(
        "AI-assisted writing is currently unavailable. A standard draft was prepared instead.",
      );
    }
  } else {
    const result = await generateClaudeNarrative(assembled);
    if (!result.ok) {
      // Do not silently claim live Claude success when falling back.
      sections = buildDeterministicNarrativeDraft(assembled);
      model = "deterministic-fallback-after-api-error";
      warnings.push(result.error);
      warnings.push(
        "A standard draft was prepared instead. You can edit it or try generating again.",
      );
      claudeUsage = result.usage ?? null;
    } else {
      sections = result.sections;
      model = result.model;
      usedLiveClaude = true;
      claudeUsage = result.usage;
      warnings.push(...result.warnings);
    }
  }

  const merged = mergePreservingUserEdits(
    previous,
    sections,
    Boolean(opts.preserveUserEdits),
  );

  const now = new Date().toISOString();
  const doc: NarrativeDocument = {
    schemaVersion: 1,
    status: previous?.userEdited && opts.preserveUserEdits ? "edited" : "draft",
    sections: merged,
    originalSections: previous?.originalSections ?? sections,
    inputFingerprint: assembled.narrative.inputFingerprint,
    model,
    generatedAt: now,
    approvedAt: null,
    approvedBy: null,
    editedBy: previous?.userEdited ? opts.userId : null,
    userEdited: Boolean(previous?.userEdited && opts.preserveUserEdits),
    agentWeeklyCommentsRef:
      assembled.weekly.latestWeek?.agent.weeklyComments ?? null,
    warnings,
  };

  // Never auto-approve; clear approved text on regenerate so stale approved copy cannot finalize silently.
  const report = await persistNarrative(opts.supabase, opts.reportId, doc, null);
  return {
    report,
    document: doc,
    assembled,
    usedLiveClaude,
    claudeUsage,
  };
}

export async function editNarrativeForReport(opts: {
  supabase: Client;
  reportId: string;
  userId: string;
  sections: Partial<NarrativeSections>;
}) {
  const assembled = await assembleReportPayload(opts.supabase, opts.reportId);
  assertEditable(assembled.report.status);
  const previous = assembled.narrative.document;
  if (!previous) throw new Error("No narrative draft to edit — generate first");

  const nextSections: NarrativeSections = {
    ...previous.sections,
    ...opts.sections,
  };

  const doc: NarrativeDocument = {
    ...previous,
    status: assembled.narrative.stale ? "stale" : "edited",
    sections: nextSections,
    userEdited: true,
    editedBy: opts.userId,
    // Keep originalSections immutable
    approvedAt: null,
    approvedBy: null,
  };

  const report = await persistNarrative(opts.supabase, opts.reportId, doc, null);
  return { report, document: doc, stale: assembled.narrative.stale };
}

export async function approveNarrativeForReport(opts: {
  supabase: Client;
  reportId: string;
  userId: string;
}) {
  const assembled = await assembleReportPayload(opts.supabase, opts.reportId);
  assertEditable(assembled.report.status);
  const previous = assembled.narrative.document;
  if (!previous) throw new Error("No narrative draft to approve");
  if (assembled.narrative.stale || previous.status === "stale") {
    throw new Error(
      "Narrative is stale relative to approved data — regenerate or edit after reviewing changes before approval",
    );
  }
  if (previous.status === "rejected") {
    throw new Error("Rejected narrative cannot be approved — regenerate first");
  }

  // Idempotent: keep existing approval timestamp so snapshot reuse stays stable.
  if (
    previous.status === "approved" &&
    previous.approvedAt &&
    previous.inputFingerprint === assembled.narrative.inputFingerprint
  ) {
    return { report: assembled.report, document: previous, alreadyApproved: true as const };
  }

  const now = new Date().toISOString();
  const doc: NarrativeDocument = {
    ...previous,
    status: "approved",
    approvedAt: now,
    approvedBy: opts.userId,
    inputFingerprint: assembled.narrative.inputFingerprint,
  };

  const plain = sectionsToPlainText(doc.sections);
  const report = await persistNarrative(opts.supabase, opts.reportId, doc, plain);
  return { report, document: doc, alreadyApproved: false as const };
}

export async function rejectNarrativeForReport(opts: {
  supabase: Client;
  reportId: string;
  userId: string;
}) {
  const assembled = await assembleReportPayload(opts.supabase, opts.reportId);
  assertEditable(assembled.report.status);
  const previous = assembled.narrative.document;
  if (!previous) throw new Error("No narrative draft to reject");

  const doc: NarrativeDocument = {
    ...previous,
    status: "rejected",
    editedBy: opts.userId,
    approvedAt: null,
    approvedBy: null,
  };

  const report = await persistNarrative(opts.supabase, opts.reportId, doc, null);
  return { report, document: doc };
}

function snapshotNarrativeFingerprint(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const narrative = (payload as { narrative?: { document?: NarrativeDocument; inputFingerprint?: string } })
    .narrative;
  const fp = narrative?.inputFingerprint ?? narrative?.document?.inputFingerprint ?? null;
  const approvedAt = narrative?.document?.approvedAt ?? null;
  if (!fp && !approvedAt) return null;
  const photos = snapshotContentPhotoKey(payload);
  return `${fp ?? ""}|${approvedAt ?? ""}|${photos}`;
}

/** Photo identity for snapshot reuse — changing photos must force a new version. */
function snapshotContentPhotoKey(payload: unknown): string {
  const p = payload as {
    property?: { photoPaths?: string[] };
    comparables?: { approvedIncluded?: Array<{ photoPaths?: string[] }> };
  } | null;
  if (!p) return "";
  const subject = [...(p.property?.photoPaths ?? [])].sort().join(",");
  const comps = (p.comparables?.approvedIncluded ?? [])
    .map((c) => [...(c.photoPaths ?? [])].sort().join(","))
    .join("|");
  return `${subject}::${comps}`;
}

/**
 * Create an immutable report_snapshots row from the current assembly + approved narrative.
 * Does not render PDF. Idempotent for repeated clicks with the same approved narrative.
 */
export async function createReportContentSnapshot(opts: {
  supabase: Client;
  reportId: string;
  userId: string;
}) {
  const assembled = await assembleReportPayload(opts.supabase, opts.reportId);
  assertEditable(assembled.report.status);

  const narrative = assembled.narrative.document;
  if (!narrative || narrative.status !== "approved" || assembled.narrative.stale) {
    throw new Error("Approved non-stale narrative required before snapshot");
  }
  if (assembled.pricing.recommendationSource !== "manual_pkl") {
    throw new Error("PKL recommended rent range must be set before snapshot");
  }

  const { data: existingRows } = await opts.supabase
    .from("report_snapshots")
    .select("id, version, payload, generated_file_path, created_at, report_run_id")
    .eq("report_run_id", opts.reportId)
    .order("version", { ascending: false })
    .limit(1);

  const latest = existingRows?.[0] ?? null;
  const currentFp = `${assembled.narrative.inputFingerprint ?? ""}|${narrative.approvedAt ?? ""}|${snapshotContentPhotoKey(assembled)}`;
  if (latest && snapshotNarrativeFingerprint(latest.payload) === currentFp) {
    return { snapshot: latest, assembled, reused: true as const };
  }

  const nextVersion = (latest?.version ?? 0) + 1;
  const snapshotPayload = {
    ...assembled,
    snapshotMeta: {
      version: nextVersion,
      createdAt: new Date().toISOString(),
      narrativeStatus: narrative.status,
    },
  };

  const { data, error } = await opts.supabase
    .from("report_snapshots")
    .insert({
      organization_id: assembled.organization.id,
      report_run_id: opts.reportId,
      version: nextVersion,
      payload: snapshotPayload as unknown as Json,
      created_by: opts.userId,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return { snapshot: data, assembled, reused: false as const };
}

/**
 * Approve narrative and lock an immutable snapshot in one staff action.
 * If snapshot locking fails after approval, narrative is reverted so the UI
 * never shows a false "approved and ready" confirmation.
 */
export async function approveNarrativeAndLockSnapshot(opts: {
  supabase: Client;
  reportId: string;
  userId: string;
}) {
  const approved = await approveNarrativeForReport(opts);
  try {
    const locked = await createReportContentSnapshot(opts);
    return {
      report: locked.assembled.report,
      narrative: approved.document,
      snapshot: locked.snapshot,
      reusedSnapshot: locked.reused,
    };
  } catch (error) {
    // Roll back approval so staff do not think finalization is ready.
    const plain = null;
    const reverted: NarrativeDocument = {
      ...approved.document,
      status: "edited",
      approvedAt: null,
      approvedBy: null,
    };
    await persistNarrative(opts.supabase, opts.reportId, reverted, plain);
    throw error;
  }
}
