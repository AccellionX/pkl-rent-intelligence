import { z } from "zod";
import { requireAuth } from "@/lib/auth/session";
import { requirePropertyAccess } from "@/lib/auth/authorize";
import { runIdempotent } from "@/lib/api/idempotency";
import { jsonError, jsonOk } from "@/lib/api/response";
import { validationError } from "@/lib/api/errors";
import { uuidSchema } from "@/domain/schemas";
import type { Json } from "@/domain/database.types";
import { sha256Hex } from "@/lib/extraction/hash";
import { sanitizeStorageFilename } from "@/lib/extraction/normalize";
import {
  filterPhotosForGallery,
  mapWithConcurrency,
} from "@/lib/photos/list-filter";

type RouteContext = { params: Promise<{ id: string }> };

const PHOTO_BUCKET = "report-photos";
const SIGN_TTL_SECONDS = 60 * 10;
/** Gallery UI never needs every historical MLS orphan signed. */
const MAX_GALLERY_SIGN = 48;
const SIGN_CONCURRENCY = 6;

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    await requirePropertyAccess(supabase, user, propertyId);

    const url = new URL(request.url);
    const comparableId = url.searchParams.get("comparablePropertyId");
    if (comparableId && !uuidSchema.safeParse(comparableId).success) {
      throw validationError("comparablePropertyId must be a UUID");
    }

    // Push scope into SQL so subject galleries never download/sign MLS floods.
    let query = supabase
      .from("report_photos")
      .select("*")
      .eq("property_id", propertyId)
      .order("sort_order", { ascending: true });

    if (comparableId) {
      query = query.eq("comparable_property_id", comparableId);
    } else {
      query = query.is("comparable_property_id", null).neq("source", "mls");
    }

    const { data, error } = await query;
    if (error) throw validationError("Failed to list photos", error.message);

    // Defense in depth if a row slips past SQL (legacy source values, etc.).
    const filtered = filterPhotosForGallery(data ?? [], comparableId);
    const toSign = filtered.slice(0, MAX_GALLERY_SIGN);

    const photos = await mapWithConcurrency(toSign, SIGN_CONCURRENCY, async (row) => {
      const { data: signed } = await supabase.storage
        .from(row.storage_bucket || PHOTO_BUCKET)
        .createSignedUrl(row.storage_path, SIGN_TTL_SECONDS);
      return {
        ...row,
        signedUrl: signed?.signedUrl ?? null,
        signedUrlExpiresInSeconds: SIGN_TTL_SECONDS,
      };
    });

    return jsonOk({
      photos,
      truncated: filtered.length > toSign.length,
      totalMatching: filtered.length,
      placeholderLabel: "Photo to be added",
      signedUrlExpiresInSeconds: SIGN_TTL_SECONDS,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    const access = await requirePropertyAccess(supabase, user, propertyId);

    const form = await request.formData();
    const file = form.get("file");
    const comparablePropertyId = String(form.get("comparablePropertyId") ?? "") || null;
    const reportRunId = String(form.get("reportRunId") ?? "") || null;
    const sourceRaw = String(form.get("source") ?? "upload");
    const source = z
      .enum(["upload", "paste", "mls", "prior_week", "placeholder"])
      .parse(sourceRaw);

    // Optional 3:2 crop box from staff tools — stored only; no dashboard redesign.
    let cropMetadata: Json = {};
    const cropRaw = form.get("cropMetadata");
    if (typeof cropRaw === "string" && cropRaw.trim()) {
      try {
        const parsed = JSON.parse(cropRaw) as Record<string, unknown>;
        cropMetadata = {
          aspect: "3:2",
          ...parsed,
        } as Json;
      } catch {
        throw validationError("cropMetadata must be valid JSON");
      }
    }

    if (!(file instanceof File)) {
      throw validationError("file is required");
    }
    if (comparablePropertyId && !uuidSchema.safeParse(comparablePropertyId).success) {
      throw validationError("comparablePropertyId must be a UUID");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) throw validationError("Empty file");
    if (bytes.byteLength > 20 * 1024 * 1024) {
      throw validationError("Photo exceeds 20MB limit");
    }

    const outcome = await runIdempotent({
      request,
      organizationId: access.organizationId,
      userId: user.id,
      route: `POST /api/properties/${propertyId}/photos`,
      supabase,
      execute: async () => {
        const hash = sha256Hex(bytes);
        const safe = sanitizeStorageFilename(file.name || "photo.jpg");
        const storagePath = `${access.organizationId}/properties/${propertyId}/manual/${Date.now()}-${safe}`;

        const upload = await supabase.storage.from(PHOTO_BUCKET).upload(storagePath, bytes, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
        if (upload.error) {
          throw validationError("Photo storage upload failed", upload.error.message);
        }

        const { data: existing } = await supabase
          .from("report_photos")
          .select("sort_order")
          .eq("property_id", propertyId)
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: photo, error } = await supabase
          .from("report_photos")
          .insert({
            organization_id: access.organizationId,
            property_id: propertyId,
            comparable_property_id: comparablePropertyId,
            report_run_id: reportRunId,
            source,
            storage_bucket: PHOTO_BUCKET,
            storage_path: storagePath,
            sort_order: (existing?.sort_order ?? -1) + 1,
            content_sha256: hash,
            alt_text: file.name,
            crop_metadata: cropMetadata,
            created_by: user.id,
          })
          .select("*")
          .single();

        if (error) {
          await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);
          throw validationError("Failed to save photo row", error.message);
        }

        return { data: { photo }, status: 201 };
      },
    });

    return jsonOk(outcome.data, { status: outcome.status });
  } catch (error) {
    return jsonError(error);
  }
}
