import { describe, expect, it } from "vitest";
import { assertSameOrganization } from "@/lib/auth/authorize";
import {
  demoModeError,
  forbiddenError,
  unauthorizedError,
} from "@/lib/api/errors";
import { getAppMode } from "@/lib/supabase/env";

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
  });

  it("defaults to demo mode without Supabase env", () => {
    expect(getAppMode()).toBe("demo");
  });
});
