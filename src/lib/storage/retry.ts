/**
 * Bounded retry for transient storage / network failures (e.g. "fetch failed").
 * Does not enlarge request timeouts — only retries short-lived connectivity blips.
 */

const TRANSIENT_RE =
  /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|network|temporarily unavailable|502|503|504|timeout/i;

export function isTransientStorageError(message: string): boolean {
  return TRANSIENT_RE.test(message);
}

export async function withStorageRetry<T>(
  operation: () => Promise<T>,
  opts?: {
    attempts?: number;
    baseDelayMs?: number;
    isRetryable?: (error: unknown) => boolean;
  },
): Promise<T> {
  const attempts = Math.max(1, opts?.attempts ?? 3);
  const baseDelayMs = opts?.baseDelayMs ?? 400;
  const isRetryable =
    opts?.isRetryable ??
    ((error: unknown) => {
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === "object" &&
              error &&
              "message" in error &&
              typeof (error as { message: unknown }).message === "string"
            ? (error as { message: string }).message
            : String(error);
      return isTransientStorageError(msg);
    });

  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (i >= attempts - 1 || !isRetryable(error)) throw error;
      const delay = baseDelayMs * Math.pow(2, i) + Math.floor(Math.random() * 100);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

export async function uploadWithRetry(
  upload: () => Promise<{ error: { message: string } | null }>,
  opts?: { attempts?: number; baseDelayMs?: number },
): Promise<void> {
  await withStorageRetry(
    async () => {
      const result = await upload();
      if (result.error) {
        const err = new Error(result.error.message);
        throw err;
      }
    },
    opts,
  );
}
