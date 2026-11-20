import { updatePhotoSchema } from "@/domain/schemas";
import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { omitUndefined } from "@/lib/api/object";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";
import type { Database, Json } from "@/domain/database.types";

type RouteContext = { params: Promise<{ id: string }> };

const PHOTO_BUCKET = "report-photos";

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();

    const { data, error } = await supabase
      .from("report_photos")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw validationError("Failed to load photo", error.message);
    if (!data) throw notFoundError("Photo not found");
    await requireOrgMembership(supabase, user, data.organization_id);

    const { data: signed, error: signErr } = await supabase.storage
      .from(data.storage_bucket || PHOTO_BUCKET)
      .createSignedUrl(data.storage_path, 60 * 10);
    if (signErr) {
      throw validationError("Failed to sign photo URL", signErr.message);
    }

    return jsonOk({
      photo: data,
      signedUrl: signed?.signedUrl ?? null,
      expiresInSeconds: 600,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    const body = await parseJsonBody(request, updatePhotoSchema);

    const { data: existing, error } = await supabase
      .from("report_photos")
      .select("id, organization_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw validationError("Failed to load photo", error.message);
    if (!existing) throw notFoundError("Photo not found");
    await requireOrgMembership(supabase, user, existing.organization_id);

    const patch = omitUndefined({
      sort_order: body.sortOrder,
      alt_text: body.altText,
      crop_metadata:
        body.cropMetadata === undefined
          ? undefined
          : body.cropMetadata === null
            ? {}
            : (body.cropMetadata as Json),
      comparable_property_id: body.comparablePropertyId,
    }) as Database["public"]["Tables"]["report_photos"]["Update"];

    const { data, error: updErr } = await supabase
      .from("report_photos")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (updErr) throw validationError("Failed to update photo", updErr.message);

    return jsonOk({ photo: data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();

    const { data: existing, error } = await supabase
      .from("report_photos")
      .select("id, organization_id, storage_bucket, storage_path, source")
      .eq("id", id)
      .maybeSingle();
    if (error) throw validationError("Failed to load photo", error.message);
    if (!existing) throw notFoundError("Photo not found");
    await requireOrgMembership(supabase, user, existing.organization_id);

    const { error: delErr } = await supabase.from("report_photos").delete().eq("id", id);
    if (delErr) throw validationError("Failed to delete photo row", delErr.message);

    // Only remove storage object when this was a unique upload path and no other
    // rows reuse it (prior_week reuse shares storage_path).
    const { count } = await supabase
      .from("report_photos")
      .select("id", { count: "exact", head: true })
      .eq("storage_path", existing.storage_path);

    if ((count ?? 0) === 0) {
      await supabase.storage
        .from(existing.storage_bucket || PHOTO_BUCKET)
        .remove([existing.storage_path]);
    }

    return jsonOk({ deleted: true, id });
  } catch (error) {
    return jsonError(error);
  }
}
