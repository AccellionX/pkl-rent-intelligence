import { normalizeAddress } from "@/lib/extraction/normalize";

export function buildPropertyAddressRaw(parts: {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
}): string {
  return [
    parts.addressLine1,
    parts.addressLine2,
    parts.city,
    parts.state,
    parts.postalCode,
  ]
    .filter((p) => typeof p === "string" && p.trim())
    .join(", ");
}

export function normalizePropertyAddressKey(parts: {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
}): string | null {
  return normalizeAddress(buildPropertyAddressRaw(parts))?.normalized ?? null;
}

export function addressesLikelyDuplicate(
  left: {
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    postalCode: string;
  },
  right: {
    address_line1: string;
    address_line2?: string | null;
    city: string;
    state: string;
    postal_code: string;
  },
): boolean {
  const a = normalizePropertyAddressKey(left);
  const b = normalizePropertyAddressKey({
    addressLine1: right.address_line1,
    addressLine2: right.address_line2,
    city: right.city,
    state: right.state,
    postalCode: right.postal_code,
  });
  return Boolean(a && b && a === b);
}
