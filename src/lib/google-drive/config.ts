import "server-only";

/**
 * Server-only Google Drive configuration.
 * Prefer OAuth refresh-token for a dedicated PKL Google account that owns the
 * reports root (works with ordinary My Drive folders). Service accounts cannot
 * write into typical My Drive folders without Shared Drive + explicit grants.
 */

export type GoogleDriveAuthMode = "oauth_refresh_token" | "missing";

export type GoogleDriveConfig = {
  mode: GoogleDriveAuthMode;
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
  /** Optional global fallback root when org has no root configured. */
  defaultRootFolderId: string | null;
  configured: boolean;
};

function trim(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function getGoogleDriveConfig(): GoogleDriveConfig {
  const clientId = trim(process.env.GOOGLE_DRIVE_CLIENT_ID);
  const clientSecret = trim(process.env.GOOGLE_DRIVE_CLIENT_SECRET);
  const refreshToken = trim(process.env.GOOGLE_DRIVE_REFRESH_TOKEN);
  const defaultRootFolderId = trim(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID);

  const configured = Boolean(clientId && clientSecret && refreshToken);

  return {
    mode: configured ? "oauth_refresh_token" : "missing",
    clientId,
    clientSecret,
    refreshToken,
    defaultRootFolderId,
    configured,
  };
}

export function assertGoogleDriveConfigured(): GoogleDriveConfig {
  const config = getGoogleDriveConfig();
  if (!config.configured) {
    throw new Error(
      "Google Drive is not connected. Ask an administrator to complete Drive setup.",
    );
  }
  return config;
}
