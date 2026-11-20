import { z } from "zod";
import { requireOrgMembership } from "@/lib/auth/authorize";
import { requireAuth } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/api/parse";
import { jsonError, jsonOk } from "@/lib/api/response";
import { notFoundError, validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "missing"]).optional(),
  matchTier: z.enum(["strongest", "moderate", "context"]).nullable().optional(),
  daysOnMarket: z.number().int().min(0).max(5000).nullable().optional(),
  reason: z.string().trim().min(1).max(2000).optional(),
  notes: z.string().trim().max(4000).optional(),
});

/**
 * Human-driven update of comparable unit data (status, tier, DOM).
 * Does not invent comps. Approving still requires an intentional status=approved body.
 * DOM edits are audited into notes with provenance — never silent overwrite without a reason.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAuth();
    const body = await parseJsonBody(request, patchSchema);

    if (
      body.status === undefined &&
      body.matchTier === undefined &&
      body.notes === undefined &&
      body.daysOnMarket === undefined
    ) {
      throw validationError("No updatable fields provided");
    }

    const reason =
      body.reason?.trim() ||
      body.notes?.trim() ||
      (body.daysOnMarket !== undefined
        ? "Updated days on market"
        : "Updated comparable review");

    const { data: row, error } = await supabase
      .from("comparable_unit_data")
      .select("id, organization_id, status, match_tier, notes, days_on_market")
      .eq("id", id)
      .maybeSingle();
    if (error) throw validationError("Failed to load comparable unit data", error.message);
    if (!row) throw notFoundError("Comparable unit data not found");

    await requireOrgMembership(supabase, user, row.organization_id);

    const stampParts = [
      `[${new Date().toISOString().slice(0, 10)}] ${reason}`,
    ];
    if (body.daysOnMarket !== undefined) {
      stampParts.push(
        `DOM ${row.days_on_market ?? "—"} → ${body.daysOnMarket ?? "—"}`,
      );
    }
    const stamp = stampParts.join(" · ");
    const nextNotes = [row.notes, body.notes, stamp].filter(Boolean).join(" · ").slice(0, 5000);

    const { data: updated, error: updErr } = await supabase
      .from("comparable_unit_data")
      .update({
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.matchTier !== undefined ? { match_tier: body.matchTier } : {}),
        ...(body.daysOnMarket !== undefined
          ? { days_on_market: body.daysOnMarket }
          : {}),
        notes: nextNotes,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updErr) throw validationError("Failed to update comparable unit data", updErr.message);

    return jsonOk({
      unitData: updated,
      audit: { reviewerUserId: user.id, reason },
    });
  } catch (error) {
    return jsonError(error);
  }
}
