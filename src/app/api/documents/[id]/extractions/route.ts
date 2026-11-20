import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();

    const { data: document, error } = await supabase
      .from("source_documents")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw validationError("Failed to load document", error.message);
    if (!document) throw notFoundError("Document not found");

    await requireOrgMembership(supabase, user, document.organization_id);

    const { data: extractions, error: extractError } = await supabase
      .from("extracted_values")
      .select("*")
      .eq("source_document_id", id)
      .order("created_at", { ascending: true });

    if (extractError) {
      throw validationError("Failed to load extractions", extractError.message);
    }

    const { data: decisions } = await supabase
      .from("review_decisions")
      .select("*")
      .in(
        "extracted_value_id",
        (extractions ?? []).map((e) => e.id),
      );

    return jsonOk({
      document,
      extractions: extractions ?? [],
      decisions: decisions ?? [],
    });
  } catch (error) {
    return jsonError(error);
  }
}
