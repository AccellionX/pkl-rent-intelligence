import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domain/database.types";
import type { OrgAccessContext, OrgMemberRole } from "@/domain/types";
import { forbiddenError, notFoundError } from "@/lib/api/errors";
import type { AuthUserContext } from "@/domain/types";

export async function requireOrgMembership(
  supabase: SupabaseClient<Database>,
  user: AuthUserContext,
  organizationId: string,
): Promise<OrgAccessContext> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw forbiddenError("Unable to verify organization membership");
  }
  if (!data) {
    throw forbiddenError("Not a member of this organization");
  }

  return {
    user,
    organizationId,
    role: data.role as OrgMemberRole,
  };
}

export async function requirePropertyAccess(
  supabase: SupabaseClient<Database>,
  user: AuthUserContext,
  propertyId: string,
): Promise<{ organizationId: string; role: OrgMemberRole }> {
  const { data: property, error } = await supabase
    .from("properties")
    .select("id, organization_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (error) {
    throw forbiddenError("Unable to load property");
  }
  if (!property) {
    // Do not leak cross-tenant existence when RLS hides the row.
    throw notFoundError("Property not found");
  }

  const access = await requireOrgMembership(
    supabase,
    user,
    property.organization_id,
  );

  return {
    organizationId: access.organizationId,
    role: access.role,
  };
}

/**
 * Pure helper for tests: ensures a resource org matches the caller's org.
 */
export function assertSameOrganization(
  resourceOrganizationId: string,
  callerOrganizationId: string,
): void {
  if (resourceOrganizationId !== callerOrganizationId) {
    throw forbiddenError("Organization boundary violation");
  }
}
