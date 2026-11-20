import type { Json } from "@/domain/database.types";
import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

const resolveConflictSchema = z.object({
  status: z.enum(["resolved", "ignored"]),
  chosenRent: z.number().positive().optional(),
  verifiedListingSource: z.string().trim().min(1).max(200).optional(),
  verifiedAt: z.string().date().optional(),
  reviewerNote: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    const body = await parseJsonBody(request, resolveConflictSchema);

    const { data: conflict, error } = await supabase
      .from("source_value_conflicts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw validationError("Failed to load conflict", error.message);
    if (!conflict) throw notFoundError("Conflict not found");

    await requireOrgMembership(supabase, user, conflict.organization_id);

    if (conflict.status === "resolved") {
      throw validationError(
        "Conflict already resolved; create a new review note instead of overwriting",
      );
    }

    const chosenValue =
      body.status === "resolved"
        ? ({
            rent: body.chosenRent,
            verifiedListingSource: body.verifiedListingSource ?? null,
            verifiedAt: body.verifiedAt ?? null,
          } as unknown as Json)
        : null;

    if (body.status === "resolved" && body.chosenRent == null) {
      throw validationError("chosenRent is required when resolving a rent conflict");
    }

    const { data: updated, error: updateError } = await supabase
      .from("source_value_conflicts")
      .update({
        status: body.status,
        chosen_value: chosenValue,
        verified_listing_source: body.verifiedListingSource ?? null,
        verified_at: body.verifiedAt ?? null,
        reviewer_user_id: user.id,
        reviewer_note: body.reviewerNote,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      throw validationError("Failed to resolve conflict", updateError.message);
    }

    // If resolved with a chosen rent and linked approved unit data exists, update effective value
    // without deleting historical source observations.
    if (
      body.status === "resolved" &&
      body.chosenRent != null &&
      conflict.comparable_property_id &&
      conflict.unit_type_id
    ) {
      await supabase
        .from("comparable_unit_data")
        .update({
          rent_min: body.chosenRent,
          rent_max: body.chosenRent,
          notes: `Verified rent selected while resolving ${conflict.left_source} vs ${conflict.right_source}: ${body.reviewerNote}`,
        })
        .eq("comparable_property_id", conflict.comparable_property_id)
        .eq("unit_type_id", conflict.unit_type_id)
        .eq("status", "approved");
    }

    return jsonOk({
      conflict: updated,
      note: "Finalized report snapshots are never mutated by conflict resolution",
    });
  } catch (error) {
    return jsonError(error);
  }
}
