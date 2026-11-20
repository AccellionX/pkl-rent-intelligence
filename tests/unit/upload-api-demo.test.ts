import { beforeEach, describe, expect, it, vi } from "vitest";

describe("upload API authorization boundaries (no live DB)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.PKL_ALLOW_DEMO_MODE;
  });

  it("rejects uploads when unconfigured without falling back to seed data", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    const form = new FormData();
    form.set(
      "file",
      new File(["address,price\n1 Main,100\n"], "x.csv", { type: "text/csv" }),
    );
    form.set("sourceType", "rentometer_csv");
    form.set("organizationId", "11111111-1111-4111-8111-111111111111");
    form.set("propertyId", "22222222-2222-4222-8222-222222222222");

    const response = await POST(
      new Request("http://localhost/api/uploads", { method: "POST", body: form }),
    );
    const json = await response.json();
    expect(response.status).toBe(503);
    expect(json.error.code).toBe("configuration_error");
    expect(json.data).toBeUndefined();
  });

  it("rejects extraction review when unconfigured", async () => {
    const { POST } = await import("@/app/api/extractions/[id]/review/route");
    const response = await POST(
      new Request("http://localhost/api/extractions/x/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "accepted", reason: "ok" }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    const json = await response.json();
    expect(response.status).toBe(503);
    expect(json.error.code).toBe("configuration_error");
  });
});
