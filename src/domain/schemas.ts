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
  /** When true, create even if a same-org normalized address already exists. */
  confirmDuplicateAddress: z.boolean().optional().default(false),
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

export const setOrgDriveRootSchema = z
  .object({
    /** Paste an existing app-accessible folder link/id (drive.file must own it). */
    folderIdOrUrl: z.string().trim().min(5).max(500).optional(),
    /** Create a new reports root under My Drive via the connected account. */
    create: z.boolean().optional().default(false),
    folderName: z.string().trim().min(2).max(180).optional(),
  })
  .refine((v) => Boolean(v.create) || Boolean(v.folderIdOrUrl?.trim()), {
    message: "Provide a folder link or choose create.",
  });

export const setPropertyDriveFolderSchema = z.object({
  folderIdOrUrl: z.string().trim().min(5).max(500),
});

export const createPropertyDriveFolderSchema = z.object({
  create: z.literal(true),
});

export const listPropertiesQuerySchema = z.object({
  organizationId: uuidSchema,
});

export const subjectUnitStatusSchema = z.enum([
  "available",
  "pending",
  "leased",
  "offline",
]);

export const createSubjectUnitSchema = z.object({
  unitTypeId: uuidSchema,
  unitNumber: z.string().trim().min(1).max(50),
  sqft: z.number().int().positive().optional().nullable(),
  askingRent: z.number().min(0).optional().nullable(),
  marketRent: z.number().min(0).optional().nullable(),
  status: subjectUnitStatusSchema.default("available"),
  availableDate: z.string().date().optional().nullable(),
  floor: z.number().int().min(0).max(200).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export const updateSubjectUnitSchema = createSubjectUnitSchema.partial().extend({
  unitTypeId: uuidSchema.optional(),
});

export const photoCropMetadataSchema = z.object({
  aspect: z.literal("3:2").default("3:2"),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.01).max(1),
  height: z.number().min(0.01).max(1),
});

export const updatePhotoSchema = z.object({
  sortOrder: z.number().int().min(0).optional(),
  altText: z.string().trim().max(500).optional().nullable(),
  cropMetadata: photoCropMetadataSchema.optional().nullable(),
  comparablePropertyId: uuidSchema.optional().nullable(),
});

