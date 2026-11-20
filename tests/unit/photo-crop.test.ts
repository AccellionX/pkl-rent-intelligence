import { describe, expect, it } from "vitest";
import { defaultCrop3x2, isValidCropBox } from "@/lib/photos/crop";
import { parseCropMetadata } from "@/lib/photos/load-for-pdf";

describe("photo 3:2 crop helpers", () => {
  it("builds a centered 3:2 crop for wide images", () => {
    const crop = defaultCrop3x2(1200, 600);
    expect(crop.aspect).toBe("3:2");
    expect(crop.height).toBe(1);
    expect(crop.width).toBeCloseTo(0.75, 5);
    expect(crop.x).toBeCloseTo(0.125, 5);
    expect(crop.x + crop.width).toBeCloseTo(0.875, 5);
  });

  it("builds a centered 3:2 crop for tall images", () => {
    const crop = defaultCrop3x2(600, 1200);
    expect(crop.width).toBe(1);
    expect(crop.height).toBeCloseTo(600 / 1.5 / 1200, 5);
    expect(crop.y).toBeCloseTo((1 - crop.height) / 2, 5);
  });

  it("validates and parses crop metadata", () => {
    expect(isValidCropBox({ aspect: "3:2", x: 0, y: 0, width: 1, height: 0.5 })).toBe(
      true,
    );
    expect(isValidCropBox({ aspect: "1:1", x: 0, y: 0, width: 1, height: 1 })).toBe(
      false,
    );
    expect(
      parseCropMetadata({ x: 0.1, y: 0.1, width: 0.6, height: 0.4 }),
    ).toMatchObject({ aspect: "3:2", x: 0.1 });
    expect(parseCropMetadata({})).toBeNull();
  });
});
