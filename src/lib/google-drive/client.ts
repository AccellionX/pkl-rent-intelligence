import "server-only";

import { createHash } from "node:crypto";
import { google } from "googleapis";
import { Readable } from "node:stream";
import { assertGoogleDriveConfigured, getGoogleDriveConfig } from "@/lib/google-drive/config";
import type {
  DriveFileMeta,
  DriveFolderMeta,
  DriveUploadInput,
  DriveUploadResult,
  GoogleDrivePort,
} from "@/lib/google-drive/types";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const PDF_MIME = "application/pdf";
const DRIVE_SCOPES = (
  process.env.GOOGLE_DRIVE_SCOPES?.trim() ||
  "https://www.googleapis.com/auth/drive.file"
).split(/[\s,]+/).filter(Boolean);

function mapFolder(data: {
  id?: string | null;
  name?: string | null;
  trashed?: boolean | null;
  parents?: string[] | null;
  webViewLink?: string | null;
}): DriveFolderMeta {
  if (!data.id || !data.name) throw new Error("Drive folder metadata incomplete");
  return {
    id: data.id,
    name: data.name,
    trashed: Boolean(data.trashed),
    parents: data.parents ?? undefined,
    webViewLink: data.webViewLink ?? null,
  };
}

function mapFile(data: {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  size?: string | null;
  md5Checksum?: string | null;
  parents?: string[] | null;
  webViewLink?: string | null;
  trashed?: boolean | null;
}): DriveFileMeta {
  if (!data.id || !data.name) throw new Error("Drive file metadata incomplete");
  return {
    id: data.id,
    name: data.name,
    mimeType: data.mimeType ?? "application/octet-stream",
    size: data.size != null ? Number(data.size) : null,
    md5Checksum: data.md5Checksum ?? null,
    parents: data.parents ?? undefined,
    webViewLink: data.webViewLink ?? null,
    trashed: Boolean(data.trashed),
  };
}

export function createGoogleDriveClient(): GoogleDrivePort {
  const config = assertGoogleDriveConfigured();
  const oauth2 = new google.auth.OAuth2(config.clientId!, config.clientSecret!);
  oauth2.setCredentials({
    refresh_token: config.refreshToken!,
    scope: DRIVE_SCOPES.join(" "),
  });
  const drive = google.drive({ version: "v3", auth: oauth2 });

  return {
    async getAboutUser() {
      const res = await drive.about.get({ fields: "user(emailAddress)" });
      return { emailAddress: res.data.user?.emailAddress ?? null };
    },

    async getFolder(folderId: string) {
      const res = await drive.files.get({
        fileId: folderId,
        fields: "id,name,trashed,parents,webViewLink,mimeType",
        supportsAllDrives: true,
      });
      if (res.data.mimeType !== FOLDER_MIME) {
        throw new Error("That Drive item is not a folder");
      }
      return mapFolder(res.data);
    },

    async listChildFolders(parentId: string, nameEquals: string) {
      const escaped = nameEquals.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const q = [
        `'${parentId}' in parents`,
        `mimeType = '${FOLDER_MIME}'`,
        `name = '${escaped}'`,
        "trashed = false",
      ].join(" and ");
      const res = await drive.files.list({
        q,
        fields: "files(id,name,trashed,parents,webViewLink)",
        pageSize: 10,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      return (res.data.files ?? []).map(mapFolder);
    },

    async createFolder({ parentId, name }) {
      const res = await drive.files.create({
        requestBody: {
          name,
          mimeType: FOLDER_MIME,
          parents: [parentId],
        },
        fields: "id,name,trashed,parents,webViewLink",
        supportsAllDrives: true,
      });
      return mapFolder(res.data);
    },

    async findFileByAppProperty({ folderId, key, value }) {
      const escapedKey = key.replace(/[^a-zA-Z0-9_]/g, "");
      const escapedVal = value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const q = [
        `'${folderId}' in parents`,
        "trashed = false",
        `appProperties has { key='${escapedKey}' and value='${escapedVal}' }`,
      ].join(" and ");
      const res = await drive.files.list({
        q,
        fields: "files(id,name,mimeType,size,md5Checksum,parents,webViewLink,trashed)",
        pageSize: 5,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      const first = res.data.files?.[0];
      return first ? mapFile(first) : null;
    },

    async findFileByName({ folderId, name }) {
      const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const q = [
        `'${folderId}' in parents`,
        "trashed = false",
        `name = '${escaped}'`,
        `mimeType = '${PDF_MIME}'`,
      ].join(" and ");
      const res = await drive.files.list({
        q,
        fields: "files(id,name,mimeType,size,md5Checksum,parents,webViewLink,trashed)",
        pageSize: 10,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      const first = res.data.files?.[0];
      return first ? mapFile(first) : null;
    },

    async uploadPdf(input: DriveUploadInput): Promise<DriveUploadResult> {
      const mimeType = input.mimeType ?? PDF_MIME;
      if (input.idempotencyToken) {
        const existing = await this.findFileByAppProperty({
          folderId: input.folderId,
          key: "pkl_backup_token",
          value: input.idempotencyToken,
        });
        if (existing) {
          const verified =
            existing.mimeType === mimeType &&
            (existing.size == null || existing.size === input.bytes.byteLength);
          return { ...existing, created: false, verified };
        }
      }

      // Fallback: same finalized filename already in folder (retry after DB clear).
      // Require matching size AND md5 when Drive returns a checksum — same size with
      // different bytes must upload a new versioned identity, never silently reuse.
      const byName = await this.findFileByName({
        folderId: input.folderId,
        name: input.fileName,
      });
      if (byName && byName.mimeType === mimeType) {
        const sizeOk =
          byName.size == null || byName.size === input.bytes.byteLength;
        const localMd5 = createHash("md5").update(input.bytes).digest("hex");
        const md5Ok =
          !byName.md5Checksum ||
          byName.md5Checksum.toLowerCase() === localMd5.toLowerCase();
        if (sizeOk && md5Ok) {
          return { ...byName, created: false, verified: true };
        }
      }

      const res = await drive.files.create({
        requestBody: {
          name: input.fileName,
          parents: [input.folderId],
          mimeType,
          appProperties: input.idempotencyToken
            ? { pkl_backup_token: input.idempotencyToken }
            : undefined,
        },
        media: {
          mimeType,
          body: Readable.from(Buffer.from(input.bytes)),
        },
        fields: "id,name,mimeType,size,md5Checksum,parents,webViewLink,trashed",
        supportsAllDrives: true,
      });

      const created = mapFile(res.data);
      const verified =
        created.mimeType === mimeType &&
        (created.size == null || created.size === input.bytes.byteLength) &&
        Boolean(created.id);

      // Never set public permissions — leave private to Drive ACLs.
      return { ...created, created: true, verified };
    },

    async getFile(fileId: string) {
      const res = await drive.files.get({
        fileId,
        fields: "id,name,mimeType,size,md5Checksum,parents,webViewLink,trashed",
        supportsAllDrives: true,
      });
      return mapFile(res.data);
    },
  };
}

let singleton: GoogleDrivePort | null = null;

/** Production singleton; tests should inject via function args instead. */
export function getGoogleDrivePort(): GoogleDrivePort {
  if (!getGoogleDriveConfig().configured) {
    throw new Error(
      "Google Drive is not connected. Ask an administrator to complete Drive setup.",
    );
  }
  if (!singleton) singleton = createGoogleDriveClient();
  return singleton;
}

/** Test helper — reset cached client after env changes. */
export function resetGoogleDrivePortForTests(): void {
  singleton = null;
}
