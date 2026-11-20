import { ApiError, conflictError, validationError } from "@/lib/api/errors";

/** Map Google / Drive failures to friendly API errors — never raw provider dumps. */

export function mapGoogleDriveError(error: unknown, fallback: string): ApiError {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : fallback;

  const code =
    error && typeof error === "object" && "code" in error
      ? Number((error as { code?: number }).code)
      : NaN;
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status?: number }).status)
      : NaN;
  const http = Number.isFinite(code) ? code : status;

  if (/not configured|not connected|GOOGLE_DRIVE_/i.test(raw)) {
    return validationError(
      "Google Drive is not connected. Ask an administrator to complete Drive setup.",
    );
  }
  if (http === 401 || /invalid_grant|invalid credentials|unauthorized/i.test(raw)) {
    return validationError(
      "Google Drive authorization expired. Reconnect Drive in Settings and try again.",
    );
  }
  if (http === 403 || /insufficientPermissions|accessNotConfigured|forbidden/i.test(raw)) {
    return validationError(
      "Drive access was denied for that folder. Check sharing permissions and try again.",
    );
  }
  if (http === 404 || /not found|File not found|404/i.test(raw)) {
    return validationError(
      "That Drive folder or file could not be found. It may have been moved or deleted.",
    );
  }
  if (http === 429 || /rateLimitExceeded|userRateLimitExceeded/i.test(raw)) {
    return validationError("Google Drive is busy. Wait a moment and try again.");
  }
  if (/network|ECONN|ETIMEDOUT|fetch failed/i.test(raw)) {
    return validationError("Could not reach Google Drive. Check the connection and try again.");
  }
  if (/idempotency|already backed up|fingerprint/i.test(raw)) {
    return conflictError(raw);
  }

  return validationError(fallback);
}

export function driveUserMessage(error: unknown, fallback: string): string {
  return mapGoogleDriveError(error, fallback).message;
}
