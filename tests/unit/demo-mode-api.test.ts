import { beforeEach, describe, expect, it, vi } from "vitest";

describe("configuration and demo guards (no silent sample fallback)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.PKL_ALLOW_DEMO_MODE;
  });

  it("health endpoint reports unconfigured when public env is unset", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.mode).toBe("unconfigured");
    expect(json.data.liveApiEnabled).toBe(false);
    expect(json.data.supabaseConfigured).toBe(false);
    expect(json.data.missingEnvVarNames).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      ]),
    );
  });

  it("health reports demo only when PKL_ALLOW_DEMO_MODE is explicit", async () => {
    process.env.PKL_ALLOW_DEMO_MODE = "true";
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const json = await response.json();
    expect(json.mode).toBe("demo");
    expect(json.data.demoExplicitlyAllowed).toBe(true);
  });

  it("property write API returns configuration_error when unset (not sample data)", async () => {
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
    expect(json.error.code).toBe("configuration_error");
    expect(json.data).toBeUndefined();
  });

  it("property list API does not fall back to seed data when unconfigured", async () => {
    const { GET } = await import("@/app/api/properties/route");
    const response = await GET(
      new Request(
        "http://localhost/api/properties?organizationId=11111111-1111-4111-8111-111111111111",
      ),
    );
    const json = await response.json();
    expect(response.status).toBe(503);
    expect(json.error.code).toBe("configuration_error");
    expect(json.data).toBeUndefined();
  });
});
