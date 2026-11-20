import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domain/database.types";
import type { PhotoCropBox } from "@/lib/photos/crop";
import { isValidCropBox } from "@/lib/photos/crop";

type Client = SupabaseClient<Database>;

const PHOTO_BUCKET = "report-photos";

export type ReportPhotoRecord = {
  id: string;
  storagePath: string;
  comparablePropertyId: string | null;
  sortOrder: number;
  crop: PhotoCropBox | null;
};

/**
 * Download private report-photos as data URLs for authenticated PDF rendering.
 * Never returns public bucket URLs.
 */
export async function loadReportPhotoDataUrls(
  supabase: Client,
  photos: ReportPhotoRecord[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const photo of photos) {
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .download(photo.storagePath);
    if (error || !data) continue;
    const buf = Buffer.from(await data.arrayBuffer());
    const mime = data.type || "image/jpeg";
    out[photo.storagePath] = `data:${mime};base64,${buf.toString("base64")}`;
  }
  return out;
}

export function parseCropMetadata(raw: unknown): PhotoCropBox | null {
  if (!raw || typeof raw !== "object") return null;
  const withAspect = { aspect: "3:2" as const, ...(raw as Record<string, unknown>) };
  return isValidCropBox(withAspect) ? withAspect : null;
}
