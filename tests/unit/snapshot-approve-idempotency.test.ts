import { describe, expect, it } from "vitest";

/**
 * Pure helper mirrors the fingerprint used by createReportContentSnapshot
 * so repeated approvals with the same approved narrative reuse one lock.
 */
function snapshotNarrativeFingerprint(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const narrative = (payload as {
    narrative?: { document?: { approvedAt?: string | null; inputFingerprint?: string | null }; inputFingerprint?: string };
  }).narrative;
  const fp = narrative?.inputFingerprint ?? narrative?.document?.inputFingerprint ?? null;
  const approvedAt = narrative?.document?.approvedAt ?? null;
  if (!fp && !approvedAt) return null;
  return `${fp ?? ""}|${approvedAt ?? ""}`;
}

describe("snapshot approval fingerprint", () => {
  it("matches identical approved narratives for reuse", () => {
    const payload = {
      narrative: {
        inputFingerprint: "abc",
        document: { approvedAt: "2026-11-18T00:00:00.000Z", inputFingerprint: "abc" },
      },
    };
    expect(snapshotNarrativeFingerprint(payload)).toBe("abc|2026-11-18T00:00:00.000Z");
    expect(snapshotNarrativeFingerprint(payload)).toBe(
      snapshotNarrativeFingerprint(structuredClone(payload)),
    );
  });

  it("differs when approval time changes", () => {
    const a = {
      narrative: {
        inputFingerprint: "abc",
        document: { approvedAt: "2026-11-18T00:00:00.000Z" },
      },
    };
    const b = {
      narrative: {
        inputFingerprint: "abc",
        document: { approvedAt: "2026-11-18T01:00:00.000Z" },
      },
    };
    expect(snapshotNarrativeFingerprint(a)).not.toBe(snapshotNarrativeFingerprint(b));
  });
});
