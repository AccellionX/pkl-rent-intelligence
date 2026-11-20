/**
 * Client-facing report payloads must not include prospect PII
 * (names, phone numbers, email addresses).
 */

import { validationError } from "@/lib/api/errors";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE =
  /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/;

const FORBIDDEN_KEYS = new Set([
  "prospectName",
  "prospect_name",
  "phone",
  "phoneNumber",
  "phone_number",
  "email",
  "emailAddress",
  "email_address",
  "prospectEmail",
  "prospectPhone",
]);

export interface PiiScanResult {
  ok: boolean;
  violations: string[];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Storage object keys / signed URLs often contain digit runs that trip PHONE_RE. */
function isStorageOrAssetPath(path: string, value: string): boolean {
  if (
    /\.(storagePath|photoPaths|signedUrl|storage_path)$/i.test(path) ||
    /photoPaths\[\d+\]$/i.test(path)
  ) {
    return true;
  }
  if (value.includes("/properties/") && /\/(manual|reuse|mls)\//.test(value)) {
    return true;
  }
  if (/^https?:\/\//i.test(value) && /\/storage\/v1\/object\/sign\//i.test(value)) {
    return true;
  }
  return false;
}

/** Internal ids (UUIDs / *Id fields) must not be treated as prospect phone numbers. */
function isInternalIdPath(path: string, value: string): boolean {
  if (UUID_RE.test(value.trim())) return true;
  if (/\.(comparablePropertyId|propertyId|unitTypeId|reportRunId|organizationId|id)$/i.test(path)) {
    return true;
  }
  if (/Id$/i.test(path.split(".").pop() ?? "")) return true;
  return false;
}

function scanValue(value: unknown, path: string, violations: string[]): void {
  if (value == null) return;

  if (typeof value === "string") {
    if (EMAIL_RE.test(value)) {
      violations.push(`${path}: email-like value`);
    }
    if (
      !isStorageOrAssetPath(path, value) &&
      !isInternalIdPath(path, value) &&
      PHONE_RE.test(value)
    ) {
      violations.push(`${path}: phone-like value`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => scanValue(item, `${path}[${index}]`, violations));
    return;
  }

  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      const childPath = path ? `${path}.${key}` : key;
      if (FORBIDDEN_KEYS.has(key)) {
        violations.push(`${childPath}: forbidden PII key`);
      }
      scanValue(child, childPath, violations);
    });
  }
}

/** Returns violations without throwing — used by tests and future snapshot writers. */
export function scanClientReportPayload(payload: unknown): PiiScanResult {
  const violations: string[] = [];
  scanValue(payload, "", violations);
  return { ok: violations.length === 0, violations };
}

export function assertNoClientProspectPii(payload: unknown): void {
  const result = scanClientReportPayload(payload);
  if (!result.ok) {
    throw validationError(
      `Client report payload contains prospect PII. Remove phone-like or email values from titles, names, and unit numbers before generating a client PDF.`,
      { violations: result.violations },
    );
  }
}
