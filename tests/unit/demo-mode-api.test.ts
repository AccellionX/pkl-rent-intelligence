import { beforeEach, describe, expect, it, vi } from "vitest";

describe("live API guards in demo mode", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("health endpoint reports demo mode when unset", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.mode).toBe("demo");
    expect(json.data.liveApiEnabled).toBe(false);
  });

  it("property write API rejects unauthenticated demo requests", async () => {
    const { POST } = await import("@/app/api/properties/route");
    const response = await POST(
      new Request("http://localhost/api/properties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: "11111111-1111-4111-8111-111111111111",
          name: "Test",
          addressLine1: "1 Main",
          city: "Providence",
          state: "RI",
          postalCode: "02903",
        }),
      }),
    );
    const json = await response.json();
    expect(response.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("demo_mode");
  });

  it("property list API does not fall back to seed data", async () => {
    const { GET } = await import("@/app/api/properties/route");
    const response = await GET(
      new Request(
        "http://localhost/api/properties?organizationId=11111111-1111-4111-8111-111111111111",
      ),
    );
    const json = await response.json();
    expect(response.status).toBe(503);
    expect(json.error.code).toBe("demo_mode");
    expect(json.data).toBeUndefined();
  });
});
