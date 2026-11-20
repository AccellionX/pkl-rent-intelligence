import { z } from "zod";

export const narrativeSectionsSchema = z.object({
  pricingExplanation: z.string().trim().min(1).max(4000),
  compComparison: z.string().trim().min(1).max(4000),
  marketContext: z.string().trim().min(1).max(4000),
  weeklyPerformance: z.string().trim().min(1).max(4000),
  suggestedActions: z.string().trim().min(1).max(4000),
});

export const narrativeStatusSchema = z.enum([
  "draft",
  "edited",
  "approved",
  "rejected",
  "stale",
]);

export const narrativeDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  status: narrativeStatusSchema,
  sections: narrativeSectionsSchema,
  originalSections: narrativeSectionsSchema,
  inputFingerprint: z.string().min(16).max(128),
  model: z.string().max(120).nullable(),
  generatedAt: z.string().datetime(),
  approvedAt: z.string().datetime().nullable(),
  approvedBy: z.string().uuid().nullable(),
  editedBy: z.string().uuid().nullable(),
  userEdited: z.boolean(),
  agentWeeklyCommentsRef: z.string().max(8000).nullable(),
  warnings: z.array(z.string().max(500)).max(50),
});

export const narrativeEditSchema = z.object({
  sections: narrativeSectionsSchema.partial(),
});

export const narrativeGenerateSchema = z.object({
  /** When true, keep user-edited section text and only refresh untouched sections. */
  preserveUserEdits: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false),
});

export const claudeNarrativeResponseSchema = z.object({
  pricingExplanation: z.string(),
  compComparison: z.string(),
  marketContext: z.string(),
  weeklyPerformance: z.string(),
  suggestedActions: z.string(),
});

export type ClaudeNarrativeResponse = z.infer<typeof claudeNarrativeResponseSchema>;
