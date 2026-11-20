import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("auth entry / mode policy", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("lists required public env names when missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.PKL_ALLOW_DEMO_MODE;

    const env = await import("@/lib/supabase/env");
    expect(env.getAppMode()).toBe("unconfigured");
    expect(env.isDemoModeExplicitlyAllowed()).toBe(false);
    expect(env.missingPublicEnvNames()).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  });

  it("does not treat empty strings as configured", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "   ";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    delete process.env.PKL_ALLOW_DEMO_MODE;

    const env = await import("@/lib/supabase/env");
    expect(env.getAppMode()).toBe("unconfigured");
  });
});

describe("login next-path safety", () => {
  function safeNext(raw: string | null): string {
    if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
    if (raw.startsWith("/login")) return "/";
    return raw;
  }

  it("rejects open redirects", () => {
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/buildings")).toBe("/buildings");
    expect(safeNext("/login?x=1")).toBe("/");
  });
});
