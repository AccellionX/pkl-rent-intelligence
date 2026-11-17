/**
 * Client-facing report payloads must not include prospect PII
 * (names, phone numbers, email addresses).
 */

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

function scanValue(value: unknown, path: string, violations: string[]): void {
  if (value == null) return;

  if (typeof value === "string") {
    if (EMAIL_RE.test(value)) {
      violations.push(`${path}: email-like value`);
    }
    if (PHONE_RE.test(value)) {
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
    throw new Error(
      `Client report payload contains prospect PII: ${result.violations.join("; ")}`,
    );
  }
}
