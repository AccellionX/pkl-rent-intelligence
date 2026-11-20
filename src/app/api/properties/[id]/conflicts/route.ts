import { requirePropertyAccess } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: propertyId } = await context.params;
    const { supabase, user } = await requireAuth();
    await requirePropertyAccess(supabase, user, propertyId);

    const status = new URL(request.url).searchParams.get("status");
    let query = supabase
      .from("source_value_conflicts")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });

    if (status === "pending" || status === "resolved" || status === "ignored") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw validationError("Failed to list conflicts", error.message);

    return jsonOk({ conflicts: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}
