import { describe, expect, it, vi } from "vitest";
import {
  isTransientStorageError,
  withStorageRetry,
} from "@/lib/storage/retry";

describe("storage retry", () => {
  it("detects transient fetch failures", () => {
    expect(isTransientStorageError("Storage upload failed: fetch failed")).toBe(
      true,
    );
    expect(isTransientStorageError("permission denied")).toBe(false);
  });

  it("retries transient errors then succeeds", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce("ok");
    const result = await withStorageRetry(op, {
      attempts: 3,
      baseDelayMs: 1,
    });
    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("does not retry permanent errors", async () => {
    const op = vi.fn().mockRejectedValue(new Error("Bucket not found"));
    await expect(
      withStorageRetry(op, { attempts: 3, baseDelayMs: 1 }),
    ).rejects.toThrow(/Bucket not found/);
    expect(op).toHaveBeenCalledTimes(1);
  });
});
