import { z } from "zod";

export const reviewExtractionSchema = z.object({
  decision: z.enum(["accepted", "rejected", "overridden"]),
  reason: z.string().trim().min(1).max(2000),
  chosenNormalizedValue: z.record(z.string(), z.unknown()).optional(),
  /** When accepting a candidate, associate with this unit type for approved comps. */
  unitTypeId: z.string().uuid().optional(),
  matchTier: z.enum(["strongest", "moderate", "context"]).optional(),
});
