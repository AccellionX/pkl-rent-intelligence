import { z } from "zod";
import { requireAuth } from "@/lib/auth/session";
import { requirePropertyAccess } from "@/lib/auth/authorize";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";
import { uuidSchema } from "@/domain/schemas";
import type { Json } from "@/domain/database.types";

type RouteContext = { params: Promise<{ id: string }> };

const reuseSchema = z.object({
  sourcePhotoId: uuidSchema,
  reportRunId: uuidSchema.optional().nullable(),
  comparablePropertyId: uuidSchema.optional().nullable(),
});

/**
 * Reuse an approved photo in a subsequent weekly report without staff re-cropping.
 * Copies bytes to a new private storage path because report_photos enforces
 * unique (storage_bucket, storage_path). Never creates a public URL.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    const access = await requirePropertyAccess(supabase, user, propertyId);
    const body = await parseJsonBody(request, reuseSchema);

    const { data: source, error } = await supabase
      .from("report_photos")
      .select("*")
      .eq("id", body.sourcePhotoId)
      .maybeSingle();
    if (error) throw validationError("Failed to load source photo", error.message);
    if (!source || source.property_id !== propertyId) {
      throw notFoundError("Source photo not found on this property");
    }
    if (source.organization_id !== access.organizationId) {
      throw notFoundError("Source photo not found on this property");
    }

    const bucket = source.storage_bucket || "report-photos";
    const { data: blob, error: dlErr } = await supabase.storage
      .from(bucket)
      .download(source.storage_path);
    if (dlErr || !blob) {
      throw validationError("Failed to download source photo for reuse", dlErr?.message);
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const ext = source.storage_path.split(".").pop() || "jpg";
    const storagePath = `${access.organizationId}/properties/${propertyId}/reuse/${Date.now()}-${source.id.slice(0, 8)}.${ext}`;

    const upload = await supabase.storage.from(bucket).upload(storagePath, bytes, {
      contentType: blob.type || "image/jpeg",
      upsert: false,
    });
    if (upload.error) {
      throw validationError("Photo reuse upload failed", upload.error.message);
    }

    const { data: existing } = await supabase
      .from("report_photos")
      .select("sort_order")
      .eq("property_id", propertyId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: photo, error: insErr } = await supabase
      .from("report_photos")
      .insert({
        organization_id: access.organizationId,
        property_id: propertyId,
        comparable_property_id:
          body.comparablePropertyId ?? source.comparable_property_id,
        report_run_id: body.reportRunId ?? null,
        source: "prior_week",
        storage_bucket: bucket,
        storage_path: storagePath,
        sort_order: (existing?.sort_order ?? -1) + 1,
        content_sha256: source.content_sha256,
        width: source.width,
        height: source.height,
        alt_text: source.alt_text,
        crop_metadata: (source.crop_metadata ?? {}) as Json,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (insErr) {
      await supabase.storage.from(bucket).remove([storagePath]);
      throw validationError("Failed to reuse photo", insErr.message);
    }

    return jsonOk({ photo }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
