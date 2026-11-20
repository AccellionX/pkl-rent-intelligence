/**
 * Map API / library errors to short professional user-facing copy.
 * Never surface infrastructure providers, HTTP codes, SQL, UUIDs, env vars, or stack traces.
 */

const TECHNICAL_PATTERNS: Array<{ re: RegExp; message: string }> = [
  {
    re: /invalid (login|credentials)|wrong password|email not confirmed|user not found|Invalid email or password/i,
    message: "Unable to sign in. Please check your email and password.",
  },
  {
    re: /JWT|session expired|not authenticated|unauthorized|Auth session|sign.?in required/i,
    message: "Please sign in again to continue.",
  },
  {
    re: /forbidden|403|not a member|organization boundary|RLS|row.?level security|permission denied for/i,
    message: "You do not have permission to access this item.",
  },
  {
    re: /ANTHROPIC|Claude|narrative.*(unavailable|not configured)/i,
    message: "AI-assisted writing is currently unavailable.",
  },
  {
    re: /geocod|GOOGLE_GEOCODING|distance calculation/i,
    message: "Distance calculation is currently unavailable.",
  },
  {
    re: /storage bucket|storage upload|generated-reports|source-documents|Failed to upload|upload failed/i,
    message: "Unable to upload your file. Please try again.",
  },
  {
    re: /No approved immutable snapshot|create a snapshot after narrative|Lock a snapshot after approving/i,
    message: "Approve the narrative and lock a snapshot before storing the final PDF.",
  },
  {
    re: /snapshot.*(validation|immutable|required)|finalization blocked|complete all required/i,
    message: "Please complete all required report details before finalizing.",
  },
  {
    re: /PGRST|schema cache|postgrest|could not find the table|postgres|sqlstate|relation \"/i,
    message: "Something went wrong loading data. Please refresh and try again.",
  },
  {
    re: /foreign key|duplicate key|unique constraint|23505|23503|already exists/i,
    message: "This record already exists.",
  },
  {
    re: /invalid uuid|uuid|invalid input syntax/i,
    message: "The requested item could not be found.",
  },
  {
    re: /not found|404/i,
    message: "The requested item could not be found.",
  },
  {
    re: /live mode|demo mode|PKL_ALLOW_DEMO|sample (data|portfolio)|seeded|mock data/i,
    message: "This action isn’t available right now. Please try again later.",
  },
  {
    re: /configuration_error|not configured|SUPABASE|NEXT_PUBLIC_|SERVICE_ROLE|environment variable|Vercel|API key|access token/i,
    message: "The application isn’t fully set up. Please contact your administrator.",
  },
  {
    re: /Idempotency|fingerprint_mismatch|still processing/i,
    message: "That request is already in progress. Please wait a moment and try again.",
  },
  {
    re: /\b(500|502|503|504)\b|internal server error|unexpected error/i,
    message: "Something went wrong. Please try again.",
  },
  {
    re: /network|Failed to fetch|Load failed|ECONN|ETIMEDOUT|fetch failed/i,
    message: "Network problem. Check your connection and try again.",
  },
  {
    re: /No Google Drive folder|Assign a Google Drive folder|folder assigned to this property/i,
    message: "Choose a Google Drive folder for this property first.",
  },
  {
    re: /GOOGLE_DRIVE_|Gaxios|invalid_grant|Drive is not connected/i,
    message: "Google Drive is not connected. Ask an administrator to complete Drive setup.",
  },
  {
    re: /review_decisions are append-only|Could not delete property|Failed to delete property|Not authorized to delete/i,
    message: "Could not delete this property. Please try again, or contact your administrator.",
  },
];

const FORBIDDEN_TOKEN =
  /\b(Supabase|PostgreSQL|Postgres|PostgREST|PGRST\d*|Vercel|JWT|RLS|UUID|NEXT_PUBLIC_[A-Z0-9_]+|SUPABASE_[A-Z0-9_]+|ANTHROPIC_[A-Z0-9_]+|SERVICE_ROLE|schema cache|Idempotency-Key|storage bucket|demo mode|live mode|sample data|mock data|seeded)\b/i;

export function toUserFacingError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  let raw = "";
  if (typeof error === "string") raw = error;
  else if (error instanceof Error) raw = error.message;
  else if (error && typeof error === "object") {
    const rec = error as Record<string, unknown>;
    if (typeof rec.message === "string") raw = rec.message;
    else if (rec.error && typeof rec.error === "object") {
      const nested = rec.error as Record<string, unknown>;
      if (typeof nested.message === "string") raw = nested.message;
    }
  }

  if (!raw.trim()) return fallback;

  for (const { re, message } of TECHNICAL_PATTERNS) {
    if (re.test(raw)) return message;
  }

  // Strip lingering technical tokens from otherwise usable messages.
  const cleaned = raw
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "")
    .replace(/\bPGRST\d+\b/gi, "")
    .replace(/\b(401|403|404|409|422|429|500|502|503|504)\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (FORBIDDEN_TOKEN.test(cleaned)) return fallback;
  if (!cleaned || cleaned.length < 3) return fallback;
  if (/^[A-Z0-9_]+$/.test(cleaned)) return fallback;
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}…` : cleaned;
}

export function apiErrorMessage(json: unknown, fallback?: string): string {
  if (json && typeof json === "object") {
    const err = (json as { error?: { message?: string; code?: string } }).error;
    if (err?.message) return toUserFacingError(err.message, fallback);
    if (err?.code) return toUserFacingError(err.code, fallback);
  }
  return toUserFacingError(null, fallback);
}
