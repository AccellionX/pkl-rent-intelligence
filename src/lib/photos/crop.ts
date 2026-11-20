/** Normalized 3:2 crop box — fractions of source image width/height. */
export type PhotoCropBox = {
  aspect: "3:2";
  x: number;
  y: number;
  width: number;
  height: number;
};

export function isValidCropBox(value: unknown): value is PhotoCropBox {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.aspect === "3:2" &&
    typeof v.x === "number" &&
    typeof v.y === "number" &&
    typeof v.width === "number" &&
    typeof v.height === "number" &&
    v.x >= 0 &&
    v.y >= 0 &&
    v.width > 0 &&
    v.height > 0 &&
    v.x + v.width <= 1.0001 &&
    v.y + v.height <= 1.0001
  );
}

/** Default centered 3:2 crop covering as much of the image as possible. */
export function defaultCrop3x2(imageWidth: number, imageHeight: number): PhotoCropBox {
  const target = 3 / 2;
  const current = imageWidth / Math.max(imageHeight, 1);
  if (current >= target) {
    const width = (target * imageHeight) / imageWidth;
    return { aspect: "3:2", x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = imageWidth / target / imageHeight;
  return { aspect: "3:2", x: 0, y: (1 - height) / 2, width: 1, height };
}

/**
 * Draw a cropped region into a canvas as JPEG data URL (client or node canvas).
 */
export function cropToDataUrl(
  image: CanvasImageSource,
  crop: PhotoCropBox,
  sourceWidth: number,
  sourceHeight: number,
  outWidth = 900,
): string {
  const sx = Math.round(crop.x * sourceWidth);
  const sy = Math.round(crop.y * sourceHeight);
  const sw = Math.max(1, Math.round(crop.width * sourceWidth));
  const sh = Math.max(1, Math.round(crop.height * sourceHeight));
  const outHeight = Math.round(outWidth / (3 / 2));
  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outWidth, outHeight);
  return canvas.toDataURL("image/jpeg", 0.88);
}
