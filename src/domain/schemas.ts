import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const propertyExternalLinksSchema = z
  .object({
    zillow: z.string().url().optional(),
    apartments: z.string().url().optional(),
    mls: z.string().optional(),
  })
  .passthrough();

export const createPropertySchema = z.object({
  organizationId: uuidSchema,
  name: z.string().trim().min(1).max(200),
  marketingName: z.string().trim().max(200).optional().nullable(),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(2).max(3),
  postalCode: z.string().trim().min(3).max(20),
  country: z.string().trim().min(2).max(2).default("US"),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  yearBuilt: z.number().int().min(1600).max(2100).optional().nullable(),
  stories: z.number().int().min(1).max(200).optional().nullable(),
  unitCount: z.number().int().min(0).max(100000).optional().nullable(),
  amenities: z.array(z.string().trim().min(1)).default([]),
  externalLinks: propertyExternalLinksSchema.default({}),
});

export const updatePropertySchema = createPropertySchema
  .omit({ organizationId: true })
  .partial();

export const createUnitTypeSchema = z.object({
  label: z.string().trim().min(1).max(50),
  beds: z.number().min(0).max(20),
  baths: z.number().min(0).max(20),
  description: z.string().trim().max(500).optional().nullable(),
});

export const updateUnitTypeSchema = createUnitTypeSchema.partial();

export const reportRunStatusSchema = z.enum([
  "in_progress",
  "waiting_on_review",
  "sent",
  "saved_to_drive",
]);

export const createReportRunSchema = z.object({
  unitTypeId: uuidSchema,
  title: z.string().trim().min(1).max(300),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  preparedBy: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
}).refine((value) => value.periodStart <= value.periodEnd, {
  message: "periodStart must be on or before periodEnd",
  path: ["periodEnd"],
});

export const updateReportRunSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  preparedBy: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  recommendedRentLow: z.number().min(0).optional().nullable(),
  recommendedRentHigh: z.number().min(0).optional().nullable(),
  narrativeDraft: z.string().max(20000).optional().nullable(),
  narrativeApproved: z.string().max(20000).optional().nullable(),
}).refine(
  (value) =>
    value.recommendedRentLow == null ||
    value.recommendedRentHigh == null ||
    value.recommendedRentLow <= value.recommendedRentHigh,
  {
    message: "recommendedRentLow must be <= recommendedRentHigh",
    path: ["recommendedRentHigh"],
  },
);

export const transitionReportRunSchema = z.object({
  toStatus: reportRunStatusSchema,
});

export const listPropertiesQuerySchema = z.object({
  organizationId: uuidSchema,
});
