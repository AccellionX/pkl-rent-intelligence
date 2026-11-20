import { beforeEach, describe, expect, it, vi } from "vitest";

describe("live mode auth guards (no silent seed fallback)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/supabase/server");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_test_key_not_real";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test_key_not_real";
  });

  it("health reports live when public env is present", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.mode).toBe("live");
    expect(json.data.liveApiEnabled).toBe(true);
  });

  it("returns 401 for uploads when session is missing in live mode", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: null },
            error: { message: "no session" },
          }),
        },
      }),
    }));
    const { POST } = await import("@/app/api/uploads/route");
    const form = new FormData();
    form.set("file", new File(["%PDF"], "x.pdf", { type: "application/pdf" }));
    form.set("sourceType", "hellodata_pdf");
    form.set("organizationId", "11111111-1111-4111-8111-111111111111");
    form.set("propertyId", "22222222-2222-4222-8222-222222222222");
    const response = await POST(
      new Request("http://localhost/api/uploads", { method: "POST", body: form }),
    );
    const json = await response.json();
    expect(response.status).toBe(401);
    expect(json.error.code).toBe("unauthorized");
    expect(json.data).toBeUndefined();
  });

  it("returns 401 for report stats when session is missing in live mode", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: null }, error: null }),
        },
      }),
    }));
    const { GET } = await import("@/app/api/reports/[id]/stats/route");
    const response = await GET(new Request("http://localhost/api/reports/x/stats"), {
      params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
    });
    const json = await response.json();
    expect(response.status).toBe(401);
    expect(json.error.code).toBe("unauthorized");
  });
});
