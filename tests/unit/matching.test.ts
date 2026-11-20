import { describe, expect, it } from "vitest";
import { matchComparableProperty } from "@/lib/extraction/matching";

const known = [
  {
    id: "comp-harbor",
    name: "Harbor View Apartments",
    addressRaw: "100 Harbor View Dr",
    city: "East Providence",
    state: "RI",
    postalCode: "02914",
  },
  {
    id: "comp-riverside",
    name: "Riverside Court",
    addressRaw: "200 Riverside Ave",
    city: "East Providence",
    state: "RI",
    postalCode: "02915",
  },
  {
    id: "comp-30-main",
    name: "30 Main Street Building",
    addressRaw: "30 Main Street",
    city: "Providence",
    state: "RI",
    postalCode: "02903",
  },
];

describe("comparable property matching", () => {
  it("exact-matches normalized address", () => {
    const result = matchComparableProperty(
      {
        id: "in",
        name: "Harbor View",
        addressRaw: "100 Harbor View Dr",
        city: "East Providence",
        state: "RI",
        postalCode: "02914",
      },
      known,
    );
    expect(result.confidence).toBe("exact");
    expect(result.matchedId).toBe("comp-harbor");
  });

  it("does not false-match same house number on a different street", () => {
    const result = matchComparableProperty(
      {
        id: "in",
        name: "Veterans subject twin",
        addressRaw: "30 Veterans Memorial Pkwy",
        city: "East Providence",
        state: "RI",
        postalCode: "02914",
      },
      known,
    );
    expect(result.matchedId).not.toBe("comp-30-main");
    expect(["none", "weak", "ambiguous"]).toContain(result.confidence);
  });

  it("returns ambiguous when two comps score similarly", () => {
    const twins = [
      {
        id: "a",
        name: "Park Place A",
        addressRaw: "10 Park Place",
        city: "Providence",
        state: "RI",
      },
      {
        id: "b",
        name: "Park Place B",
        addressRaw: "10 Park Place",
        city: "Providence",
        state: "RI",
      },
    ];
    const result = matchComparableProperty(
      {
        id: "in",
        name: "Park Place",
        addressRaw: "10 Park Place",
        city: "Providence",
        state: "RI",
      },
      twins,
    );
    expect(result.confidence).toBe("ambiguous");
    expect(result.matchedId).toBeNull();
    expect(result.ambiguousIds.length).toBeGreaterThanOrEqual(2);
  });

  it("uses aliases when present", () => {
    const withAlias = [
      {
        id: "alias-comp",
        name: "Old Name",
        addressRaw: "999 Nowhere",
        city: "Warwick",
        state: "RI",
        aliasesNormalized: ["100 harbor view dr east providence ri 02914"],
      },
    ];
    const result = matchComparableProperty(
      {
        id: "in",
        addressRaw: "100 Harbor View Dr",
        city: "East Providence",
        state: "RI",
        postalCode: "02914",
      },
      withAlias,
    );
    expect(result.confidence).toBe("exact");
    expect(result.matchedId).toBe("alias-comp");
  });
});
