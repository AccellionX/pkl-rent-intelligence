import { setPropertyDriveFolderSchema } from "@/domain/schemas";
import { requirePropertyAccess } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { validationError } from "@/lib/api/errors";
import { parseDriveFolderId } from "@/lib/google-drive/folder-id";
import {
  associatePropertyDriveFolder,
  getPropertyDriveStatus,
} from "@/lib/google-drive/folders";
import { isLiveMode } from "@/lib/supabase/env";

type RouteContext = { params: Promise<{ id: string }> };

function publicPropertyDrive(status: Awaited<ReturnType<typeof getPropertyDriveStatus>>) {
  return {
    folderName: status.folderName,
    folderUrl: status.folderUrl,
    verifiedAt: status.verifiedAt,
    accessible: status.accessible,
    accessError: status.accessError,
    assigned: Boolean(status.folderId),
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    if (!isLiveMode()) throw validationError("This action isn't available right now. Please try again later.");
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    await requirePropertyAccess(supabase, user, id);

    const status = await getPropertyDriveStatus(supabase, id);
    return jsonOk({ drive: publicPropertyDrive(status) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Associate an existing Drive folder with this property. */
export async function POST(request: Request, context: RouteContext) {
  try {
    if (!isLiveMode()) throw validationError("This action isn't available right now. Please try again later.");
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    await requirePropertyAccess(supabase, user, id);
    const body = await parseJsonBody(request, setPropertyDriveFolderSchema);

    const folderId = parseDriveFolderId(body.folderIdOrUrl);
    if (!folderId) {
      throw validationError("Paste a Google Drive folder link or folder id.");
    }

    const status = await associatePropertyDriveFolder({
      supabase,
      propertyId: id,
      folderId,
    });

    return jsonOk({ drive: publicPropertyDrive(status) });
  } catch (error) {
    return jsonError(error);
  }
}
