/** Safe Drive file names for finalized PDFs — no path separators or control chars. */

export function sanitizeDriveNamePart(value: string, max = 80): string {
  return value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max) || "Report";
}

export function buildFinalizedDriveFileName(opts: {
  propertyName: string;
  unitTypeLabel: string;
  periodEnd: string;
  version: number;
  /** Short stable id so distinct report runs do not collide on Drive names. */
  reportId?: string | null;
}): string {
  const property = sanitizeDriveNamePart(opts.propertyName, 60);
  const unit = sanitizeDriveNamePart(opts.unitTypeLabel, 40);
  const date = sanitizeDriveNamePart(opts.periodEnd, 16);
  const idTail = opts.reportId
    ? ` — ${sanitizeDriveNamePart(opts.reportId.replace(/-/g, "").slice(0, 8), 8)}`
    : "";
  return `${property} — ${unit} — ${date} — v${opts.version}${idTail}.pdf`;
}

export function buildPropertyFolderName(propertyName: string, city: string, state: string): string {
  const name = sanitizeDriveNamePart(propertyName, 80);
  const place = sanitizeDriveNamePart(`${city}, ${state}`, 40);
  return `${name} (${place})`;
}

export function driveFileViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

export function driveFolderViewUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}
