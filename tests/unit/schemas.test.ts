import { describe, expect, it } from "vitest";
import {
  createPropertySchema,
  createReportRunSchema,
  createSubjectUnitSchema,
  createUnitTypeSchema,
  photoCropMetadataSchema,
  transitionReportRunSchema,
  updatePhotoSchema,
} from "@/domain/schemas";

describe("domain schemas", () => {
  it("accepts a valid property create payload", () => {
    const parsed = createPropertySchema.parse({
      organizationId: "11111111-1111-4111-8111-111111111111",
      name: "855 Providence Street",
      addressLine1: "855 Providence St",
      city: "Providence",
      state: "RI",
      postalCode: "02904",
    });
    expect(parsed.country).toBe("US");
    expect(parsed.amenities).toEqual([]);
  });

  it("rejects invalid organization ids", () => {
    const result = createPropertySchema.safeParse({
      organizationId: "not-a-uuid",
      name: "Test",
      addressLine1: "1 Main",
      city: "Providence",
      state: "RI",
      postalCode: "02903",
    });
    expect(result.success).toBe(false);
  });

  it("validates unit types", () => {
    expect(
      createUnitTypeSchema.parse({ label: "2BR", beds: 2, baths: 1 }),
    ).toMatchObject({ label: "2BR", beds: 2, baths: 1 });
  });

  it("rejects inverted report periods", () => {
    const result = createReportRunSchema.safeParse({
      unitTypeId: "11111111-1111-4111-8111-111111111111",
      title: "Weekly",
      periodStart: "2026-11-17",
      periodEnd: "2026-11-10",
    });
    expect(result.success).toBe(false);
  });

  it("accepts transition payloads", () => {
    expect(
      transitionReportRunSchema.parse({ toStatus: "waiting_on_review" }),
    ).toEqual({ toStatus: "waiting_on_review" });
  });

  it("validates subject unit create payloads", () => {
    expect(
      createSubjectUnitSchema.parse({
        unitTypeId: "11111111-1111-4111-8111-111111111111",
        unitNumber: "7",
        sqft: 900,
        askingRent: 2000,
        status: "available",
        availableDate: "2026-11-20",
      }),
    ).toMatchObject({ unitNumber: "7", status: "available" });
  });

  it("validates 3:2 photo crop metadata", () => {
    expect(
      photoCropMetadataSchema.parse({
        aspect: "3:2",
        x: 0.1,
        y: 0.05,
        width: 0.8,
        height: 0.53,
      }),
    ).toMatchObject({ aspect: "3:2", x: 0.1 });
    expect(
      updatePhotoSchema.parse({
        sortOrder: 2,
        cropMetadata: { aspect: "3:2", x: 0, y: 0, width: 1, height: 0.666 },
      }),
    ).toMatchObject({ sortOrder: 2 });
  });
});
