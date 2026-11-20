export type DriveFolderMeta = {
  id: string;
  name: string;
  trashed?: boolean;
  parents?: string[];
  webViewLink?: string | null;
};

export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  size?: number | null;
  md5Checksum?: string | null;
  parents?: string[];
  webViewLink?: string | null;
  trashed?: boolean;
};

export type DriveUploadInput = {
  folderId: string;
  fileName: string;
  bytes: Uint8Array;
  mimeType?: string;
  /** When set, look for an existing non-trashed file with this appProperty first. */
  idempotencyToken?: string;
};

export type DriveUploadResult = DriveFileMeta & {
  created: boolean;
  verified: boolean;
};

/** Injectable Drive port — production uses googleapis; tests use mocks. */
export interface GoogleDrivePort {
  getAboutUser(): Promise<{ emailAddress: string | null }>;
  getFolder(folderId: string): Promise<DriveFolderMeta>;
  listChildFolders(parentId: string, nameEquals: string): Promise<DriveFolderMeta[]>;
  createFolder(opts: {
    parentId: string;
    name: string;
  }): Promise<DriveFolderMeta>;
  findFileByAppProperty(opts: {
    folderId: string;
    key: string;
    value: string;
  }): Promise<DriveFileMeta | null>;
  /** Exact name match in a parent folder (non-trashed). */
  findFileByName(opts: {
    folderId: string;
    name: string;
  }): Promise<DriveFileMeta | null>;
  uploadPdf(input: DriveUploadInput): Promise<DriveUploadResult>;
  getFile(fileId: string): Promise<DriveFileMeta>;
}
