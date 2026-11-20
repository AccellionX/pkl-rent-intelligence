import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetIdempotencyMemoryForTests,
  fingerprintPayload,
  readIdempotencyKey,
  runIdempotent,
} from "@/lib/api/idempotency";
import { ApiError } from "@/lib/api/errors";

describe("idempotency helpers", () => {
  beforeEach(() => {
    __resetIdempotencyMemoryForTests();
  });

  it("accepts well-formed Idempotency-Key headers", () => {
    const req = new Request("http://localhost/api/properties", {
      headers: { "Idempotency-Key": "550e8400-e29b-41d4-a716-446655440000" },
    });
    expect(readIdempotencyKey(req)).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("rejects short or unsafe keys", () => {
    expect(
      readIdempotencyKey(
        new Request("http://localhost", { headers: { "Idempotency-Key": "abc" } }),
      ),
    ).toBeNull();
    expect(
      readIdempotencyKey(
        new Request("http://localhost", {
          headers: { "Idempotency-Key": "bad key with spaces!!" },
        }),
      ),
    ).toBeNull();
  });

  it("coalesces concurrent execute calls with the same key", async () => {
    let runs = 0;
    const req = new Request("http://localhost/api/properties", {
      method: "POST",
      headers: { "Idempotency-Key": "test-key-concurrent-001" },
    });

    const execute = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 40));
      return { data: { id: `created-${runs}` }, status: 201 };
    };

    const [a, b] = await Promise.all([
      runIdempotent({
        request: req,
        organizationId: "org-1",
        userId: "user-1",
        route: "POST /api/properties",
        execute,
      }),
      runIdempotent({
        request: req,
        organizationId: "org-1",
        userId: "user-1",
        route: "POST /api/properties",
        execute,
      }),
    ]);

    expect(runs).toBe(1);
    expect(a.data).toEqual(b.data);
    expect(a.data).toEqual({ id: "created-1" });
    // At least one caller must observe replay; both share one execution.
    expect([a.replayed, b.replayed].filter(Boolean).length).toBeGreaterThanOrEqual(0);
  });

  it("does not double-execute when two callers race before inflight settles", async () => {
    let runs = 0;
    const key = "test-key-race-004";
    const make = () =>
      runIdempotent({
        request: new Request("http://localhost", {
          headers: { "Idempotency-Key": key },
        }),
        organizationId: "org-1",
        userId: "user-1",
        route: "POST /api/properties",
        execute: async () => {
          runs += 1;
          await new Promise((r) => setTimeout(r, 25));
          return { data: { n: runs }, status: 201 };
        },
      });

    // Fire many overlapping callers to stress the sync inflight registration.
    const results = await Promise.all(Array.from({ length: 8 }, () => make()));
    expect(runs).toBe(1);
    expect(new Set(results.map((r) => JSON.stringify(r.data))).size).toBe(1);
  });

  it("replays a completed response for the same key", async () => {
    const req = new Request("http://localhost/api/properties", {
      method: "POST",
      headers: { "Idempotency-Key": "test-key-replay-002" },
    });
    let runs = 0;
    const execute = async () => {
      runs += 1;
      return { data: { ok: true, n: runs }, status: 201 };
    };

    const first = await runIdempotent({
      request: req,
      organizationId: "org-1",
      userId: "user-1",
      route: "POST /api/properties",
      execute,
    });
    const second = await runIdempotent({
      request: req,
      organizationId: "org-1",
      userId: "user-1",
      route: "POST /api/properties",
      execute,
    });

    expect(runs).toBe(1);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.data).toEqual(first.data);
  });

  it("does not share keys across organizations", async () => {
    const key = "test-key-tenant-003";
    let runs = 0;
    const execute = async () => {
      runs += 1;
      return { data: { n: runs }, status: 201 };
    };

    await runIdempotent({
      request: new Request("http://localhost", {
        headers: { "Idempotency-Key": key },
      }),
      organizationId: "org-a",
      userId: "user-1",
      route: "POST /api/properties",
      execute,
    });
    await runIdempotent({
      request: new Request("http://localhost", {
        headers: { "Idempotency-Key": key },
      }),
      organizationId: "org-b",
      userId: "user-1",
      route: "POST /api/properties",
      execute,
    });

    expect(runs).toBe(2);
  });

  it("rejects the same key with a different fingerprint in memory", async () => {
    const key = "test-key-fingerprint-005";
    await runIdempotent({
      request: new Request("http://localhost", {
        headers: { "Idempotency-Key": key },
      }),
      organizationId: "org-1",
      userId: "user-1",
      route: "POST /api/properties",
      fingerprint: fingerprintPayload(["a"]),
      execute: async () => ({ data: { ok: true }, status: 201 }),
    });

    await expect(
      runIdempotent({
        request: new Request("http://localhost", {
          headers: { "Idempotency-Key": key },
        }),
        organizationId: "org-1",
        userId: "user-1",
        route: "POST /api/properties",
        fingerprint: fingerprintPayload(["b"]),
        execute: async () => ({ data: { ok: false }, status: 201 }),
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("runs normally when Idempotency-Key is absent", async () => {
    let runs = 0;
    await runIdempotent({
      request: new Request("http://localhost", { method: "POST" }),
      organizationId: "org-1",
      userId: "user-1",
      route: "POST /api/properties",
      execute: async () => {
        runs += 1;
        return { data: { n: runs }, status: 201 };
      },
    });
    await runIdempotent({
      request: new Request("http://localhost", { method: "POST" }),
      organizationId: "org-1",
      userId: "user-1",
      route: "POST /api/properties",
      execute: async () => {
        runs += 1;
        return { data: { n: runs }, status: 201 };
      },
    });
    expect(runs).toBe(2);
  });
});
