import { PROVIDENCE_855_REFERENCE } from "@/data/855-providence-reference";

/**
 * True when the live property is the 855 Providence reference subject.
 * Used only to gate internal acceptance tooling — never to inject 855 content
 * into unrelated properties.
 */
export function isProvidence855Subject(property: {
  name?: string | null;
  address_line1?: string | null;
  city?: string | null;
  postal_code?: string | null;
}): boolean {
  const addr = (property.address_line1 ?? "").toLowerCase().replace(/\./g, "");
  const name = (property.name ?? "").toLowerCase();
  const city = (property.city ?? "").toLowerCase();
  const postal = (property.postal_code ?? "").trim();
  const refAddr = PROVIDENCE_855_REFERENCE.subject.addressLine1
    .toLowerCase()
    .replace(/\./g, "");
  const refPostal = PROVIDENCE_855_REFERENCE.subject.postalCode;

  const addressMatch =
    addr.includes("855") &&
    addr.includes("providence") &&
    (city.includes("west warwick") || postal === refPostal);
  const nameMatch =
    name.includes("855") &&
    name.includes("providence") &&
    (city.includes("west warwick") || postal === refPostal);

  return Boolean(addressMatch || nameMatch || addr === refAddr.toLowerCase());
}
