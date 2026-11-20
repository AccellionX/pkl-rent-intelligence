import { setOrgDriveRootSchema } from "@/domain/schemas";
import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { validationError } from "@/lib/api/errors";
import { parseDriveFolderId } from "@/lib/google-drive/folder-id";
import {
  createOrganizationDriveRootFolder,
  setOrganizationDriveRoot,
} from "@/lib/google-drive/folders";
import { isLiveMode } from "@/lib/supabase/env";
import { z } from "zod";

const bodySchema = setOrgDriveRootSchema.extend({
  organizationId: z.string().uuid(),
});

function driveResponse(status: Awaited<ReturnType<typeof setOrganizationDriveRoot>>) {
  return {
    drive: {
      configured: status.configured,
      connectedAccount: status.connectedAccount,
      rootFolderName: status.rootFolderName,
      rootFolderUrl: status.rootFolderUrl,
      connectionError: status.connectionError,
      checkedAt: status.checkedAt,
      migrationReady: status.migrationColumnsAvailable,
      hasRootFolder: Boolean(status.rootFolderId),
    },
  };
}

/** Set or create the organization reports root folder (authorized staff). */
export async function POST(request: Request) {
  try {
    if (!isLiveMode()) throw validationError("This action isn't available right now. Please try again later.");
    const { supabase, user } = await requireAuth();
    const body = await parseJsonBody(request, bodySchema);
    const access = await requireOrgMembership(supabase, user, body.organizationId);

    if (access.role !== "owner" && access.role !== "admin") {
      throw validationError("Only organization owners or admins can set the reports root folder.");
    }

    if (body.create) {
      const status = await createOrganizationDriveRootFolder({
        supabase,
        organizationId: body.organizationId,
        folderName: body.folderName,
      });
      return jsonOk(driveResponse(status));
    }

    const folderId = parseDriveFolderId(body.folderIdOrUrl ?? "");
    if (!folderId) {
      throw validationError(
        "Paste a Google Drive folder link or folder id for the reports root.",
      );
    }

    const status = await setOrganizationDriveRoot({
      supabase,
      organizationId: body.organizationId,
      folderId,
    });

    return jsonOk(driveResponse(status));
  } catch (error) {
    return jsonError(error);
  }
}
