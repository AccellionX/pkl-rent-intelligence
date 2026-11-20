import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { backupToken } from "@/lib/google-drive/backup";

describe("Drive backup content identity", () => {
  const base = {
    organizationId: "org-1",
    reportRunId: "rep-1",
    snapshotId: "snap-1",
    version: 1,
    storagePath: "org/rep/final-v1.pdf",
    byteLength: 1000,
  };

  it("changes token when PDF bytes differ at the same size", () => {
    const a = Buffer.alloc(1000, 1);
    const b = Buffer.alloc(1000, 2);
    expect(a.byteLength).toBe(b.byteLength);
    const tokenA = backupToken({
      ...base,
      contentSha256: createHash("sha256").update(a).digest("hex"),
    });
    const tokenB = backupToken({
      ...base,
      contentSha256: createHash("sha256").update(b).digest("hex"),
    });
    expect(tokenA).not.toBe(tokenB);
  });

  it("keeps token stable for identical report identity and content", () => {
    const bytes = Buffer.from("%PDF-1.4 identical");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const first = backupToken({
      ...base,
      byteLength: bytes.byteLength,
      contentSha256: hash,
    });
    const second = backupToken({
      ...base,
      byteLength: bytes.byteLength,
      contentSha256: hash,
    });
    expect(first).toBe(second);
  });

  it("changes token across report versions even with same bytes", () => {
    const hash = createHash("sha256").update("pdf").digest("hex");
    const v1 = backupToken({ ...base, version: 1, contentSha256: hash });
    const v2 = backupToken({ ...base, version: 2, contentSha256: hash });
    expect(v1).not.toBe(v2);
  });
});
