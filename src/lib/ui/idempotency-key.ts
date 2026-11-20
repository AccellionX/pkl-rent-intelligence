/** Browser helper: mint once per user action; reuse on retry until success. */

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `idl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function idempotentHeaders(
  key: string | null | undefined,
  extra?: HeadersInit,
): Headers {
  const headers = new Headers(extra);
  if (key) headers.set("Idempotency-Key", key);
  return headers;
}
