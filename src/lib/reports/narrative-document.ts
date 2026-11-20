import { narrativeDocumentSchema } from "./narrative-schema";
import type { NarrativeDocument, NarrativeSections } from "./types";

const MARKER = "---pkl-narrative-v1---";

export function emptySections(): NarrativeSections {
  return {
    pricingExplanation: "",
    compComparison: "",
    marketContext: "",
    weeklyPerformance: "",
    suggestedActions: "",
  };
}

export function sectionsToPlainText(sections: NarrativeSections): string {
  return [
    sections.pricingExplanation,
    sections.compComparison,
    sections.marketContext,
    sections.weeklyPerformance,
    sections.suggestedActions,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function serializeNarrativeDocument(doc: NarrativeDocument): string {
  return `${MARKER}\n${JSON.stringify(doc)}`;
}

export function parseNarrativeDocument(
  raw: string | null | undefined,
): NarrativeDocument | null {
  if (!raw) return null;
  const idx = raw.indexOf(MARKER);
  if (idx < 0) {
    // Legacy plain-text draft — wrap as a single-section editable document.
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const sections = {
      ...emptySections(),
      pricingExplanation: trimmed,
    };
    return {
      schemaVersion: 1,
      status: "edited",
      sections,
      originalSections: sections,
      inputFingerprint: "legacy",
      model: null,
      generatedAt: new Date(0).toISOString(),
      approvedAt: null,
      approvedBy: null,
      editedBy: null,
      userEdited: true,
      agentWeeklyCommentsRef: null,
      warnings: ["Legacy plain-text narrative wrapped for editing"],
    };
  }
  const jsonPart = raw.slice(idx + MARKER.length).trim();
  try {
    const parsed = narrativeDocumentSchema.parse(JSON.parse(jsonPart));
    return parsed;
  } catch {
    return null;
  }
}

export function mergePreservingUserEdits(
  previous: NarrativeDocument | null,
  nextSections: NarrativeSections,
  preserveUserEdits: boolean,
): NarrativeSections {
  if (!preserveUserEdits || !previous?.userEdited) return nextSections;
  const out = { ...nextSections };
  const keys = Object.keys(nextSections) as (keyof NarrativeSections)[];
  for (const key of keys) {
    const prior = previous.sections[key]?.trim();
    const original = previous.originalSections[key]?.trim();
    // Keep user text when it diverged from the original AI draft.
    if (prior && prior !== original) {
      out[key] = previous.sections[key];
    }
  }
  return out;
}
