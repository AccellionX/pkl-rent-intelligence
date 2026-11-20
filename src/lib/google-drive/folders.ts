import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domain/database.types";
import { validationError } from "@/lib/api/errors";
import { getGoogleDriveConfig } from "@/lib/google-drive/config";
import { mapGoogleDriveError } from "@/lib/google-drive/errors";
import {
  buildPropertyFolderName,
  driveFolderViewUrl,
} from "@/lib/google-drive/naming";
import type { GoogleDrivePort } from "@/lib/google-drive/types";
import { getGoogleDrivePort } from "@/lib/google-drive/client";

type Client = SupabaseClient<Database>;

export type OrgDriveStatus = {
  configured: boolean;
  authMode: string;
  connectedAccount: string | null;
  rootFolderId: string | null;
  rootFolderName: string | null;
  rootFolderUrl: string | null;
  connectionError: string | null;
  checkedAt: string | null;
  migrationColumnsAvailable: boolean;
};

export type PropertyDriveStatus = {
  folderId: string | null;
  folderName: string | null;
  folderUrl: string | null;
  verifiedAt: string | null;
  accessible: boolean | null;
  accessError: string | null;
};

async function orgHasDriveColumns(supabase: Client): Promise<boolean> {
  // Probe via selecting optional columns; PostgREST errors if missing.
  const { error } = await supabase
    .from("organizations")
    .select("drive_reports_root_folder_id")
    .limit(1);
  if (!error) return true;
  const msg = error.message ?? "";
  if (/drive_reports_root_folder_id|schema cache|column/i.test(msg)) return false;
  return false;
}

export async function getOrganizationDriveStatus(
  supabase: Client,
  organizationId: string,
  drive: GoogleDrivePort | null = null,
): Promise<OrgDriveStatus> {
  const config = getGoogleDriveConfig();
  const migrationColumnsAvailable = await orgHasDriveColumns(supabase);

  let rootFolderId = config.defaultRootFolderId;
  let rootFolderName: string | null = null;
  let connectionError: string | null = null;
  let checkedAt: string | null = null;

  if (migrationColumnsAvailable) {
    const { data } = await supabase
      .from("organizations")
      .select(
        "drive_reports_root_folder_id, drive_reports_root_folder_name, drive_connection_checked_at, drive_connection_error",
      )
      .eq("id", organizationId)
      .maybeSingle();
    if (data?.drive_reports_root_folder_id) {
      rootFolderId = data.drive_reports_root_folder_id;
    }
    rootFolderName = data?.drive_reports_root_folder_name ?? null;
    checkedAt = data?.drive_connection_checked_at ?? null;
    connectionError = data?.drive_connection_error ?? null;
  }

  let connectedAccount: string | null = null;
  if (config.configured) {
    try {
      const port = drive ?? getGoogleDrivePort();
      const about = await port.getAboutUser();
      connectedAccount = about.emailAddress;
      if (rootFolderId) {
        const folder = await port.getFolder(rootFolderId);
        if (folder.trashed) {
          connectionError = "The reports root folder was moved to trash.";
        } else {
          rootFolderName = folder.name;
          connectionError = null;
        }
      }
      checkedAt = new Date().toISOString();
    } catch (error) {
      connectionError = mapGoogleDriveError(
        error,
        "Could not verify Google Drive connection. Please try again.",
      ).message;
      checkedAt = new Date().toISOString();
    }
  } else {
    connectionError =
      "Google Drive is not connected. Ask an administrator to complete Drive setup.";
  }

  if (migrationColumnsAvailable) {
    await supabase
      .from("organizations")
      .update({
        drive_connection_checked_at: checkedAt,
        drive_connection_error: connectionError,
        ...(rootFolderName
          ? { drive_reports_root_folder_name: rootFolderName }
          : {}),
      })
      .eq("id", organizationId);
  }

  return {
    configured: config.configured,
    authMode: config.mode,
    connectedAccount,
    rootFolderId,
    rootFolderName,
    rootFolderUrl: rootFolderId ? driveFolderViewUrl(rootFolderId) : null,
    connectionError,
    checkedAt,
    migrationColumnsAvailable,
  };
}

