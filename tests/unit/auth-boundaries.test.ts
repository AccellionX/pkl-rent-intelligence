import { describe, expect, it, vi } from "vitest";
import { assertSameOrganization } from "@/lib/auth/authorize";
import {
  configurationError,
  demoModeError,
  forbiddenError,
  unauthorizedError,
} from "@/lib/api/errors";

describe("authorization boundaries", () => {
  it("flags cross-organization access", () => {
    expect(() =>
      assertSameOrganization(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ),
    ).toThrow(/Organization boundary/);
  });

  it("allows matching organizations", () => {
    expect(() =>
      assertSameOrganization(
        "11111111-1111-4111-8111-111111111111",
        "11111111-1111-4111-8111-111111111111",
      ),
    ).not.toThrow();
  });

  it("uses distinct API error codes for auth failures", () => {
    expect(unauthorizedError().code).toBe("unauthorized");
    expect(unauthorizedError().status).toBe(401);
    expect(forbiddenError().code).toBe("forbidden");
    expect(forbiddenError().status).toBe(403);
    expect(demoModeError().code).toBe("demo_mode");
    expect(demoModeError().status).toBe(503);
    expect(configurationError().code).toBe("configuration_error");
    expect(configurationError().status).toBe(503);
  });

  it("defaults to unconfigured without Supabase env (no silent demo)", async () => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.PKL_ALLOW_DEMO_MODE;
    const { getAppMode } = await import("@/lib/supabase/env");
    expect(getAppMode()).toBe("unconfigured");
  });
});
