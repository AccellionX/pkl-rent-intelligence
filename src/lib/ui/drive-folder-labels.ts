/** Staff-facing Google Drive folder / backup copy (no infrastructure jargon). */

export function labelDriveFolderStatus(assigned: boolean, folderName?: string | null): string {
  if (assigned) {
    return folderName?.trim() ? folderName.trim() : "Folder ready";
  }
  return "Not set up yet";
}

export function driveFolderStatusSummary(assigned: boolean): string {
  return assigned
    ? "Completed reports can be saved to this folder automatically."
    : "Reports can still be finalized and downloaded. Set up a folder to enable automatic backup.";
}

export function labelDriveBackupBlocker(raw: string): string {
  if (/folder/i.test(raw)) {
    return "Choose a Google Drive folder for this property first.";
  }
  if (/final pdf|stored/i.test(raw)) {
    return "Store the final PDF before saving to Google Drive.";
  }
  if (/mark|finalized|completed|sent/i.test(raw)) {
    return "Mark the report as completed before saving to Google Drive.";
  }
  return raw;
}

export function isDriveFolderMissingReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return /no google drive folder|assign a google drive folder|folder assigned/i.test(reason);
}
