/** Parse a Drive folder id from a pasted id or Drive URL. */

export function parseDriveFolderId(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // Direct id (Drive folder ids are typically 25–44 chars of URL-safe base64-ish).
  if (/^[A-Za-z0-9_-]{10,128}$/.test(value) && !value.includes("/")) {
    return value;
  }

  try {
    const url = new URL(value);
    const foldersMatch = url.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/);
    if (foldersMatch?.[1]) return foldersMatch[1];
    const idParam = url.searchParams.get("id");
    if (idParam && /^[A-Za-z0-9_-]{10,128}$/.test(idParam)) return idParam;
  } catch {
    // not a URL
  }

  return null;
}
