import { requirePropertyAccess } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { runIdempotent } from "@/lib/api/idempotency";
import { jsonError, jsonOk } from "@/lib/api/response";
import { validationError } from "@/lib/api/errors";
import { createPropertyDriveFolder } from "@/lib/google-drive/folders";
import { isLiveMode } from "@/lib/supabase/env";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Create (or reuse) a property folder under the org reports root.
 * Explicit action only — never auto-creates on property create.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    if (!isLiveMode()) throw validationError("This action isn't available right now. Please try again later.");
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    const access = await requirePropertyAccess(supabase, user, id);

    const result = await runIdempotent({
      request,
      organizationId: access.organizationId,
      userId: user.id,
      route: `POST /api/properties/${id}/drive/create`,
      supabase,
      execute: async () => {
        const status = await createPropertyDriveFolder({
          supabase,
          propertyId: id,
          organizationId: access.organizationId,
        });
        return {
          data: {
            drive: {
              folderName: status.folderName,
              folderUrl: status.folderUrl,
              verifiedAt: status.verifiedAt,
              accessible: status.accessible,
              accessError: status.accessError,
              assigned: Boolean(status.folderId),
            },
          },
          status: 201,
        };
      },
    });

    return jsonOk(result.data, { status: result.status });
  } catch (error) {
    return jsonError(error);
  }
}
