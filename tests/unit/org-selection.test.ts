import { describe, expect, it } from "vitest";

/**
 * Mirrors useLiveOrg selection rules without DOM:
 * stored valid membership wins; else suggested (most properties); else first.
 */
function resolveActiveOrganizationId(opts: {
  organizations: Array<{ id: string; propertyCount: number }>;
  storedId: string | null;
  suggestedOrganizationId: string | null;
}): string | null {
  const { organizations, storedId, suggestedOrganizationId } = opts;
  const storedValid =
    storedId && organizations.some((o) => o.id === storedId) ? storedId : null;
  return (
    storedValid ??
    suggestedOrganizationId ??
    organizations.find((o) => o.propertyCount > 0)?.id ??
    organizations[0]?.id ??
    null
  );
}

describe("organization selection", () => {
  const orgs = [
    { id: "empty-org", propertyCount: 0 },
    { id: "full-org", propertyCount: 4 },
    { id: "mid-org", propertyCount: 1 },
  ];

  it("prefers stored membership when valid", () => {
    expect(
      resolveActiveOrganizationId({
        organizations: orgs,
        storedId: "mid-org",
        suggestedOrganizationId: "full-org",
      }),
    ).toBe("mid-org");
  });

  it("falls back to suggested org with properties when storage missing", () => {
    expect(
      resolveActiveOrganizationId({
        organizations: orgs,
        storedId: null,
        suggestedOrganizationId: "full-org",
      }),
    ).toBe("full-org");
  });

  it("ignores stored ids that are not memberships", () => {
    expect(
      resolveActiveOrganizationId({
        organizations: orgs,
        storedId: "foreign-org",
        suggestedOrganizationId: "full-org",
      }),
    ).toBe("full-org");
  });
});