export async function setOrganizationDriveRoot(opts: {
  supabase: Client;
  organizationId: string;
  folderId: string;
  drive?: GoogleDrivePort;
}): Promise<OrgDriveStatus> {
  const migrationColumnsAvailable = await orgHasDriveColumns(opts.supabase);
  if (!migrationColumnsAvailable) {
    throw validationError(
      "Google Drive folder settings aren’t ready yet. Please contact your administrator.",
    );
  }

  const port = opts.drive ?? getGoogleDrivePort();
  let folder;
  try {
    folder = await port.getFolder(opts.folderId.trim());
  } catch (error) {
    throw mapGoogleDriveError(error, "Could not access that Drive folder.");
  }
  if (folder.trashed) {
    throw validationError("That Drive folder is in the trash.");
  }

  const { error } = await opts.supabase
    .from("organizations")
    .update({
      drive_reports_root_folder_id: folder.id,
      drive_reports_root_folder_name: folder.name,
      drive_connection_checked_at: new Date().toISOString(),
      drive_connection_error: null,
    })
    .eq("id", opts.organizationId);
  if (error) {
    throw validationError("Could not save the reports root folder.", error.message);
  }

  return getOrganizationDriveStatus(opts.supabase, opts.organizationId, port);
}

/**
 * Create (or reuse by name) a reports root folder under My Drive.
 * Required for drive.file OAuth — the app can only access folders it creates.
 */
export async function createOrganizationDriveRootFolder(opts: {
  supabase: Client;
  organizationId: string;
  folderName?: string;
  drive?: GoogleDrivePort;
}): Promise<OrgDriveStatus> {
  const migrationColumnsAvailable = await orgHasDriveColumns(opts.supabase);
  if (!migrationColumnsAvailable) {
    throw validationError(
      "Google Drive folder settings aren’t ready yet. Please contact your administrator.",
    );
  }

  const name = (opts.folderName?.trim() || "PKL DEV Reports").slice(0, 180);
  const port = opts.drive ?? getGoogleDrivePort();

  let existing;
  try {
    existing = await port.listChildFolders("root", name);
  } catch (error) {
    throw mapGoogleDriveError(
      error,
      "Could not check for an existing reports root folder.",
    );
  }

  const folder =
    existing[0] ??
    (await (async () => {
      try {
        return await port.createFolder({ parentId: "root", name });
      } catch (error) {
        throw mapGoogleDriveError(
          error,
          "Could not create the reports root folder in Google Drive.",
        );
      }
    })());

  return setOrganizationDriveRoot({
    supabase: opts.supabase,
    organizationId: opts.organizationId,
    folderId: folder.id,
    drive: port,
  });
}

export async function getPropertyDriveStatus(
  supabase: Client,
  propertyId: string,
  drive: GoogleDrivePort | null = null,
): Promise<PropertyDriveStatus> {
  const { data: property, error } = await supabase
    .from("properties")
    .select("id, drive_folder_id, drive_folder_name, drive_folder_verified_at, name, city, state")
    .eq("id", propertyId)
    .maybeSingle();

  // If new columns missing, fall back to drive_folder_id only.
  if (error && /drive_folder_name|drive_folder_verified/i.test(error.message)) {
    const { data: fallback, error: fbErr } = await supabase
      .from("properties")
      .select("id, drive_folder_id")
      .eq("id", propertyId)
      .maybeSingle();
    if (fbErr || !fallback) {
      throw validationError("Could not load property Drive settings.");
    }
    return verifyPropertyFolderAccess({
      supabase,
      propertyId,
      folderId: fallback.drive_folder_id,
      folderName: null,
      persist: false,
      drive,
    });
  }
  if (error || !property) {
    throw validationError("Could not load property Drive settings.");
  }

  return verifyPropertyFolderAccess({
    supabase,
    propertyId,
    folderId: property.drive_folder_id,
    folderName: property.drive_folder_name ?? null,
    persist: true,
    drive,
  });
}

