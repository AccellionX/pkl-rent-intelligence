import { describe, expect, it } from "vitest";
import { isProvidence855Subject } from "@/lib/properties/is-providence-855";

describe("isProvidence855Subject", () => {
  it("matches the 855 Providence West Warwick subject", () => {
    expect(
      isProvidence855Subject({
        name: "855 Providence St",
        address_line1: "855 Providence St",
        city: "West Warwick",
        postal_code: "02893",
      }),
    ).toBe(true);
  });

  it("does not match unrelated properties", () => {
    expect(
      isProvidence855Subject({
        name: "Seventeen A Controlled",
        address_line1: "155 Controlled Ave",
        city: "Providence",
        postal_code: "02903",
      }),
    ).toBe(false);
    expect(
      isProvidence855Subject({
        name: "30 Veterans Memorial Parkway",
        address_line1: "30 Veterans Memorial Pkwy",
        city: "East Providence",
        postal_code: "02914",
      }),
    ).toBe(false);
  });
});
