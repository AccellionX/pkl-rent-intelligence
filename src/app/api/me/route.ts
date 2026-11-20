import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { validationError } from "@/lib/api/errors";
import { isLiveMode } from "@/lib/supabase/env";

/** Current user + organization memberships with property counts (live only). */
export async function GET() {
  try {
    if (!isLiveMode()) {
      throw validationError(
        "The application isn’t fully set up. Please contact your administrator.",
      );
    }
    const { supabase, user } = await requireAuth();

    const { data: memberships, error } = await supabase
      .from("organization_members")
      .select("role, organization_id")
      .eq("user_id", user.id);

    if (error) {
      throw validationError("Failed to load memberships", error.message);
    }

    const orgIds = [...new Set((memberships ?? []).map((m) => m.organization_id))];
    const nameById = new Map<string, string>();
    const propertyCountById = new Map<string, number>();

    if (orgIds.length > 0) {
      const { data: orgs } = await supabase
        .from("organizations")
        .select("id, name")
        .in("id", orgIds);
      for (const o of orgs ?? []) nameById.set(o.id, o.name);

      // Count properties per org for smarter default selection.
      const { data: props } = await supabase
        .from("properties")
        .select("organization_id")
        .in("organization_id", orgIds);
      for (const p of props ?? []) {
        propertyCountById.set(
          p.organization_id,
          (propertyCountById.get(p.organization_id) ?? 0) + 1,
        );
      }
    }

    const organizations = (memberships ?? [])
      .map((m) => ({
        id: m.organization_id,
        name: nameById.get(m.organization_id) ?? "Organization",
        role: m.role,
        propertyCount: propertyCountById.get(m.organization_id) ?? 0,
      }))
      .sort((a, b) => b.propertyCount - a.propertyCount || a.name.localeCompare(b.name));

    const suggestedOrganizationId =
      organizations.find((o) => o.propertyCount > 0)?.id ?? organizations[0]?.id ?? null;

    return jsonOk({
      user: { id: user.id, email: user.email },
      organizations,
      suggestedOrganizationId,
    });
  } catch (error) {
    return jsonError(error);
  }
}
