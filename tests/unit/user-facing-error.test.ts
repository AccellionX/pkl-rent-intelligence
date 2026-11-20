import { describe, expect, it } from "vitest";
import { apiErrorMessage, toUserFacingError } from "@/lib/ui/user-facing-error";

describe("toUserFacingError", () => {
  it("maps PostgREST / schema jargon to a friendly message", () => {
    const msg = toUserFacingError(
      "Could not find the table 'public.foo' in the schema cache (PGRST205)",
    );
    expect(msg).not.toMatch(/PGRST|schema cache|Supabase|Postgres/i);
    expect(msg.toLowerCase()).toMatch(/refresh|try again|wrong/);
  });

  it("maps auth failures without exposing 401 or JWT", () => {
    const msg = toUserFacingError("JWT expired — unauthorized (401)");
    expect(msg).not.toMatch(/\b401\b|JWT/i);
    expect(msg.toLowerCase()).toMatch(/sign in/);
  });

  it("maps invalid credentials distinctly from outages", () => {
    expect(toUserFacingError("Invalid login credentials")).toMatch(/email and password/i);
    expect(toUserFacingError("API returned 500")).toMatch(/something went wrong/i);
  });

  it("maps missing AI and geocoding config", () => {
    expect(toUserFacingError("ANTHROPIC_API_KEY is missing")).toMatch(/AI-assisted writing/i);
    expect(toUserFacingError("GOOGLE_GEOCODING_API_KEY not configured")).toMatch(
      /Distance calculation/i,
    );
  });

  it("maps storage and RLS language", () => {
    expect(toUserFacingError("Storage bucket upload failed")).toMatch(/upload your file/i);
    expect(toUserFacingError("RLS policy violation")).toMatch(/permission/i);
  });

  it("strips UUIDs from otherwise usable messages", () => {
    const msg = toUserFacingError(
      "Property 550e8400-e29b-41d4-a716-446655440000 was not found",
    );
    expect(msg).not.toMatch(/550e8400/i);
  });

  it("maps duplicate-key / FK constraint language", () => {
    const msg = toUserFacingError(
      'duplicate key value violates unique constraint "properties_org_name"',
    );
    expect(msg).not.toMatch(/constraint|duplicate key/i);
    expect(msg.toLowerCase()).toMatch(/already exists/);
  });

  it("never returns empty after stripping technical tokens", () => {
    expect(toUserFacingError("PGRST205")).toMatch(/try again|refresh|wrong/i);
  });

  it("uses fallback for blank input", () => {
    expect(toUserFacingError(null, "Custom fallback")).toBe("Custom fallback");
  });

  it("does not leak infrastructure provider names", () => {
    expect(toUserFacingError("Supabase authentication failed")).not.toMatch(/Supabase/i);
    expect(toUserFacingError("Deploy on Vercel failed")).not.toMatch(/Vercel/i);
  });
});

describe("apiErrorMessage", () => {
  it("reads nested API error envelopes", () => {
    const msg = apiErrorMessage(
      { error: { message: "PGRST205: schema cache miss", code: "PGRST205" } },
      "Could not load",
    );
    expect(msg).not.toMatch(/PGRST/i);
  });
});
