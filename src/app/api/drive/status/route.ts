import { z } from "zod";
import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { parseSearchParams } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { validationError } from "@/lib/api/errors";
import { getOrganizationDriveStatus } from "@/lib/google-drive/folders";
import { isLiveMode } from "@/lib/supabase/env";

const querySchema = z.object({
  organizationId: z.string().uuid(),
});

/** Org Drive connection + reports root status (server credentials never returned). */
export async function GET(request: Request) {
  try {
    if (!isLiveMode()) throw validationError("This action isn't available right now. Please try again later.");
    const { supabase, user } = await requireAuth();
    const query = parseSearchParams(new URL(request.url), querySchema);
    await requireOrgMembership(supabase, user, query.organizationId);

    const status = await getOrganizationDriveStatus(supabase, query.organizationId);
    return jsonOk({
      drive: {
        configured: status.configured,
        connectedAccount: status.connectedAccount,
        rootFolderName: status.rootFolderName,
        rootFolderUrl: status.rootFolderUrl,
        connectionError: status.connectionError,
        checkedAt: status.checkedAt,
        migrationReady: status.migrationColumnsAvailable,
        // Never expose raw folder ids or refresh tokens to the browser.
        hasRootFolder: Boolean(status.rootFolderId),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
