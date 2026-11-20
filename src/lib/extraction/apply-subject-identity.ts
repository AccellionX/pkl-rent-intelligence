import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/domain/database.types";
import type { NormalizedAddressParts } from "./types";
import {
  extractListingUrlsFromText,
  mergeExternalLinksPreserveStaff,
  type ExtractedListingLinks,
} from "./listing-links";

type Client = SupabaseClient<Database>;

export type SubjectIdentityProposal = {
  marketingName?: string | null;
  address?: NormalizedAddressParts | null;
  listingLinks?: ExtractedListingLinks | null;
};

/**
 * Apply extracted subject identity onto the property record without overwriting
 * staff-entered corrections. Empty / missing fields only.
 */
export async function applyExtractedSubjectIdentity(opts: {
  supabase: Client;
  propertyId: string;
  organizationId: string;
  proposal: SubjectIdentityProposal;
}): Promise<{ updated: boolean; fields: string[] }> {
  const { data: property, error } = await opts.supabase
    .from("properties")
    .select(
      "id, organization_id, name, marketing_name, address_line1, city, state, postal_code, external_links",
    )
    .eq("id", opts.propertyId)
    .eq("organization_id", opts.organizationId)
    .maybeSingle();

  if (error || !property) {
    return { updated: false, fields: [] };
  }

  const fields: string[] = [];
  const proposal = opts.proposal;
  let marketingName: string | null | undefined;
  let addressLine1: string | undefined;
  let city: string | undefined;
  let state: string | undefined;
  let postalCode: string | undefined;
  let externalLinks: Json | undefined;

  const marketing = proposal.marketingName?.trim() || null;
  if (marketing && !property.marketing_name?.trim()) {
    marketingName = marketing.slice(0, 200);
    fields.push("marketing_name");
  }

  const addr = proposal.address;
  // Only fill address parts that are blank — never replace a staff street line.
  if (addr?.line1 && !property.address_line1?.trim()) {
    addressLine1 = addr.line1.slice(0, 200);
    fields.push("address_line1");
  }
  if (addr?.city && !property.city?.trim()) {
    city = addr.city.slice(0, 100);
    fields.push("city");
  }
  if (addr?.state && !property.state?.trim()) {
    state = addr.state.slice(0, 3);
    fields.push("state");
  }
  if (addr?.postalCode && !property.postal_code?.trim()) {
    postalCode = addr.postalCode.slice(0, 20);
    fields.push("postal_code");
  }

  const links =
    proposal.listingLinks ??
    (addr?.raw ? extractListingUrlsFromText(addr.raw) : null);
  if (links) {
    const existing = (property.external_links ?? {}) as Record<string, unknown>;
    const { next, changed } = mergeExternalLinksPreserveStaff(existing, links);
    if (changed) {
      externalLinks = next as Json;
      fields.push("external_links");
    }
  }

  if (fields.length === 0) {
    return { updated: false, fields: [] };
  }

  const { error: updErr } = await opts.supabase
    .from("properties")
    .update({
      ...(marketingName !== undefined ? { marketing_name: marketingName } : {}),
      ...(addressLine1 !== undefined ? { address_line1: addressLine1 } : {}),
      ...(city !== undefined ? { city } : {}),
      ...(state !== undefined ? { state } : {}),
      ...(postalCode !== undefined ? { postal_code: postalCode } : {}),
      ...(externalLinks !== undefined ? { external_links: externalLinks } : {}),
    })
    .eq("id", opts.propertyId)
    .eq("organization_id", opts.organizationId);

  if (updErr) {
    return { updated: false, fields: [] };
  }
  return { updated: true, fields };
}