async function verifyPropertyFolderAccess(opts: {
  supabase: Client;
  propertyId: string;
  folderId: string | null;
  folderName: string | null;
  persist: boolean;
  drive: GoogleDrivePort | null;
}): Promise<PropertyDriveStatus> {
  if (!opts.folderId) {
    return {
      folderId: null,
      folderName: null,
      folderUrl: null,
      verifiedAt: null,
      accessible: null,
      accessError: null,
    };
  }

  if (!getGoogleDriveConfig().configured) {
    return {
      folderId: opts.folderId,
      folderName: opts.folderName,
      folderUrl: driveFolderViewUrl(opts.folderId),
      verifiedAt: null,
      accessible: false,
      accessError: "Google Drive is not connected. Ask an administrator to complete Drive setup.",
    };
  }

  try {
    const port = opts.drive ?? getGoogleDrivePort();
    const folder = await port.getFolder(opts.folderId);
    if (folder.trashed) {
      return {
        folderId: opts.folderId,
        folderName: folder.name,
        folderUrl: driveFolderViewUrl(opts.folderId),
        verifiedAt: new Date().toISOString(),
        accessible: false,
        accessError: "The assigned Drive folder is in the trash.",
      };
    }
    const verifiedAt = new Date().toISOString();
    if (opts.persist) {
      await opts.supabase
        .from("properties")
        .update({
          drive_folder_name: folder.name,
          drive_folder_verified_at: verifiedAt,
        })
        .eq("id", opts.propertyId);
    }
    return {
      folderId: folder.id,
      folderName: folder.name,
      folderUrl: driveFolderViewUrl(folder.id),
      verifiedAt,
      accessible: true,
      accessError: null,
    };
  } catch (error) {
    return {
      folderId: opts.folderId,
      folderName: opts.folderName,
      folderUrl: driveFolderViewUrl(opts.folderId),
      verifiedAt: new Date().toISOString(),
      accessible: false,
      accessError: mapGoogleDriveError(
        error,
        "Could not access the assigned Drive folder.",
      ).message,
    };
  }
}

export async function associatePropertyDriveFolder(opts: {
  supabase: Client;
  propertyId: string;
  folderId: string;
  drive?: GoogleDrivePort;
}): Promise<PropertyDriveStatus> {
  const port = opts.drive ?? getGoogleDrivePort();
  let folder;
  try {
    folder = await port.getFolder(opts.folderId.trim());
  } catch (error) {
    throw mapGoogleDriveError(error, "Could not access that Drive folder.");
  }
  if (folder.trashed) {
    throw validationError("That Drive folder is in the trash.");
  }

  const verifiedAt = new Date().toISOString();
  const { error } = await opts.supabase
    .from("properties")
    .update({
      drive_folder_id: folder.id,
      drive_folder_name: folder.name,
      drive_folder_verified_at: verifiedAt,
    })
    .eq("id", opts.propertyId);

  if (error && /drive_folder_name|drive_folder_verified/i.test(error.message)) {
    const { error: fbErr } = await opts.supabase
      .from("properties")
      .update({ drive_folder_id: folder.id })
      .eq("id", opts.propertyId);
    if (fbErr) throw validationError("Could not save the Drive folder.", fbErr.message);
  } else if (error) {
    throw validationError("Could not save the Drive folder.", error.message);
  }

  return {
    folderId: folder.id,
    folderName: folder.name,
    folderUrl: driveFolderViewUrl(folder.id),
    verifiedAt,
    accessible: true,
    accessError: null,
  };
}

export async function createPropertyDriveFolder(opts: {
  supabase: Client;
  propertyId: string;
  organizationId: string;
  drive?: GoogleDrivePort;
}): Promise<PropertyDriveStatus> {
  const { data: property, error } = await opts.supabase
    .from("properties")
    .select("id, name, city, state, drive_folder_id, organization_id")
    .eq("id", opts.propertyId)
    .maybeSingle();
  if (error || !property) {
    throw validationError("Could not load property.");
  }
  if (property.drive_folder_id) {
    throw validationError(
      "This property already has a Drive folder. Clear it before creating a new one.",
    );
  }

  const orgStatus = await getOrganizationDriveStatus(
    opts.supabase,
    opts.organizationId,
    opts.drive ?? null,
  );
  if (!orgStatus.rootFolderId) {
    throw validationError(
      "Set a reports root folder in Settings before creating a property folder.",
    );
  }

  const port = opts.drive ?? getGoogleDrivePort();
  const folderName = buildPropertyFolderName(
    property.name,
    property.city,
    property.state,
  );

  let existing;
  try {
    existing = await port.listChildFolders(orgStatus.rootFolderId, folderName);
  } catch (error) {
    throw mapGoogleDriveError(error, "Could not check for an existing Drive folder.");
  }

  if (existing.length > 0) {
    // Reuse rather than create a duplicate.
    return associatePropertyDriveFolder({
      supabase: opts.supabase,
      propertyId: opts.propertyId,
      folderId: existing[0]!.id,
      drive: port,
    });
  }

  let created;
  try {
    created = await port.createFolder({
      parentId: orgStatus.rootFolderId,
      name: folderName,
    });
  } catch (error) {
    throw mapGoogleDriveError(error, "Could not create the property Drive folder.");
  }

  return associatePropertyDriveFolder({
    supabase: opts.supabase,
    propertyId: opts.propertyId,
    folderId: created.id,
    drive: port,
  });
}
