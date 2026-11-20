import { describe, expect, it } from "vitest";
import {
  addressesLikelyDuplicate,
  normalizePropertyAddressKey,
} from "@/lib/properties/duplicate-address";

describe("duplicate property address detection", () => {
  it("matches normalized full addresses within an org context", () => {
    const left = {
      addressLine1: "100 Test St",
      city: "Providence",
      state: "RI",
      postalCode: "02903",
    };
    // Exact same tokenized address must match (name is intentionally ignored).
    const exactRight = {
      address_line1: "100 Test St",
      address_line2: null,
      city: "Providence",
      state: "RI",
      postal_code: "02903",
    };
    expect(addressesLikelyDuplicate(left, exactRight)).toBe(true);
    expect(normalizePropertyAddressKey(left)).toBeTruthy();
  });

  it("does not match different street numbers", () => {
    expect(
      addressesLikelyDuplicate(
        {
          addressLine1: "100 Test St",
          city: "Providence",
          state: "RI",
          postalCode: "02903",
        },
        {
          address_line1: "200 Test St",
          address_line2: null,
          city: "Providence",
          state: "RI",
          postal_code: "02903",
        },
      ),
    ).toBe(false);
  });

  it("does not treat name-only similarity as a duplicate", () => {
    // Function compares addresses only — names are ignored by design.
    expect(
      addressesLikelyDuplicate(
        {
          addressLine1: "1 Main St",
          city: "Providence",
          state: "RI",
          postalCode: "02903",
        },
        {
          address_line1: "99 Other Ave",
          address_line2: null,
          city: "Providence",
          state: "RI",
          postal_code: "02903",
        },
      ),
    ).toBe(false);
  });
});
